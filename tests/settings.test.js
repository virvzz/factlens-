import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultSettings,
  migrateSettings,
  exportSettings,
  importSettings,
  effectiveConfig,
  loadSettings,
  saveSettings,
  SETTINGS_VERSION,
  PRESETS,
} from "../extension/src/shared/settings.js";
import { DEFAULT_PROMPTS } from "../extension/src/shared/prompts.js";

function fakeStorageArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return { [key]: data[key] };
    },
    async set(obj) {
      Object.assign(data, obj);
    },
  };
}

test("migrateSettings: пустое хранилище -> дефолты", () => {
  const s = migrateSettings(null);
  assert.equal(s.settingsVersion, SETTINGS_VERSION);
  assert.equal(s.preset, "anthropic");
  assert.equal(s.baseUrl, "https://api.anthropic.com");
  assert.equal(s.apiKey, "");
  assert.equal(s.maxTokens, 1024);
  assert.equal(s.prompts.factCheck, DEFAULT_PROMPTS.factCheck);
});

test("migrateSettings: частичные/битые настройки чинятся (storage migration)", () => {
  const s = migrateSettings({
    preset: "deepseek",
    baseUrl: "https://api.deepseek.com",
    maxTokens: 5, // ниже минимума -> clamp
    temperature: 99, // выше максимума -> clamp
    authMode: "weird-mode", // невалидно -> дефолт preset
    recentModels: ["a", 42, "b", null],
    prompts: { factCheck: "мой промпт", garbage: "x" },
    unknownField: "должно исчезнуть",
  });
  assert.equal(s.preset, "deepseek");
  assert.equal(s.maxTokens, 16);
  assert.equal(s.temperature, 2);
  assert.equal(s.authMode, "bearer"); // дефолт DeepSeek preset
  assert.deepEqual(s.recentModels, ["a", "b"]);
  assert.equal(s.prompts.factCheck, "мой промпт");
  assert.equal(s.prompts.outputRu, DEFAULT_PROMPTS.outputRu);
  assert.equal("unknownField" in s, false);
  assert.equal("garbage" in s.prompts, false);
  assert.equal(s.settingsVersion, SETTINGS_VERSION);
});

test("exportSettings: API key исключается из экспорта", () => {
  const s = defaultSettings();
  s.apiKey = "sk-very-secret-key-123456";
  s.model = "gpt-4o-mini";
  const exported = exportSettings(s);
  assert.equal("apiKey" in exported, false);
  assert.equal(exported.model, "gpt-4o-mini");
  assert.ok(!JSON.stringify(exported).includes("sk-very-secret-key"));
});

test("importSettings: ключ из файла игнорируется, текущий сохраняется", () => {
  const current = defaultSettings();
  current.apiKey = "sk-current-key-000000000";
  const incoming = {
    preset: "openai",
    baseUrl: "https://api.openai.com",
    model: "gpt-4o",
    apiKey: "sk-imported-key-should-be-ignored",
  };
  const merged = importSettings(current, incoming);
  assert.equal(merged.apiKey, "sk-current-key-000000000");
  assert.equal(merged.preset, "openai");
  assert.equal(merged.model, "gpt-4o");
});

test("saveSettings/loadSettings: roundtrip через storage area", async () => {
  const area = fakeStorageArea();
  const s = defaultSettings();
  s.model = "claude-sonnet-4-20250514";
  s.apiKey = "sk-roundtrip-key-000000";
  await saveSettings(s, area);
  const loaded = await loadSettings(area);
  assert.equal(loaded.model, "claude-sonnet-4-20250514");
  assert.equal(loaded.apiKey, "sk-roundtrip-key-000000");
});

test("loadSettings: старые настройки мигрируются при загрузке", async () => {
  const area = fakeStorageArea({
    settings: { preset: "artemox", model: "some-model" }, // без большинства полей
  });
  const loaded = await loadSettings(area);
  assert.equal(loaded.preset, "artemox");
  assert.equal(loaded.model, "some-model");
  assert.equal(loaded.maxTokens, 1024); // дозаполнено дефолтом
  assert.equal(loaded.settingsVersion, SETTINGS_VERSION);
});

test("effectiveConfig: JSON-поля парсятся, заголовки приводятся к lower-case", () => {
  const s = defaultSettings();
  s.extraHeadersJson = '{"Anthropic-Version": "2023-06-01"}';
  s.advancedBodyJson = '{"thinking": {"type": "disabled"}}';
  const cfg = effectiveConfig(s);
  assert.deepEqual(cfg.extraHeaders, { "anthropic-version": "2023-06-01" });
  assert.deepEqual(cfg.advancedBody, { thinking: { type: "disabled" } });
  assert.equal(cfg.presetLabel, "Anthropic official");
});

test("effectiveConfig: невалидный JSON в заголовках -> ошибка parse", () => {
  const s = defaultSettings();
  s.extraHeadersJson = "{не json}";
  assert.throws(() => effectiveConfig(s), (e) => e.type === "parse");
});

test("PRESETS: все пресеты из ТЗ 6 присутствуют", () => {
  assert.deepEqual(Object.keys(PRESETS), [
    "anthropic",
    "openai",
    "deepseek",
    "artemox",
    "customAnthropic",
    "customRaw",
  ]);
  assert.equal(PRESETS.deepseek.baseUrl, "https://api.deepseek.com");
  assert.equal(PRESETS.deepseek.apiPath, "/chat/completions");
  assert.deepEqual(PRESETS.deepseek.legacyModels, ["deepseek-chat", "deepseek-reasoner"]);
  assert.equal(PRESETS.anthropic.responsePath, "content[0].text");
  assert.equal(PRESETS.openai.responsePath, "choices[0].message.content");
  assert.equal(PRESETS.artemox.baseUrl, "https://api.artemox.com/v1");
});
