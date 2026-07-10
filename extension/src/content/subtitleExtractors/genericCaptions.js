// Generic captions: субтитры HTML5 <video> через textTracks (Этап 2).

(function () {
  "use strict";

  // Всегда перезаписываем (см. contentLib.js).
  const lib = globalThis.FactLensLib;

  function captionTracksOf(video) {
    const out = [];
    const tracks = video.textTracks || [];
    for (let i = 0; i < tracks.length; i++) {
      const tr = tracks[i];
      if (tr.kind === "subtitles" || tr.kind === "captions") out.push(tr);
    }
    return out;
  }

  /** Находит на странице <video> с дорожками субтитров. */
  function findVideoWithTracks() {
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const tracks = captionTracksOf(video);
      if (tracks.length) return { video, tracks };
    }
    return null;
  }

  function cueText(cue) {
    let text = "";
    if (typeof cue.text === "string") text = cue.text;
    else if (cue.getCueAsHTML) text = cue.getCueAsHTML().textContent || "";
    return lib.normalizeSpace(text.replace(/<[^>]+>/g, " "));
  }

  /** Текст активных (показываемых сейчас) реплик дорожки. */
  function activeCueText(track) {
    const cues = track.activeCues;
    if (!cues || !cues.length) return "";
    const parts = [];
    for (let i = 0; i < cues.length; i++) parts.push(cueText(cues[i]));
    return lib.normalizeSpace(parts.join(" "));
  }

  /**
   * Полный текст дорожки, если реплики уже загружены браузером
   * (обычно для <track src=...> после включения дорожки).
   */
  function fullTrackText(track) {
    const cues = track.cues;
    if (!cues || !cues.length) return "";
    const parts = [];
    for (let i = 0; i < cues.length; i++) parts.push(cueText(cues[i]));
    return lib.normalizeSpace(parts.join(" "));
  }

  /**
   * Включает дорожку в hidden-режим (реплики приходят, отображение
   * страницы не меняется) и дергает onText при каждой смене реплик.
   * Возвращает функцию остановки.
   */
  function attachLive(track, onText) {
    const prevMode = track.mode;
    if (track.mode === "disabled") track.mode = "hidden";
    const handler = () => {
      const text = activeCueText(track);
      if (text) onText(text);
    };
    track.addEventListener("cuechange", handler);
    return function detach() {
      track.removeEventListener("cuechange", handler);
      track.mode = prevMode;
    };
  }

  globalThis.FactLensGenericCaptions = {
    findVideoWithTracks,
    activeCueText,
    fullTrackText,
    attachLive,
  };
})();
