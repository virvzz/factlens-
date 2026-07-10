// Простой i18n: MVP — русский, структура готова для английского (ТЗ 15).

import ru from "./ru.js";
import en from "./en.js";

const DICTS = { ru, en };
let current = "ru";

export function setLanguage(lang) {
  if (DICTS[lang]) current = lang;
}

export function getLanguage() {
  return current;
}

/** Возвращает строку перевода; при отсутствии ключа — русский, затем сам ключ. */
export function t(key) {
  return DICTS[current][key] ?? ru[key] ?? key;
}

/** Локализованный label для verdict. */
export function verdictLabel(verdict) {
  return t(`verdict.${verdict}`);
}
