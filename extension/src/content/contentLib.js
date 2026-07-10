// Чистые функции для работы с субтитрами и чанками (Этап 2).
// Файл написан как classic script (без import/export), чтобы его можно было:
//  - инжектировать в страницу через scripting.executeScript({files});
//  - импортировать side-effect'ом из ESM (background, тесты) через globalThis.

(function () {
  "use strict";

  // Всегда перезаписываем: при обновлении расширения новая версия
  // должна заменить старую, застрявшую на странице.
  const SENTENCE_RE = /[^.!?…]+[.!?…]+["»”)\]]*\s*|[^.!?…]+\s*$/g;

  function normalizeSpace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Добавляет к буферу только новую часть «бегущей строки» субтитров.
   * YouTube перерисовывает строки с перекрытием — ищем максимальное
   * совпадение конца буфера с началом новой строки.
   */
  function appendWithOverlap(buffer, incoming) {
    const b = String(buffer || "");
    const inc = normalizeSpace(incoming);
    if (!inc) return b;
    if (!b) return inc;
    if (b.includes(inc)) return b; // полностью повтор

    let k = 0;
    const max = Math.min(b.length, inc.length);
    for (let i = max; i > 0; i--) {
      if (b.endsWith(inc.slice(0, i))) {
        k = i;
        break;
      }
    }
    const add = inc.slice(k).trim();
    if (!add) return b;
    return b + (/\s$/.test(b) ? "" : " ") + add;
  }

  /**
   * Режет длинный текст на чанки по границам предложений.
   * Предложение длиннее maxChars режется жёстко.
   */
  function splitIntoChunks(text, maxChars = 900) {
    const t = normalizeSpace(text);
    if (!t) return [];
    const sentences = t.match(SENTENCE_RE) || [t];
    const chunks = [];
    let cur = "";
    for (const raw of sentences) {
      let s = raw;
      if (cur && cur.length + s.length > maxChars) {
        chunks.push(cur.trim());
        cur = "";
      }
      while (s.length > maxChars) {
        // Жёсткий разрез сверхдлинного предложения по пробелу.
        let cut = s.lastIndexOf(" ", maxChars);
        if (cut < maxChars * 0.5) cut = maxChars;
        chunks.push(s.slice(0, cut).trim());
        s = s.slice(cut).trim();
      }
      cur += s;
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  }

  /**
   * Находит в накопленном буфере точку отреза для отправки фрагмента:
   * последняя граница предложения; если её нет — конец буфера (force)
   * или ничего (не force).
   */
  function findFlushCut(pending, force) {
    const p = String(pending || "");
    let cut = -1;
    const re = /[.!?…]["»”)\]]*\s/g;
    let m;
    while ((m = re.exec(p)) !== null) cut = m.index + m[0].length;
    if (cut > 0) return cut;
    return force ? p.length : -1;
  }

  /** Парсер YouTube timedtext (fmt=json3) -> [{tMs, text}]. */
  function parseTimedTextJson3(data) {
    const out = [];
    const events = (data && data.events) || [];
    for (const ev of events) {
      if (!ev || !Array.isArray(ev.segs)) continue;
      const text = normalizeSpace(
        ev.segs.map((s) => (s && s.utf8) || "").join("")
      );
      if (text) out.push({ tMs: ev.tStartMs || 0, text });
    }
    return out;
  }

  /** Склеивает события транскрипта в цельный текст. */
  function transcriptToText(events) {
    return normalizeSpace((events || []).map((e) => e.text).join(" "));
  }

  /**
   * Выбирает дорожку субтитров: сначала «человеческие» на предпочитаемых
   * языках, затем автогенерируемые (asr), затем любая.
   */
  function pickCaptionTrack(tracks, preferredLangs = ["ru", "en"]) {
    const list = Array.isArray(tracks) ? tracks : [];
    if (!list.length) return null;
    const langOf = (tr) => String(tr.languageCode || "").toLowerCase();
    const isAsr = (tr) => tr.kind === "asr";
    for (const lang of preferredLangs) {
      const manual = list.find((tr) => !isAsr(tr) && langOf(tr).startsWith(lang));
      if (manual) return manual;
    }
    for (const lang of preferredLangs) {
      const asr = list.find((tr) => isAsr(tr) && langOf(tr).startsWith(lang));
      if (asr) return asr;
    }
    return list.find((tr) => !isAsr(tr)) || list[0];
  }

  function formatTimeMs(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  globalThis.FactLensLib = {
    normalizeSpace,
    appendWithOverlap,
    splitIntoChunks,
    findFlushCut,
    parseTimedTextJson3,
    transcriptToText,
    pickCaptionTrack,
    formatTimeMs,
  };
})();
