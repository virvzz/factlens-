// Захват звука из <video> (Этап 3): Web Audio API
// (createMediaElementSource) + MediaRecorder кусками по chunkMs.
// Classic script для инжекции в страницу вместе с контент-скриптом.
//
// Ограничения (честно): DRM-видео и CORS-закрытые плееры отдают тишину;
// звук элемента должен быть включён (mute/volume=0 глушат захват).

(function () {
  "use strict";

  // Всегда перезаписываем (см. contentLib.js), но маршрутизацию сохраняем
  // между переинжекциями: createMediaElementSource можно вызвать для
  // элемента только один раз за жизнь страницы.
  const routed =
    globalThis.__factLensAudioRouted ||
    (globalThis.__factLensAudioRouted = new WeakMap());

  function ensureRouting(video) {
    let r = routed.get(video);
    if (r) return r;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(video);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const tap = ctx.createMediaStreamDestination();
    // Пользователь продолжает слышать звук + ответвления на анализ и запись.
    source.connect(ctx.destination);
    source.connect(analyser);
    source.connect(tap);
    r = { ctx, source, analyser, tap };
    routed.set(video, r);
    return r;
  }

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "audio/ogg",
    ];
    for (const m of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch {
        /* пробуем следующий */
      }
    }
    return "";
  }

  class Capture {
    /**
     * @param {HTMLVideoElement} video
     * @param {{chunkMs?: number,
     *          onChunk: (blob: Blob|null, info: {silent: boolean}) => void,
     *          onError: (err: Error) => void}} opts
     */
    constructor(video, opts) {
      this.video = video;
      this.chunkMs = Math.max(5000, opts.chunkMs || 20000);
      this.onChunk = opts.onChunk;
      this.onError = opts.onError || (() => {});
      this.stopped = false;
      this.hasSignal = false;
    }

    start() {
      const r = ensureRouting(this.video); // может бросить (несовместимый элемент)
      this.r = r;
      r.ctx.resume().catch(() => {});
      this.watchSignal();
      this.record();
    }

    watchSignal() {
      const data = new Uint8Array(this.r.analyser.fftSize);
      this.signalTimer = setInterval(() => {
        this.r.analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i += 16) {
          if (Math.abs(data[i] - 128) > 3) {
            this.hasSignal = true;
            return;
          }
        }
      }, 500);
    }

    record() {
      if (this.stopped) return;
      const mime = pickMimeType();
      let rec;
      try {
        rec = new MediaRecorder(
          this.r.tap.stream,
          mime ? { mimeType: mime } : undefined
        );
      } catch (e) {
        this.onError(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const parts = [];
      this.hasSignal = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) parts.push(e.data);
      };
      rec.onstop = () => {
        if (parts.length) {
          if (this.hasSignal) {
            this.onChunk(
              new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }),
              { silent: false }
            );
          } else {
            // Тишина (пауза видео, mute, DRM/CORS) — STT не дергаем.
            this.onChunk(null, { silent: true });
          }
        }
        if (!this.stopped) this.record();
      };
      rec.onerror = (e) => {
        this.onError((e && e.error) || new Error("MediaRecorder error"));
      };
      this.rec = rec;
      rec.start();
      this.timer = setTimeout(() => {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {
          /* уже остановлен */
        }
      }, this.chunkMs);
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      clearInterval(this.signalTimer);
      try {
        if (this.rec && this.rec.state !== "inactive") this.rec.stop();
      } catch {
        /* уже остановлен */
      }
      // Маршрутизацию не разбираем: createMediaElementSource необратим,
      // source->destination остаётся, чтобы пользователь слышал звук.
    }
  }

  globalThis.FactLensAudioCapture = { Capture };
})();
