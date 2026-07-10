// Popup: сводка провайдера, проверка выделенного/вставленного текста,
// отображение результата и ошибок. DOM строится без innerHTML.

import { t, verdictLabel } from "../shared/i18n/index.js";

const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome

const els = {
  providerLine: document.getElementById("providerLine"),
  statusText: document.getElementById("statusText"),
  spinner: document.getElementById("spinner"),
  setupHint: document.getElementById("setupHint"),
  btnCheckSelected: document.getElementById("btnCheckSelected"),
  pasteText: document.getElementById("pasteText"),
  btnAnalyze: document.getElementById("btnAnalyze"),
  btnSettings: document.getElementById("btnSettings"),
  errorBox: document.getElementById("errorBox"),
  noticeBox: document.getElementById("noticeBox"),
  resultSection: document.getElementById("resultSection"),
  resultTitle: document.getElementById("resultTitle"),
  claimsList: document.getElementById("claimsList"),
  btnCopy: document.getElementById("btnCopy"),
};

let lastResult = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(node, visible) {
  node.classList.toggle("hidden", !visible);
}

function setStatus(statusKey, busy) {
  els.statusText.textContent = t(`status.${statusKey}`);
  show(els.spinner, Boolean(busy));
  els.btnCheckSelected.disabled = Boolean(busy);
  els.btnAnalyze.disabled = Boolean(busy);
}

function showError(message) {
  els.errorBox.textContent = message || "";
  show(els.errorBox, Boolean(message));
}

function showNotice(message) {
  els.noticeBox.textContent = message || "";
  show(els.noticeBox, Boolean(message));
}

function renderClaim(claim) {
  const details = el("details", `claim v-${claim.verdict}`);
  const summary = el("summary");
  summary.appendChild(el("span", "badge", verdictLabel(claim.verdict)));
  summary.appendChild(
    el("span", "conf", `${t("ui.confidence")}: ${Math.round(claim.confidence * 100)}%`)
  );
  summary.appendChild(el("span", "claim-text", claim.claim));
  details.appendChild(summary);

  const body = el("div", "claim-body");
  if (claim.explanation) body.appendChild(el("p", null, claim.explanation));
  if (claim.speaker && claim.speaker !== "unknown") {
    body.appendChild(el("p", "label", `${t("ui.speaker")}: ${claim.speaker}`));
  }
  if (claim.sources.length) {
    body.appendChild(el("p", "label", `${t("ui.sources")}:`));
    const ul = el("ul");
    for (const src of claim.sources) {
      const li = el("li");
      if (src.url) {
        const a = el("a", null, src.title || src.url);
        a.href = src.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
      } else {
        li.appendChild(el("span", null, src.title));
      }
      if (src.quote) li.appendChild(el("div", "label", `«${src.quote}»`));
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }
  if (claim.needs_manual_review) {
    body.appendChild(el("p", "label", `⚠ ${t("ui.needsReview")}`));
  }
  details.appendChild(body);
  return details;
}

function renderResult(result) {
  lastResult = result;
  els.claimsList.textContent = "";
  if (!result) {
    show(els.resultSection, false);
    return;
  }
  const when = new Date(result.checkedAt).toLocaleTimeString();
  els.resultTitle.textContent = `Результат (${result.claims.length}) · ${when}`;
  if (!result.claims.length) {
    els.claimsList.appendChild(el("p", "label", t("ui.noClaims")));
  } else {
    for (const claim of result.claims) {
      els.claimsList.appendChild(renderClaim(claim));
    }
  }
  if (result.truncated) showNotice(t("ui.truncated"));
  show(els.resultSection, true);
}

function renderState(state) {
  if (!state) return;
  if (state.busy) {
    setStatus("checking", true);
    return;
  }
  setStatus(state.status || "idle", false);
  if (state.lastError) {
    let msg = state.lastError.message || t("test.unknown");
    if (state.lastError.technical) msg += `\n${state.lastError.technical}`;
    showError(msg);
  } else {
    showError("");
  }
  if (state.lastResult) renderResult(state.lastResult);
}

async function loadSummary() {
  try {
    const summary = await b.runtime.sendMessage({ type: "getSummary" });
    if (!summary) return;
    const model = summary.model || "модель не задана";
    els.providerLine.textContent = `${summary.providerLabel} · ${model}`;
    els.providerLine.title = summary.endpoint
      ? `Запросы отправляются на: ${summary.endpoint}`
      : "";
    show(els.setupHint, !summary.configured);
  } catch {
    /* фон мог ещё не подняться — не критично */
  }
}

async function loadState() {
  try {
    const data = await b.storage.session.get("state");
    renderState(data.state);
  } catch {
    /* storage.session недоступен — покажем idle */
  }
}

async function runCheck(text, source) {
  showError("");
  showNotice("");
  setStatus("checking", true);
  try {
    const resp = await b.runtime.sendMessage({ type: "runFactCheck", text, source });
    if (resp && resp.ok) {
      setStatus("done", false);
      renderResult(resp.result);
    } else {
      setStatus("error", false);
      const err = resp && resp.error;
      let msg = (err && err.message) || t("test.unknown");
      if (err && err.technical) msg += `\n${err.technical}`;
      showError(msg);
    }
  } catch (e) {
    setStatus("error", false);
    showError(String((e && e.message) || e));
  }
}

els.btnCheckSelected.addEventListener("click", async () => {
  showError("");
  let selection = "";
  try {
    const [tab] = await b.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      showError(t("ui.noPageAccess"));
      return;
    }
    const results = await b.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection ? window.getSelection() : ""),
    });
    selection = String((results && results[0] && results[0].result) || "").trim();
  } catch (e) {
    showError(
      `${t("ui.noPageAccess")}\nДетали: ${(e && e.message) || e}`
    );
    return;
  }
  if (!selection) {
    showError(t("ui.noSelection"));
    return;
  }
  await runCheck(selection, "selection");
});

document.getElementById("btnCheckVideo").addEventListener("click", async () => {
  showError("");
  try {
    const [tab] = await b.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      showError(t("ui.noPageAccess"));
      return;
    }
    // Всё в ОДНОМ вызове executeScript: активация — последним файлом,
    // в той же песочнице, что и остальные скрипты. Никаких сообщений
    // и повторных вызовов, чья видимость глобалов зависит от браузера.
    const results = await b.scripting.executeScript({
      target: { tabId: tab.id },
      // Пути ОБЯЗАТЕЛЬНО с ведущим "/": Firefox разрешает относительные
      // пути от страницы popup, а не от корня расширения.
      files: [
        "/src/content/contentLib.js",
        "/src/content/overlay.js",
        "/src/content/subtitleExtractors/youtube.js",
        "/src/content/subtitleExtractors/genericCaptions.js",
        "/src/audio/capture.js",
        "/src/content/contentScript.js",
        "/src/content/activate.js",
      ],
    });
    // Firefox кладёт ошибку выполнения скрипта в результат, не в reject.
    const failed = (results || []).find((r) => r && r.error);
    if (failed) {
      const err = failed.error;
      showError(
        `Скрипт на странице упал.\nДетали: ${(err && (err.message || String(err))) || "нет данных"}`
      );
      return;
    }
    window.close();
  } catch (e) {
    showError(
      `${t("ui.noPageAccess")}\nДетали: ${(e && e.message) || e}. Если страница была открыта до обновления расширения — обновите её (F5).`
    );
  }
});

els.btnAnalyze.addEventListener("click", async () => {
  const text = els.pasteText.value.trim();
  if (!text) {
    showError(t("ui.emptyText"));
    return;
  }
  await runCheck(text, "manual");
});

els.btnSettings.addEventListener("click", () => {
  b.runtime.openOptionsPage();
});

document.getElementById("btnHelp").addEventListener("click", () => {
  b.tabs.create({ url: b.runtime.getURL("src/help/help.html") });
});

els.btnCopy.addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(lastResult.claims, null, 2)
    );
    els.btnCopy.textContent = t("ui.copied");
    setTimeout(() => {
      els.btnCopy.textContent = "Копировать JSON";
    }, 1500);
  } catch {
    /* clipboard может быть недоступен */
  }
});

// Живое обновление, пока проверка идёт в фоне.
b.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.state) {
    renderState(changes.state.newValue);
  }
});

setStatus("idle", false);
loadSummary();
loadState();
b.runtime.sendMessage({ type: "clearBadge" }).catch(() => {});
