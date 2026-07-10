// Извлечение JSON из ответа модели и нормализация структуры claims (ТЗ 9.3).

import { ApiError } from "./errors.js";

export const VERDICTS = [
  "TRUE",
  "MOSTLY_TRUE",
  "MISLEADING",
  "FALSE",
  "UNVERIFIABLE",
  "OPINION_NOT_CHECK_WORTHY",
];

/**
 * Извлекает JSON-объект из текста ответа модели, даже если он
 * обёрнут пояснениями или markdown-fence.
 */
export function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new ApiError("parse", "Модель вернула пустой ответ.");
  }

  // 1. Прямой парсинг.
  try {
    return JSON.parse(raw);
  } catch {
    /* пробуем дальше */
  }

  // 2. Markdown fence ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* пробуем дальше */
    }
  }

  // 3. Первый сбалансированный {...} с учётом строк.
  const start = raw.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
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
          const candidate = raw.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new ApiError("parse", "Не удалось извлечь JSON из ответа модели.", {
    technical: raw.slice(0, 300),
  });
}

function normalizeVerdict(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return VERDICTS.includes(s) ? s : null;
}

function normalizeSources(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const title = typeof s.title === "string" ? s.title.trim() : "";
    let url = typeof s.url === "string" ? s.url.trim() : "";
    const quote = typeof s.quote === "string" ? s.quote.trim() : "";
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" && u.protocol !== "http:") url = "";
      } catch {
        url = "";
      }
    }
    if (!title && !url) continue;
    out.push({ title: title || url, url, quote });
  }
  return out;
}

/**
 * Валидирует и нормализует ответ модели.
 * Отбрасывает элементы без текста утверждения; невалидный verdict
 * превращает в UNVERIFIABLE с пометкой needs_manual_review.
 *
 * @returns {{claims: Array, dropped: number}}
 */
export function normalizeClaims(parsed) {
  let list = null;
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && Array.isArray(parsed.claims)) list = parsed.claims;
  if (!list) {
    throw new ApiError(
      "parse",
      "Ответ модели не содержит массива claims.",
      { technical: JSON.stringify(parsed).slice(0, 200) }
    );
  }

  const claims = [];
  let dropped = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      dropped++;
      continue;
    }
    const claimText = typeof item.claim === "string" ? item.claim.trim() : "";
    if (!claimText) {
      dropped++;
      continue;
    }

    let needsReview = Boolean(item.needs_manual_review);
    let verdict = normalizeVerdict(item.verdict);
    if (!verdict) {
      verdict = "UNVERIFIABLE";
      needsReview = true;
    }

    let confidence = Number(item.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.min(1, Math.max(0, confidence));

    claims.push({
      claim: claimText,
      speaker:
        typeof item.speaker === "string" && item.speaker.trim()
          ? item.speaker.trim()
          : "unknown",
      verdict,
      confidence,
      explanation:
        typeof item.explanation === "string" ? item.explanation.trim() : "",
      sources: normalizeSources(item.sources),
      needs_manual_review: needsReview,
    });
  }

  return { claims, dropped };
}
