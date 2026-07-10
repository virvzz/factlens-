// Sidebar (Этап 4): live-сессия активной вкладки, последняя проверка,
// история (если включена). Обновляется по событиям storage/tabs.

import { t, verdictLabel } from "../shared/i18n/index.js";

const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome

const els = {
  providerLine: document.getElementById("providerLine"),
  liveBox: document.getElementById("liveBox"),
  lastBox: document.getElementById("lastBox"),
  historyBox: document.getElementById("historyBox"),
  historyState: document.getElementById("historyState"),
  btnSettings: document.getElementById("btnSettings"),
  btnHelp: document.getElementById("btnHelp"),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function claimCard(claim) {
  const details = el("details", `claim v-${claim.verdict}`);
  const summary = el("summary");
  summary.appendChild(el("span", "badge", verdictLabel(claim.verdict)));
  summary.appendChild(
    el("span", "conf", `${Math.round((claim.confidence || 0) * 100)}%`)
  );
  summary.appendChild(el("span", "ctext", claim.claim));
  details.appendChild(summary);
  const body = el("div", "cbody");
  if (claim.explanation) body.appendChild(el("p", null, claim.explanation));
  if (claim.speaker && claim.speaker !== "unknown") {
    body.appendChild(el("p", "lbl", `${t("ui.speaker")}: ${claim.speaker}`));
  }
  for (const src of claim.sources || []) {
    const p = el("p");
    if (src.url) {
      const a = el("a", null, src.title || src.url);
      a.href = src.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      p.appendChild(a);
    } else if (src.title) {
      p.appendChild(el("span", "lbl", src.title));
    }
    if (p.childNodes.length) body.appendChild(p);
  }
  if (claim.needs_manual_review) {
    body.appendChild(el("p", "lbl", `⚠ ${t("ui.needsReview")}`));
  }
  details.appendChild(body);
  return details;
}

function fillClaims(box, claims, emptyText) {
  box.textContent = "";
  if (!claims || !claims.length) {
    box.appendChild(el("p", "muted", emptyText));
    return;
  }
  for (let i = claims.length - 1; i >= 0; i--) {
    box.appendChild(claimCard(claims[i]));
  }
}

async function activeTabId() {
  try {
    const [tab] = await b.tabs.query({ active: true, currentWindow: true });
    return tab ? tab.id : undefined;
  } catch {
    return undefined;
  }
}

async function render() {
  // Сводка провайдера.
  try {
    const summary = await b.runtime.sendMessage({ type: "getSummary" });
    if (summary) {
      els.providerLine.textContent = `${summary.providerLabel} · ${
        summary.model || "модель не задана"
      }`;
    }
  } catch {
    /* фон ещё не поднялся */
  }

  // Live-сессия активной вкладки.
  const tabId = await activeTabId();
  let live = null;
  if (tabId !== undefined) {
    try {
      const data = await b.storage.session.get(`live_${tabId}`);
      live = data[`live_${tabId}`] || null;
    } catch {
      /* session storage недоступен */
    }
  }
  if (live && live.claims) {
    fillClaims(els.liveBox, live.claims, "Сессия идёт, утверждений пока нет.");
    const status = el(
      "p",
      "muted",
      `Статус: ${t(`status.${live.status}`) || live.status}` +
        (live.paused ? " (пауза)" : "") +
        ` · проверено фрагментов: ${live.processed || 0}`
    );
    els.liveBox.prepend(status);
  } else {
    els.liveBox.textContent = "";
    els.liveBox.appendChild(
      el(
        "p",
        "muted",
        "Нет активной live-сессии. Запустите её через popup → «🎬 Live-проверка видео»."
      )
    );
  }

  // Последняя разовая проверка.
  try {
    const data = await b.storage.session.get("state");
    const st = data.state;
    if (st && st.lastResult) {
      fillClaims(els.lastBox, st.lastResult.claims, t("ui.noClaims"));
    }
  } catch {
    /* нет состояния */
  }

  // История.
  try {
    const settingsData = await b.storage.local.get("settings");
    const enabled = Boolean(
      settingsData.settings && settingsData.settings.historyEnabled
    );
    els.historyState.textContent = enabled ? "" : "(выключена)";
    if (!enabled) {
      els.historyBox.textContent = "";
      els.historyBox.appendChild(
        el("p", "muted", "Включается в настройках → «Данные».")
      );
      return;
    }
    const histData = await b.storage.local.get("history");
    const history = Array.isArray(histData.history) ? histData.history : [];
    els.historyBox.textContent = "";
    if (!history.length) {
      els.historyBox.appendChild(el("p", "muted", "История пуста."));
      return;
    }
    for (const entry of history) {
      const details = el("details", "hist-entry");
      const when = new Date(entry.checkedAt).toLocaleString();
      const summary = el(
        "summary",
        null,
        `${when} · ${entry.claims.length} утв. · ${entry.inputPreview || entry.source}`
      );
      details.appendChild(summary);
      const list = el("div", "hist-claims");
      for (const claim of entry.claims) list.appendChild(claimCard(claim));
      details.appendChild(list);
      els.historyBox.appendChild(details);
    }
  } catch {
    /* истории нет */
  }
}

els.btnSettings.addEventListener("click", () => b.runtime.openOptionsPage());
els.btnHelp.addEventListener("click", () => {
  b.tabs.create({ url: b.runtime.getURL("src/help/help.html") });
});

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 200);
}

b.storage.onChanged.addListener(scheduleRender);
if (b.tabs.onActivated) b.tabs.onActivated.addListener(scheduleRender);

render();
