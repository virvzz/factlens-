// Очистка входного текста и редактирование секретов в логах/ошибках.

export const MAX_INPUT_CHARS = 12000;

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_RE = /^(api[-_]?key|x-api-key|authorization|token|secret|password)$/i;

// Управляющие символы, кроме \t и \n (записаны escape-последовательностями).
const CONTROL_CHARS_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g"
);

/**
 * Чистит входной текст перед отправкой в модель:
 * убирает управляющие символы, схлопывает пробелы, ограничивает длину.
 */
export function cleanInputText(raw, maxChars = MAX_INPUT_CHARS) {
  let t = String(raw || "");
  t = t.replace(/\r\n?/g, "\n");
  t = t.replace(CONTROL_CHARS_RE, " ");
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n");
  t = t.trim();
  const truncated = t.length > maxChars;
  if (truncated) t = t.slice(0, maxChars);
  return { text: t, truncated };
}

/**
 * Редактирует секреты в произвольной строке:
 * известные секреты (переданные явно) и типовые паттерны ключей.
 */
export function redactText(str, secrets = []) {
  let out = String(str ?? "");
  for (const s of secrets) {
    const sec = String(s || "");
    if (sec.length < 4) continue;
    out = out.split(sec).join(REDACTED);
  }
  // Типовые форматы ключей.
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
  out = out.replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`);
  out = out.replace(
    /("?(?:x-api-key|api[-_]?key|authorization)"?\s*[:=]\s*"?)([^\s",;}]{4,})/gi,
    `$1${REDACTED}`
  );
  return out;
}

/**
 * Безопасно сериализует значение для лога: маскирует значения
 * чувствительных ключей и известные секреты.
 */
export function safeSerialize(value, secrets = []) {
  let json;
  try {
    json = JSON.stringify(
      value,
      (key, v) => {
        if (SENSITIVE_KEY_RE.test(key) && typeof v === "string" && v) {
          return REDACTED;
        }
        return v;
      },
      2
    );
  } catch {
    json = String(value);
  }
  return redactText(json ?? "undefined", secrets);
}
