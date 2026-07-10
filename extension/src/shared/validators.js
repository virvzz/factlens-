// Валидация URL, склейка base URL + path, маскирование ключа,
// извлечение значения по пути вида "choices[0].message.content".

/**
 * Склеивает base URL и path.
 * - Убирает завершающие "/" у base.
 * - Не удваивает совпадающие сегменты на стыке:
 *   "https://api.example.com/v1" + "/v1/messages" -> ".../v1/messages".
 */
export function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  let p = String(path || "").trim();
  if (!p) return base;
  if (!p.startsWith("/")) p = "/" + p;

  const m = base.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return base + p;
  const origin = m[1];
  const basePath = m[2] || "";

  const baseSegs = basePath.split("/").filter(Boolean);
  const pathSegs = p.split("/").filter(Boolean);

  // Ищем самое длинное совпадение хвоста base с началом path (дедупликация /v1 и т.п.).
  let overlap = 0;
  const maxK = Math.min(baseSegs.length, pathSegs.length);
  for (let k = maxK; k > 0; k--) {
    const tail = baseSegs.slice(baseSegs.length - k).join("/");
    const head = pathSegs.slice(0, k).join("/");
    if (tail === head) {
      overlap = k;
      break;
    }
  }

  const finalSegs = baseSegs.concat(pathSegs.slice(overlap));
  return origin + (finalSegs.length ? "/" + finalSegs.join("/") : "");
}

/** Проверяет, что строка — корректный http(s) URL. */
export function validateUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "URL не задан" };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Некорректный URL" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: "Поддерживаются только http(s) URL" };
  }
  return { ok: true, origin: u.origin };
}

/**
 * Маскирует API key: первые 6 символов + последние 4.
 * Короткие ключи маскируются полностью, длина не раскрывается.
 */
export function maskApiKey(key) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length < 16) return "••••••••";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/**
 * Достаёт значение из объекта по пути.
 * Поддерживает "content[0].text" и "choices.0.message.content".
 */
export function getByPath(obj, path) {
  const p = String(path || "").trim();
  if (!p) return undefined;
  const parts = p
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}
