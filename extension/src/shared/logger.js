// Безопасный логгер: никогда не выводит API key и другие секреты.

import { redactText, safeSerialize } from "./sanitizer.js";

const secrets = new Set();

/** Регистрирует секрет (например, API key), который надо вырезать из всех логов. */
export function registerSecret(value) {
  const v = String(value || "");
  if (v.length >= 4) secrets.add(v);
}

export function clearSecrets() {
  secrets.clear();
}

function prepare(arg) {
  if (typeof arg === "string") return redactText(arg, [...secrets]);
  if (arg instanceof Error) {
    return redactText(`${arg.name}: ${arg.message}`, [...secrets]);
  }
  return safeSerialize(arg, [...secrets]);
}

function emit(level, args) {
  // eslint-disable-next-line no-console
  console[level]("[FactLens]", ...args.map(prepare));
}

export const logger = {
  debug: (...args) => emit("debug", args),
  info: (...args) => emit("info", args),
  warn: (...args) => emit("warn", args),
  error: (...args) => emit("error", args),
};
