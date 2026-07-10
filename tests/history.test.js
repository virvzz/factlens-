import { test } from "node:test";
import assert from "node:assert/strict";

import {
  appendHistory,
  getHistory,
  clearHistory,
} from "../extension/src/background/history.js";
import { migrateSettings } from "../extension/src/shared/settings.js";

function fakeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return { [key]: data[key] };
    },
    async set(obj) {
      Object.assign(data, obj);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

const entry = (n) => ({
  checkedAt: n,
  source: "manual",
  inputPreview: `запись ${n}`,
  provider: "Test",
  model: "test-model",
  claims: [],
});

test("история: выключена по умолчанию — ничего не пишется", async () => {
  const area = fakeArea();
  const saved = await appendHistory(entry(1), area, { historyEnabled: false });
  assert.equal(saved, false);
  assert.deepEqual(await getHistory(area), []);
});

test("история: включена — записи добавляются в начало, лимит 50", async () => {
  const area = fakeArea();
  const settings = { historyEnabled: true };
  for (let i = 1; i <= 55; i++) {
    await appendHistory(entry(i), area, settings);
  }
  const history = await getHistory(area);
  assert.equal(history.length, 50);
  assert.equal(history[0].checkedAt, 55); // новые сверху
  assert.equal(history[49].checkedAt, 6); // старые вытеснены
});

test("история: очистка", async () => {
  const area = fakeArea();
  await appendHistory(entry(1), area, { historyEnabled: true });
  await clearHistory(area);
  assert.deepEqual(await getHistory(area), []);
});

test("настройки: historyEnabled мигрируется, по умолчанию false", () => {
  assert.equal(migrateSettings(null).historyEnabled, false);
  assert.equal(migrateSettings({ historyEnabled: true }).historyEnabled, true);
  assert.equal(migrateSettings({ historyEnabled: "yes" }).historyEnabled, true);
});
