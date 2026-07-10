// Фоновый event page: context menu, роутер сообщений popup/options/content,
// проверка host permissions, состояние последней проверки в storage.session.

import { loadSettings, effectiveConfig, PRESETS } from "../shared/settings.js";
import { joinUrl, validateUrl, maskApiKey } from "../shared/validators.js";
import { logger, registerSecret } from "../shared/logger.js";
import { ApiError, toApiError } from "../shared/errors.js";
import { runFactCheck, testConnection } from "./apiClient.js";
import { prepareConfig, ensureOriginPermission } from "./prepare.js";
import { transcribe, makeSilentWav } from "../audio/speechToText.js";
import {
  handleLiveMessage,
  initLiveSessions,
  LIVE_MESSAGE_TYPES,
} from "./liveSession.js";
import { appendHistory, clearHistory } from "./history.js";

const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome
const MENU_ID = "factlens-check-selection";

// ---------- Context menu ----------

async function ensureMenu() {
  try {
    await b.contextMenus.removeAll();
    b.contextMenus.create({
      id: MENU_ID,
      title: "Проверить факты в выделенном тексте",
      contexts: ["selection"],
    });
  } catch (e) {
    logger.warn("contextMenus:", e);
  }
}

b.runtime.onInstalled.addListener(ensureMenu);
if (b.runtime.onStartup) b.runtime.onStartup.addListener(ensureMenu);
ensureMenu();
initLiveSessions();

// ---------- Состояние (storage.session — не пишется на диск) ----------

async function setState(patch) {
  const data = await b.storage.session.get("state");
  const next = { ...(data.state || {}), ...patch, updatedAt: Date.now() };
  await b.storage.session.set({ state: next });
  return next;
}

async function setBadge(text, color) {
  try {
    await b.action.setBadgeText({ text });
    if (color) await b.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    logger.warn("badge:", e);
  }
}

// ---------- Разовая проверка (popup / context menu) ----------

async function handleFactCheck(text, source) {
  await setState({ busy: true, status: "checking", source, lastError: null });
  await setBadge("…", "#6b7280");
  try {
    const cfg = await prepareConfig();
    const result = await runFactCheck(cfg, text);
    await setState({
      busy: false,
      status: "done",
      lastResult: result,
      lastError: null,
    });
    await setBadge(String(result.claims.length), "#2563eb");
    logger.info(`fact-check done: claims=${result.claims.length}`);
    // История — только если пользователь её явно включил.
    appendHistory({
      checkedAt: result.checkedAt,
      source,
      inputPreview: result.inputPreview,
      provider: result.provider,
      model: result.model,
      claims: result.claims,
    }).catch((e) => logger.warn("history:", e));
    return { ok: true, result };
  } catch (e) {
    const err = toApiError(e).toPlain();
    logger.error("fact-check failed:", err);
    await setState({ busy: false, status: "error", lastError: err });
    await setBadge("!", "#dc2626");
    return { ok: false, error: err };
  }
}

async function handleTestConnection(rawSettings) {
  try {
    const cfg = effectiveConfig(rawSettings);
    if (cfg.apiKey) registerSecret(cfg.apiKey);
    await ensureOriginPermission(joinUrl(cfg.baseUrl, cfg.apiPath));
    const result = await testConnection(cfg);
    logger.info(`test connection: ${result.status}`);
    return result;
  } catch (e) {
    const err = toApiError(e);
    return {
      ok: false,
      status: err.type === "permission" ? "cors_or_permission" : "unknown",
      message: err.message,
      technical: err.technical,
      error: err.toPlain(),
    };
  }
}

async function getSummary() {
  const settings = await loadSettings();
  const preset = PRESETS[settings.preset] || {};
  const url = joinUrl(settings.baseUrl, settings.apiPath);
  const parsed = validateUrl(url);
  const stt = settings.stt || {};
  return {
    providerLabel: preset.label || settings.preset,
    model: settings.model,
    maskedKey: maskApiKey(settings.apiKey),
    origin: parsed.ok ? parsed.origin : "",
    endpoint: parsed.ok ? url : "",
    configured: Boolean(
      settings.baseUrl &&
        settings.model &&
        (settings.apiKey || settings.authMode === "none")
    ),
    sttConfigured: Boolean(
      stt.baseUrl && (stt.apiKey || stt.authMode === "none")
    ),
    sttChunkSeconds: stt.chunkSeconds || 20,
  };
}

// ---------- STT (Этап 3) ----------

// Декодируем data:-URL вручную: fetch(data:) недоступен в service worker
// Chrome, а atob работает и там, и в event page Firefox.
function dataUrlToBlob(dataUrl) {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma === -1) throw new ApiError("parse", "Некорректные аудио-данные.");
  const meta = dataUrl.slice(0, comma);
  const mime = (meta.match(/^data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function handleSttChunk(message) {
  try {
    const settings = await loadSettings();
    const stt = effectiveConfig(settings).stt;
    if (!stt.baseUrl || (!stt.apiKey && stt.authMode !== "none")) {
      throw new ApiError(
        "unknown",
        "STT endpoint не настроен. Откройте настройки → «Распознавание речи (STT)».",
        { code: "not_configured" }
      );
    }
    if (stt.apiKey) registerSecret(stt.apiKey);
    await ensureOriginPermission(joinUrl(stt.baseUrl, stt.apiPath));
    const blob = dataUrlToBlob(message.dataUrl);
    const text = await transcribe(stt, blob);
    logger.info(`stt chunk: ${text.length} chars`);
    return { ok: true, text };
  } catch (e) {
    const err = toApiError(e).toPlain();
    logger.error("stt chunk failed:", err);
    return { ok: false, error: err };
  }
}

async function handleTestStt(rawSettings) {
  try {
    const stt = effectiveConfig(rawSettings).stt;
    if (!stt.baseUrl) {
      return { ok: false, status: "unknown", message: "STT base URL не задан." };
    }
    if (stt.apiKey) registerSecret(stt.apiKey);
    await ensureOriginPermission(joinUrl(stt.baseUrl, stt.apiPath));
    const wav = makeSilentWav(600);
    const text = await transcribe(stt, new Blob([wav], { type: "audio/wav" }));
    return {
      ok: true,
      status: "success",
      message: "STT endpoint отвечает.",
      sample: String(text).slice(0, 80),
    };
  } catch (e) {
    const err = toApiError(e);
    return {
      ok: false,
      status: err.type,
      message: err.message,
      technical: err.technical,
    };
  }
}

// ---------- Роутер сообщений ----------

function routeMessage(message, sender) {
  if (LIVE_MESSAGE_TYPES.includes(message.type)) {
    return handleLiveMessage(message, sender);
  }
  switch (message.type) {
    case "runFactCheck":
      return handleFactCheck(String(message.text || ""), message.source || "manual");
    case "testConnection":
      return handleTestConnection(message.settings || {});
    case "getSummary":
      return getSummary();
    case "sttChunk":
      return handleSttChunk(message);
    case "testStt":
      return handleTestStt(message.settings || {});
    case "clearHistory":
      return clearHistory().then(() => ({ ok: true }));
    case "clearBadge":
      return setBadge("", null).then(() => ({ ok: true }));
    default:
      return undefined;
  }
}

// Кросс-браузерный слушатель: Chrome не понимает Promise как возврат
// из onMessage — используем sendResponse + return true в обоих браузерах.
b.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;
  const result = routeMessage(message, sender);
  if (result && typeof result.then === "function") {
    result.then(
      (value) => sendResponse(value),
      (e) => sendResponse({ ok: false, error: toApiError(e).toPlain() })
    );
    return true; // канал остаётся открытым до sendResponse
  }
  return undefined;
});

// ---------- Горячие клавиши (Этап 4) ----------

async function checkSelectionByHotkey() {
  try {
    const [tab] = await b.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) return;
    const results = await b.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection ? window.getSelection() : ""),
    });
    const selection = String(
      (results && results[0] && results[0].result) || ""
    ).trim();
    if (!selection) {
      await setState({
        busy: false,
        status: "error",
        lastError: {
          type: "unknown",
          message:
            "Горячая клавиша: выделите текст на странице и нажмите её снова.",
        },
      });
      await setBadge("!", "#d97706");
      return;
    }
    await handleFactCheck(selection, "selection");
  } catch (e) {
    logger.warn("hotkey:", e);
    await setState({
      busy: false,
      status: "error",
      lastError: {
        type: "permission",
        message:
          "Горячая клавиша не сработала на этой странице. Используйте кнопку в popup.",
      },
    });
    await setBadge("!", "#dc2626");
  }
}

if (b.commands && b.commands.onCommand) {
  b.commands.onCommand.addListener((command) => {
    if (command === "check-selection") checkSelectionByHotkey();
  });
}

// Проверка из контекстного меню: результат кладём в state,
// пользователь открывает popup и видит его там.
b.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = String(info.selectionText || "").trim();
  if (!text) return;
  handleFactCheck(text, "selection");
  // В новых Firefox можно открыть popup прямо из обработчика меню.
  try {
    if (b.action.openPopup) b.action.openPopup().catch(() => {});
  } catch {
    /* не критично: результат появится при открытии popup */
  }
});
