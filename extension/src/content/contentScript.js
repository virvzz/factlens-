// Оркестратор live-проверки (Этап 2): выбор источника субтитров,
// накопление «бегущего» текста, отправка фрагментов в очередь background,
// отрисовка результатов в overlay.
// Инжектируется через scripting.executeScript после contentLib.js,
// overlay.js и subtitleExtractors/*.js.

(function () {
  "use strict";
  try {
  // Версия контент-скрипта: при переинжекции более новая версия
  // сносит предыдущую (таймеры, overlay, слушатель) и стартует заново.
  const CS_VERSION = 4;
  const prev = globalThis.__factLens;
  if (prev && prev.version === CS_VERSION) return; // актуальная уже загружена
  if (prev && typeof prev.destroy === "function") {
    try {
      prev.destroy();
    } catch {
      /* старый экземпляр мог быть уже мёртв */
    }
  }

  const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome
  const lib = globalThis.FactLensLib;
  const yt = globalThis.FactLensYouTube;
  const gc = globalThis.FactLensGenericCaptions;
  const Overlay = globalThis.FactLensOverlay;

  const POLL_MS = 500;
  const FLUSH_MAX = 700; // накопили столько — режем по предложению
  const FLUSH_MIN = 120; // минимум для отправки по таймеру
  const FLUSH_INTERVAL_MS = 14000;
  const TRIM_AT = 3000; // подрезка буфера, чтобы не рос бесконечно
  const TAIL_KEEP = 250; // хвост для дедупликации повторов субтитров

  const state = {
    overlay: null,
    mode: null, // "live" | "transcript" | "resumed" | null
    buffer: "",
    flushedUpTo: 0,
    pollTimer: null,
    flushTimer: null,
    detachGeneric: null,
    capture: null,
    audioNote: "",
    session: null,
    collecting: false,
    pageUrl: location.href,
  };

  // ---------- Связь с background ----------

  async function send(msg) {
    try {
      return await b.runtime.sendMessage(msg);
    } catch {
      return null;
    }
  }

  // sendResponse-паттерн вместо возврата Promise: работает и в Chrome.
  const onRuntimeMessage = (msg, sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return undefined;
    if (msg.type === "factlensShowOverlay") {
      showOverlay();
      sendResponse({ ok: true });
      return undefined;
    }
    if (msg.type === "liveUpdate") {
      state.session = msg.session;
      renderSession();
    }
    return undefined;
  };
  b.runtime.onMessage.addListener(onRuntimeMessage);

  // ---------- Overlay ----------

  function makeOverlay() {
    if (state.overlay) return state.overlay;
    state.overlay = new Overlay({
      onPause: () => send({ type: "livePause" }),
      onResume: () => send({ type: "liveResume" }),
      onClose: () => stopAll(),
      onCopy: copyAll,
      onReport: reportClaim,
    });
    state.overlay.mount();
    return state.overlay;
  }

  function copyAll() {
    const claims = (state.session && state.session.claims) || [];
    navigator.clipboard
      .writeText(JSON.stringify(claims, null, 2))
      .catch(() => {});
  }

  function reportClaim(claim) {
    const report = {
      reportType: "wrong_result",
      claim,
      page: state.pageUrl,
      reportedAt: new Date().toISOString(),
    };
    navigator.clipboard
      .writeText(JSON.stringify(report, null, 2))
      .catch(() => {});
  }

  function renderSession() {
    const o = state.overlay;
    const s = state.session;
    if (!o || !o.host) return;
    if (s) {
      if (s.provider || s.model) o.setMeta(`${s.provider} · ${s.model}`);
      o.setPaused(s.paused);
      if (s.paused && s.status === "error") {
        o.setStatus("error", "Ошибка — проверка остановлена");
      } else if (s.paused) {
        o.setStatus("paused", "Пауза");
      } else if (state.audioNote) {
        o.setStatus("error", state.audioNote);
      } else if (s.status === "checking") {
        o.setStatus("checking", `Проверка… (в очереди: ${s.queueLength})`);
      } else if (state.collecting) {
        o.setStatus(
          "reading",
          state.capture ? "Распознаю звук…" : "Чтение субтитров…"
        );
      } else {
        o.setStatus("idle", "Ожидание");
      }
      o.setCounter(`утверждений: ${s.claims.length}`);
    } else if (state.collecting) {
      o.setStatus("reading", "Чтение субтитров…");
    }
    // Тело перерисовываем только после выбора источника.
    if (state.mode && s) {
      o.renderClaims(s.claims, s.paused ? s.lastError : s.lastError);
    }
  }

  // ---------- Накопление live-текста ----------

  function feed(text) {
    state.buffer = lib.appendWithOverlap(state.buffer, text);
    maybeFlush(false);
  }

  function maybeFlush(byTimer) {
    const pending = state.buffer.slice(state.flushedUpTo);
    if (!pending.trim()) return;
    let cut = -1;
    if (pending.length >= FLUSH_MAX) {
      cut = lib.findFlushCut(pending, true);
    } else if (byTimer && pending.length >= FLUSH_MIN) {
      cut = lib.findFlushCut(pending, true);
    }
    if (cut <= 0) return;
    const fragment = pending.slice(0, cut).trim();
    state.flushedUpTo += cut;
    trimBuffer();
    if (fragment) {
      send({ type: "queueFragments", fragments: [fragment] });
    }
  }

  function trimBuffer() {
    if (state.flushedUpTo > TRIM_AT) {
      const keepFrom = state.flushedUpTo - TAIL_KEEP;
      state.buffer = state.buffer.slice(keepFrom);
      state.flushedUpTo -= keepFrom;
    }
  }

  // ---------- Режимы ----------

  function startLiveYouTube() {
    state.mode = "live";
    state.collecting = true;
    state.pageUrl = location.href;
    makeOverlay().renderClaims([], null);
    renderSession();

    state.pollTimer = setInterval(() => {
      // YouTube — SPA: при переходе на другое видео сбрасываемся.
      if (location.href !== state.pageUrl) {
        stopCapture();
        state.pageUrl = location.href;
        makeOverlay().showMessage(
          "Видео сменилось. Выберите источник заново.",
          false
        );
        detectAndShowSources();
        return;
      }
      const text = yt.getLiveCaptionText();
      if (text) feed(text);
    }, POLL_MS);
    state.flushTimer = setInterval(() => maybeFlush(true), FLUSH_INTERVAL_MS);
  }

  function startLiveGeneric(found) {
    state.mode = "live";
    state.collecting = true;
    state.pageUrl = location.href;
    makeOverlay().renderClaims([], null);
    renderSession();
    state.detachGeneric = gc.attachLive(found.tracks[0], feed);
    state.flushTimer = setInterval(() => maybeFlush(true), FLUSH_INTERVAL_MS);
  }

  async function startTranscript() {
    const o = makeOverlay();
    o.showMessage("Загружаю транскрипт…", false);
    let text = "";
    if (yt.isWatchPage()) {
      const tracks = await yt.listCaptionTracks();
      const preferred = [
        (navigator.language || "ru").slice(0, 2).toLowerCase(),
        "ru",
        "en",
      ];
      const track = lib.pickCaptionTrack(tracks, preferred);
      const events = track ? await yt.fetchTranscript(track) : null;
      if (events) text = lib.transcriptToText(events);
    } else {
      const found = gc.findVideoWithTracks();
      if (found) text = gc.fullTrackText(found.tracks[0]);
    }
    if (!text) {
      o.showMessage(
        "Не удалось получить транскрипт. Попробуйте live-режим (включите субтитры в плеере), выделите текст или используйте ручной ввод в popup.",
        true
      );
      return;
    }
    state.mode = "transcript";
    state.collecting = false;
    o.renderClaims([], null);
    const resp = await send({
      type: "queueFragments",
      fragments: [text],
      needsChunking: true,
    });
    if (!resp || !resp.ok) {
      o.showMessage("Не удалось поставить транскрипт в очередь проверки.", true);
    }
  }

  function stopCapture() {
    state.collecting = false;
    state.mode = null;
    state.buffer = "";
    state.flushedUpTo = 0;
    state.audioNote = "";
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.flushTimer) clearInterval(state.flushTimer);
    state.pollTimer = null;
    state.flushTimer = null;
    if (state.detachGeneric) {
      try {
        state.detachGeneric();
      } catch {
        /* дорожка могла исчезнуть */
      }
      state.detachGeneric = null;
    }
    if (state.capture) {
      try {
        state.capture.stop();
      } catch {
        /* уже остановлен */
      }
      state.capture = null;
    }
  }

  // ---------- Аудио + STT (Этап 3) ----------

  function pickVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    if (!videos.length) return null;
    return (
      videos.find((v) => !v.paused && !v.ended) ||
      videos.sort(
        (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
      )[0]
    );
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function startAudio() {
    const o = makeOverlay();
    const summary = await send({ type: "getSummary" });
    if (!summary || !summary.sttConfigured) {
      o.showMessage(
        "STT endpoint не настроен. Откройте настройки FactLens → раздел «Распознавание речи (STT)», заполните endpoint и ключ, затем запустите снова.",
        true
      );
      return;
    }
    const video = pickVideo();
    if (!video) {
      o.showMessage("Видео на этой странице не найдено.", true);
      return;
    }
    state.mode = "live";
    state.collecting = true;
    state.pageUrl = location.href;
    o.renderClaims([], null);
    renderSession();

    let silentRun = 0;
    try {
      state.capture = new globalThis.FactLensAudioCapture.Capture(video, {
        chunkMs: (summary.sttChunkSeconds || 20) * 1000,
        onChunk: async (blob, info) => {
          if (!blob || info.silent) {
            silentRun++;
            if (silentRun >= 3) {
              state.audioNote =
                "Звук не захватывается: видео на паузе, mute или DRM/CORS.";
              renderSession();
            }
            return;
          }
          silentRun = 0;
          if (state.audioNote) {
            state.audioNote = "";
            renderSession();
          }
          try {
            const dataUrl = await blobToDataUrl(blob);
            const resp = await send({ type: "sttChunk", dataUrl });
            if (resp && resp.ok) {
              if (resp.text && resp.text.trim()) feed(resp.text);
            } else if (resp && resp.error) {
              state.audioNote = `STT: ${resp.error.message || "ошибка"}`;
              renderSession();
            }
          } catch {
            /* чанк потерян — продолжаем со следующего */
          }
        },
        onError: (err) => {
          state.audioNote = `Захват звука: ${(err && err.message) || err}`;
          renderSession();
        },
      });
      state.capture.start();
    } catch (e) {
      stopCapture();
      o.showMessage(
        `Не удалось захватить звук видео: ${(e && e.message) || e}. Вероятно, плеер защищён (DRM/CORS) — используйте субтитры или выделение текста.`,
        true
      );
      return;
    }
    state.flushTimer = setInterval(() => maybeFlush(true), FLUSH_INTERVAL_MS);
  }

  function stopAll() {
    stopCapture();
    send({ type: "liveStop" });
    if (state.overlay) {
      state.overlay.unmount();
      state.overlay = null;
    }
    state.session = null;
  }

  // ---------- Определение источников ----------

  async function detectAndShowSources() {
    const o = makeOverlay();
    const options = [];
    let note = "";

    const hasVideo = Boolean(document.querySelector("video"));

    if (yt.isWatchPage()) {
      const tracks = await yt.listCaptionTracks();
      options.push({
        label: "▶ Live-проверка субтитров (по мере просмотра)",
        onClick: () => startLiveYouTube(),
      });
      if (tracks.length) {
        options.push({
          label: "≡ Проверить весь доступный транскрипт",
          secondary: true,
          onClick: () => startTranscript(),
        });
        note =
          "Для live-режима включите субтитры в плеере (кнопка CC). Результаты появляются с задержкой в несколько секунд — это время ответа AI.";
      } else {
        note =
          "У этого видео не найдено дорожек субтитров. Для live-режима включите субтитры (CC), если они доступны, или используйте распознавание звука.";
      }
    } else {
      const found = gc.findVideoWithTracks();
      if (found) {
        options.push({
          label: "▶ Live-проверка субтитров видео",
          onClick: () => startLiveGeneric(found),
        });
        const full = gc.fullTrackText(found.tracks[0]);
        if (full) {
          options.push({
            label: "≡ Проверить все субтитры целиком",
            secondary: true,
            onClick: () => startTranscript(),
          });
        }
        note = "Найдено видео с дорожкой субтитров.";
      } else if (!hasVideo) {
        note =
          "На этой странице не найдено видео. Выделите текст и проверьте его через popup или контекстное меню.";
      }
    }

    if (hasVideo) {
      options.push({
        label: "🎙 Распознавание звука (STT)",
        secondary: true,
        onClick: () => startAudio(),
      });
      note +=
        " Для распознавания звука нужен настроенный STT endpoint (настройки FactLens) и включённый звук видео.";
    }

    o.showSources(options, note.trim());
  }

  async function showOverlay() {
    makeOverlay();
    const view = await send({ type: "getLiveSession" });
    if (
      view &&
      ((view.claims && view.claims.length) ||
        view.queueLength ||
        view.status === "checking")
    ) {
      // Есть активная сессия (например, повторное открытие) — показываем её.
      state.session = view;
      if (!state.mode) state.mode = "resumed";
      renderSession();
      return;
    }
    await detectAndShowSources();
  }

  // Публичный интерфейс: popup вызывает showOverlay напрямую через
  // executeScript (без сообщений), новая версия скрипта сносит старую.
  globalThis.__factLens = {
    version: CS_VERSION,
    showOverlay,
    destroy() {
      try {
        b.runtime.onMessage.removeListener(onRuntimeMessage);
      } catch {
        /* runtime мог умереть вместе со старым расширением */
      }
      stopCapture();
      if (state.overlay) {
        state.overlay.unmount();
        state.overlay = null;
      }
    },
  };
  } catch (e) {
    // Диагностика для activate.js/popup: почему init не прошёл.
    globalThis.__factLensInitError = String((e && e.stack) || e);
    throw e;
  }
})();
