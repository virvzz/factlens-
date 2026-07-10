// Overlay поверх страницы (ТЗ 11.3): статус, provider/model, карточки
// claims с цветовой маркировкой, pause/resume, копирование, report.
// Изолирован через Shadow DOM, DOM строится без innerHTML для данных.

(function () {
  "use strict";

  // Всегда перезаписываем (см. contentLib.js).
  const VERDICT_LABELS = {
    TRUE: "Верно",
    MOSTLY_TRUE: "В основном верно",
    MISLEADING: "Вводит в заблуждение",
    FALSE: "Ложно",
    UNVERIFIABLE: "Невозможно проверить",
    OPINION_NOT_CHECK_WORTHY: "Мнение",
  };

  const VERDICT_COLORS = {
    TRUE: "#16a34a",
    MOSTLY_TRUE: "#65a30d",
    MISLEADING: "#d97706",
    FALSE: "#dc2626",
    UNVERIFIABLE: "#6b7280",
    OPINION_NOT_CHECK_WORTHY: "#64748b",
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel {
      position: fixed; top: 70px; right: 16px; z-index: 2147483646;
      width: 360px; max-height: 75vh; display: flex; flex-direction: column;
      background: #1f2430; color: #e5e7eb; border: 1px solid #374151;
      border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .head {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-bottom: 1px solid #374151; cursor: default;
    }
    .logo { width: 12px; height: 12px; border-radius: 3px; flex: none;
      background: linear-gradient(135deg,#2563eb,#7c3aed); }
    .title { font-weight: 700; }
    .meta { color: #9ca3af; font-size: 11px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .head button {
      background: none; border: 1px solid #374151; color: #e5e7eb;
      border-radius: 6px; padding: 2px 8px; cursor: pointer; font: inherit;
      font-size: 12px; flex: none;
    }
    .head button:hover { border-color: #60a5fa; }
    .statusbar {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; font-size: 12px; color: #9ca3af;
      border-bottom: 1px solid #374151;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex: none; }
    .dot.reading { background: #60a5fa; }
    .dot.checking { background: #f59e0b; animation: fl-pulse 1s infinite; }
    .dot.error { background: #dc2626; }
    .dot.paused { background: #9ca3af; }
    @keyframes fl-pulse { 50% { opacity: .4; } }
    .body { overflow-y: auto; padding: 10px 12px; flex: 1; }
    .msg { color: #9ca3af; font-size: 12px; margin: 6px 0; white-space: pre-wrap; }
    .err { color: #fca5a5; font-size: 12px; margin: 6px 0; white-space: pre-wrap; }
    .srcbtn {
      display: block; width: 100%; margin: 6px 0; padding: 8px 10px;
      background: #2563eb; color: #fff; border: none; border-radius: 8px;
      font: inherit; font-weight: 600; cursor: pointer; text-align: left;
    }
    .srcbtn.secondary { background: #374151; }
    .srcbtn:hover { filter: brightness(1.1); }
    .claim {
      border: 1px solid #374151; border-left: 4px solid #6b7280;
      border-radius: 8px; padding: 6px 8px; margin-bottom: 6px;
    }
    .claim summary { cursor: pointer; list-style: none; display: flex;
      gap: 6px; align-items: baseline; flex-wrap: wrap; }
    .claim summary::-webkit-details-marker { display: none; }
    .badge { font-size: 10px; font-weight: 700; padding: 1px 6px;
      border-radius: 999px; color: #fff; white-space: nowrap; }
    .conf { color: #9ca3af; font-size: 10px; }
    .ctext { flex: 1 1 100%; margin-top: 2px; }
    .cbody { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #374151;
      font-size: 12px; color: #cbd5e1; }
    .cbody p { margin: 4px 0; }
    .cbody a { color: #93c5fd; word-break: break-all; }
    .cbody .lbl { color: #9ca3af; }
    .rowbtns { display: flex; gap: 6px; margin-top: 6px; }
    .rowbtns button { background: none; border: 1px solid #374151;
      color: #9ca3af; border-radius: 6px; padding: 2px 8px; cursor: pointer;
      font: inherit; font-size: 11px; }
    .rowbtns button:hover { color: #e5e7eb; border-color: #60a5fa; }
    .foot {
      padding: 8px 12px; border-top: 1px solid #374151; color: #9ca3af;
      font-size: 10px;
    }
  `;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  class Overlay {
    constructor(callbacks) {
      this.cb = callbacks || {};
      this.host = null;
      this.els = {};
      this.paused = false;
    }

    mount() {
      if (this.host) return;
      // Убираем панели, оставшиеся от предыдущих версий скрипта.
      document
        .querySelectorAll("factlens-overlay")
        .forEach((el) => el.remove());
      this.host = document.createElement("factlens-overlay");
      const root = this.host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = CSS;
      root.appendChild(style);

      const panel = el("div", "panel");

      const head = el("div", "head");
      head.appendChild(el("span", "logo"));
      head.appendChild(el("span", "title", "FactLens"));
      const meta = el("span", "meta", "");
      head.appendChild(meta);
      const btnPause = el("button", null, "⏸");
      btnPause.title = "Пауза/продолжить";
      btnPause.addEventListener("click", () => {
        if (this.paused) this.cb.onResume && this.cb.onResume();
        else this.cb.onPause && this.cb.onPause();
      });
      const btnCopy = el("button", null, "⧉");
      btnCopy.title = "Копировать все результаты (JSON)";
      btnCopy.addEventListener("click", () => this.cb.onCopy && this.cb.onCopy());
      const btnClose = el("button", null, "✕");
      btnClose.title = "Остановить и закрыть";
      btnClose.addEventListener("click", () => this.cb.onClose && this.cb.onClose());
      head.appendChild(btnPause);
      head.appendChild(btnCopy);
      head.appendChild(btnClose);
      panel.appendChild(head);

      const statusbar = el("div", "statusbar");
      const dot = el("span", "dot");
      const statusText = el("span", null, "Ожидание");
      const counter = el("span", null, "");
      counter.style.marginLeft = "auto";
      statusbar.appendChild(dot);
      statusbar.appendChild(statusText);
      statusbar.appendChild(counter);
      panel.appendChild(statusbar);

      const body = el("div", "body");
      panel.appendChild(body);

      const foot = el(
        "div",
        "foot",
        "Автоматический фактчекинг может ошибаться. Не используйте результат как окончательный источник истины."
      );
      panel.appendChild(foot);

      root.appendChild(panel);
      document.documentElement.appendChild(this.host);
      this.els = { meta, dot, statusText, counter, body, btnPause };
    }

    unmount() {
      if (this.host) {
        this.host.remove();
        this.host = null;
      }
    }

    setMeta(text) {
      if (this.els.meta) {
        this.els.meta.textContent = text || "";
        this.els.meta.title = text || "";
      }
    }

    setStatus(kind, text) {
      if (!this.els.dot) return;
      this.els.dot.className = `dot ${kind}`;
      this.els.statusText.textContent = text;
    }

    setCounter(text) {
      if (this.els.counter) this.els.counter.textContent = text || "";
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (this.els.btnPause) this.els.btnPause.textContent = this.paused ? "▶" : "⏸";
    }

    clearBody() {
      if (this.els.body) this.els.body.textContent = "";
    }

    showMessage(text, isError) {
      this.clearBody();
      this.els.body.appendChild(el("div", isError ? "err" : "msg", text));
    }

    /** Экран выбора источника: [{label, secondary, onClick}] */
    showSources(options, note) {
      this.clearBody();
      if (note) this.els.body.appendChild(el("div", "msg", note));
      for (const opt of options) {
        const btn = el("button", `srcbtn${opt.secondary ? " secondary" : ""}`, opt.label);
        btn.addEventListener("click", opt.onClick);
        this.els.body.appendChild(btn);
      }
    }

    renderClaims(claims, lastError) {
      this.clearBody();
      if (lastError) {
        this.els.body.appendChild(
          el("div", "err", `Ошибка: ${lastError.message || lastError}`)
        );
      }
      if (!claims || !claims.length) {
        this.els.body.appendChild(
          el("div", "msg", "Пока нет проверенных утверждений. Слушаю субтитры…")
        );
        return;
      }
      // Новые сверху.
      for (let i = claims.length - 1; i >= 0; i--) {
        this.els.body.appendChild(this.renderClaim(claims[i]));
      }
    }

    renderClaim(claim) {
      const details = el("details", "claim");
      details.style.borderLeftColor = VERDICT_COLORS[claim.verdict] || "#6b7280";
      const summary = el("summary");
      const badge = el("span", "badge", VERDICT_LABELS[claim.verdict] || claim.verdict);
      badge.style.background = VERDICT_COLORS[claim.verdict] || "#6b7280";
      summary.appendChild(badge);
      summary.appendChild(
        el("span", "conf", `${Math.round((claim.confidence || 0) * 100)}%`)
      );
      summary.appendChild(el("span", "ctext", claim.claim));
      details.appendChild(summary);

      const body = el("div", "cbody");
      if (claim.explanation) body.appendChild(el("p", null, claim.explanation));
      if (claim.speaker && claim.speaker !== "unknown") {
        body.appendChild(el("p", "lbl", `Кто утверждает: ${claim.speaker}`));
      }
      if (claim.sources && claim.sources.length) {
        body.appendChild(el("p", "lbl", "Источники:"));
        for (const src of claim.sources) {
          const p = el("p");
          if (src.url) {
            const a = el("a", null, src.title || src.url);
            a.href = src.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            p.appendChild(a);
          } else {
            p.appendChild(el("span", null, src.title || ""));
          }
          body.appendChild(p);
        }
      }
      if (claim.needs_manual_review) {
        body.appendChild(el("p", "lbl", "⚠ Требует ручной проверки"));
      }
      const rowbtns = el("div", "rowbtns");
      const btnReport = el("button", null, "Сообщить об ошибке");
      btnReport.addEventListener("click", () => {
        if (this.cb.onReport) this.cb.onReport(claim);
        btnReport.textContent = "Скопировано в буфер";
        setTimeout(() => (btnReport.textContent = "Сообщить об ошибке"), 1600);
      });
      rowbtns.appendChild(btnReport);
      body.appendChild(rowbtns);

      details.appendChild(body);
      return details;
    }
  }

  globalThis.FactLensOverlay = Overlay;
})();
