// История проверок (Этап 4): сохраняется ТОЛЬКО при явном включении
// пользователем (historyEnabled), локально, максимум 50 записей.

import { loadSettings } from "../shared/settings.js";

const KEY = "history";
const MAX_ENTRIES = 50;

function localArea() {
  return (globalThis.browser ?? globalThis.chrome).storage.local;
}

/**
 * Добавляет запись в историю, если история включена.
 * @param {{checkedAt: number, source: string, inputPreview: string,
 *          provider: string, model: string, claims: Array}} entry
 * @returns {Promise<boolean>} true, если запись сохранена
 */
export async function appendHistory(entry, area = null, settings = null) {
  const s = settings || (await loadSettings());
  if (!s.historyEnabled) return false;
  const storage = area || localArea();
  const data = await storage.get(KEY);
  const list = Array.isArray(data[KEY]) ? data[KEY] : [];
  list.unshift(entry);
  await storage.set({ [KEY]: list.slice(0, MAX_ENTRIES) });
  return true;
}

export async function getHistory(area = null) {
  const storage = area || localArea();
  const data = await storage.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}

export async function clearHistory(area = null) {
  const storage = area || localArea();
  await storage.remove(KEY);
}
