// Извлечение субтитров/транскрипта YouTube (Этап 2).
// Только легальные публичные механизмы страницы (ТЗ):
//  - live-субтитры из DOM плеера (.ytp-caption-segment);
//  - транскрипт через timedtext URL из ytInitialPlayerResponse
//    (тот же URL, который использует сам плеер).

(function () {
  "use strict";

  // Всегда перезаписываем (см. contentLib.js).
  const lib = globalThis.FactLensLib;

  function isYouTubePage() {
    return /(^|\.)youtube\.com$/.test(location.hostname);
  }

  function isWatchPage() {
    return (
      isYouTubePage() &&
      (location.pathname === "/watch" || location.pathname.startsWith("/live/"))
    );
  }

  function getVideoId() {
    if (location.pathname === "/watch") {
      return new URLSearchParams(location.search).get("v") || "";
    }
    if (location.pathname.startsWith("/live/")) {
      return location.pathname.split("/")[2] || "";
    }
    return "";
  }

  /** Балансный поиск JSON-объекта в HTML после маркера. */
  function extractJsonAfter(html, marker) {
    const idx = html.indexOf(marker);
    if (idx === -1) return null;
    const start = html.indexOf("{", idx);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /**
   * Достаёт ytInitialPlayerResponse:
   * 1) из page-контекста (Firefox: wrappedJSObject), если videoId совпадает;
   * 2) иначе — из HTML текущей страницы (same-origin fetch).
   */
  async function getPlayerResponse() {
    const videoId = getVideoId();
    try {
      const w = typeof window.wrappedJSObject !== "undefined" ? window.wrappedJSObject : null;
      const pr = w && w.ytInitialPlayerResponse;
      if (pr && pr.videoDetails && pr.videoDetails.videoId === videoId) {
        return JSON.parse(JSON.stringify(pr));
      }
    } catch {
      /* Xray/доступ не удался — идём через HTML */
    }
    try {
      const resp = await fetch(location.href, { credentials: "same-origin" });
      const html = await resp.text();
      const pr = extractJsonAfter(html, "ytInitialPlayerResponse");
      if (pr && pr.videoDetails && pr.videoDetails.videoId === videoId) return pr;
      return pr || null;
    } catch {
      return null;
    }
  }

  async function listCaptionTracks() {
    const pr = await getPlayerResponse();
    const tracks =
      pr &&
      pr.captions &&
      pr.captions.playerCaptionsTracklistRenderer &&
      pr.captions.playerCaptionsTracklistRenderer.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  }

  /** Скачивает полный транскрипт выбранной дорожки. */
  async function fetchTranscript(track) {
    if (!track || !track.baseUrl) return null;
    const url =
      track.baseUrl + (track.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    const resp = await fetch(url, { credentials: "same-origin" });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    if (!data) return null;
    const events = lib.parseTimedTextJson3(data);
    return events.length ? events : null;
  }

  /** Текст субтитров, отображаемых плеером прямо сейчас (нужен включённый CC). */
  function getLiveCaptionText() {
    const segments = document.querySelectorAll(
      "#movie_player .ytp-caption-segment"
    );
    if (!segments.length) return "";
    return lib.normalizeSpace(
      Array.from(segments)
        .map((el) => el.textContent || "")
        .join(" ")
    );
  }

  /** Есть ли в плеере контейнер субтитров (CC включён и что-то показывалось). */
  function hasCaptionArea() {
    return Boolean(document.querySelector("#movie_player .ytp-caption-window-container"));
  }

  function getVideoTitle() {
    const el =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1 .ytd-video-primary-info-renderer") ||
      document.querySelector("title");
    return lib.normalizeSpace(el ? el.textContent : "");
  }

  globalThis.FactLensYouTube = {
    isYouTubePage,
    isWatchPage,
    getVideoId,
    getPlayerResponse,
    listCaptionTracks,
    fetchTranscript,
    getLiveCaptionText,
    hasCaptionArea,
    getVideoTitle,
    extractJsonAfter,
  };
})();
