// Запускается последним файлом в списке инжекции (тот же вызов
// executeScript, что и остальные скрипты): показывает панель FactLens.
// Если инициализация не прошла — бросает ошибку с самодиагностикой,
// которую popup покажет в строке «Детали».

(function () {
  "use strict";
  const fl = globalThis.__factLens;
  if (fl && typeof fl.showOverlay === "function") {
    fl.showOverlay();
    return;
  }
  const diag = [
    "lib=" + (globalThis.FactLensLib ? "ok" : "НЕТ"),
    "overlay=" + (globalThis.FactLensOverlay ? "ok" : "НЕТ"),
    "youtube=" + (globalThis.FactLensYouTube ? "ok" : "НЕТ"),
    "captions=" + (globalThis.FactLensGenericCaptions ? "ok" : "НЕТ"),
    "audio=" + (globalThis.FactLensAudioCapture ? "ok" : "НЕТ"),
    "initError=" + (globalThis.__factLensInitError || "нет"),
  ].join("; ");
  // eslint-disable-next-line no-console
  console.error("[FactLens] init failed:", diag);
  throw new Error("FactLens не инициализировался: " + diag);
})();
