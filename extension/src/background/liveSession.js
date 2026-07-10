// Live-сессии (Этап 2): очередь фрагментов по вкладкам, последовательная
// проверка, дедупликация claims, pause/resume, восстановление после
// выгрузки event page через storage.session.

import { toApiError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { runFactCheck } from "./apiClient.js";
import { prepareConfig } from "./prepare.js";
import { appendHistory } from "./history.js";
import "../content/contentLib.js"; // side-effect: globalThis.FactLensLib

const lib = globalThis.FactLensLib;
const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome

const MAX_QUEUE = 50;
const MAX_CLAIMS = 300;
const CHUNK_MAX_CHARS = 900;
const DELAY_BETWEEN_CHUNKS_MS = 300;

export const LIVE_MESSAGE_TYPES = [
  "queueFragments",
  "livePause",
  "liveResume",
  "liveStop",
  "getLiveSession",
];

/** @type {Map<number, object>} */
const sessions = new Map();

function storageKey(tabId) {
  return `live_${tabId}`;
}

function claimKey(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function newSession(tabId) {
  return {
    tabId,
    status: "idle", // idle | checking | error
    paused: false,
    queue: [],
    claims: [],
    seen: new Set(),
    processed: 0,
    lastError: null,
    provider: "",
    model: "",
    processing: false,
  };
}

async function getSession(tabId) {
  let s = sessions.get(tabId);
  if (s) return s;
  s = newSession(tabId);
  // Восстановление после выгрузки event page.
  try {
    const data = await b.storage.session.get(storageKey(tabId));
    const saved = data[storageKey(tabId)];
    if (saved) {
      Object.assign(s, saved);
      s.processing = false;
      s.seen = new Set((s.claims || []).map((c) => claimKey(c.claim)));
    }
  } catch {
    /* storage.session мог быть недоступен — начинаем с чистой сессии */
  }
  sessions.set(tabId, s);
  return s;
}

function publicView(s) {
  return {
    status: s.status,
    paused: s.paused,
    queueLength: s.queue.length,
    processed: s.processed,
    claims: s.claims,
    lastError: s.lastError,
    provider: s.provider,
    model: s.model,
  };
}

async function persistAndNotify(s) {
  const snapshot = {
    status: s.status,
    paused: s.paused,
    queue: s.queue,
    claims: s.claims,
    processed: s.processed,
    lastError: s.lastError,
    provider: s.provider,
    model: s.model,
  };
  try {
    await b.storage.session.set({ [storageKey(s.tabId)]: snapshot });
  } catch {
    /* не критично */
  }
  try {
    await b.tabs.sendMessage(s.tabId, {
      type: "liveUpdate",
      session: publicView(s),
    });
  } catch {
    /* вкладка могла закрыться или контент-скрипт выгружен */
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setFatal(s, err) {
  s.paused = true;
  s.status = "error";
  s.lastError = toApiError(err).toPlain();
}

async function processQueue(s) {
  if (s.processing) return;
  s.processing = true;
  try {
    while (s.queue.length && !s.paused) {
      s.status = "checking";
      await persistAndNotify(s);

      let cfg;
      try {
        cfg = await prepareConfig();
      } catch (e) {
        setFatal(s, e);
        break;
      }
      s.provider = cfg.presetLabel;
      s.model = cfg.model;

      const chunk = s.queue[0];
      try {
        const result = await runFactCheck(cfg, chunk);
        s.queue.shift();
        s.processed++;
        for (const claim of result.claims) {
          const key = claimKey(claim.claim);
          if (s.seen.has(key)) continue;
          s.seen.add(key);
          s.claims.push(claim);
        }
        if (s.claims.length > MAX_CLAIMS) {
          s.claims = s.claims.slice(-MAX_CLAIMS);
        }
        s.lastError = null;
      } catch (e) {
        const err = toApiError(e);
        if (err.type === "auth" || err.type === "permission") {
          // Фатально: без ключа/разрешения продолжать нет смысла.
          setFatal(s, err);
          break;
        }
        // Нефатально: пропускаем чанк и идём дальше.
        s.queue.shift();
        s.lastError = err.toPlain();
        logger.warn("live: чанк пропущен из-за ошибки:", err.toPlain());
      }
      await delay(DELAY_BETWEEN_CHUNKS_MS);
    }
  } finally {
    s.processing = false;
    if (s.status !== "error") s.status = "idle";
    await persistAndNotify(s);
  }
}

/** Роутер live-сообщений; вызывается из background.js. */
export async function handleLiveMessage(message, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId === undefined || tabId === null) {
    return { ok: false, error: { message: "Нет вкладки-отправителя." } };
  }
  const s = await getSession(tabId);

  switch (message.type) {
    case "queueFragments": {
      let fragments = (message.fragments || [])
        .map((f) => String(f || "").trim())
        .filter(Boolean);
      if (message.needsChunking) {
        fragments = fragments.flatMap((f) =>
          lib.splitIntoChunks(f, CHUNK_MAX_CHARS)
        );
      }
      for (const fragment of fragments) {
        if (s.queue.length >= MAX_QUEUE) {
          s.lastError = {
            type: "unknown",
            message: "Очередь переполнена — часть фрагментов пропущена.",
          };
          break;
        }
        s.queue.push(fragment);
      }
      processQueue(s); // фоновая обработка, не ждём
      await persistAndNotify(s);
      return { ok: true, queued: s.queue.length };
    }
    case "livePause":
      s.paused = true;
      await persistAndNotify(s);
      return { ok: true };
    case "liveResume":
      s.paused = false;
      if (s.status === "error") s.status = "idle";
      s.lastError = null;
      processQueue(s);
      await persistAndNotify(s);
      return { ok: true };
    case "liveStop":
      // Итог live-сессии — в историю (только если она включена).
      if (s.claims.length) {
        appendHistory({
          checkedAt: Date.now(),
          source: "live",
          inputPreview: `Live-сессия: ${s.processed} фрагментов`,
          provider: s.provider,
          model: s.model,
          claims: s.claims,
        }).catch((e) => logger.warn("history:", e));
      }
      sessions.delete(tabId);
      try {
        await b.storage.session.remove(storageKey(tabId));
      } catch {
        /* не критично */
      }
      return { ok: true };
    case "getLiveSession":
      return publicView(s);
    default:
      return { ok: false };
  }
}

/** Очистка сессий при закрытии вкладок. */
export function initLiveSessions() {
  b.tabs.onRemoved.addListener((tabId) => {
    sessions.delete(tabId);
    b.storage.session.remove(storageKey(tabId)).catch(() => {});
  });
}
