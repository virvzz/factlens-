import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSttRequest,
  parseSttResponse,
  transcribe,
  makeSilentWav,
} from "../extension/src/audio/speechToText.js";
import {
  defaultSettings,
  migrateSettings,
  exportSettings,
  importSettings,
  effectiveConfig,
  STT_PRESETS,
} from "../extension/src/shared/settings.js";

function sttCfg(overrides = {}) {
  return {
    baseUrl: "https://api.groq.com/openai",
    apiPath: "/v1/audio/transcriptions",
    apiKey: "gsk-test-key-000000000",
    authMode: "bearer",
    customAuthHeader: "",
    model: "whisper-large-v3",
    language: "ru",
    responsePath: "text",
    chunkSeconds: 20,
    ...overrides,
  };
}

test("buildSttRequest: url и auth, без content-type (FormData сам ставит boundary)", () => {
  const { url, headers } = buildSttRequest(sttCfg());
  assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(headers.authorization, "Bearer gsk-test-key-000000000");
  assert.equal(headers["content-type"], undefined);
});

test("parseSttResponse: {text}, свой путь, plain string, пустая строка допустима", () => {
  assert.equal(parseSttResponse({ text: "распознанный текст" }, "text"), "распознанный текст");
  assert.equal(parseSttResponse({ text: "" }, ""), ""); // тишина — не ошибка
  assert.equal(parseSttResponse({ result: { transcript: "ок" } }, "result.transcript"), "ок");
  assert.equal(parseSttResponse("plain string", "text"), "plain string");
  assert.throws(() => parseSttResponse({ foo: 1 }, "text"), (e) => e.type === "parse");
});

test("transcribe: multipart-запрос с file/model/language", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ text: "привет мир" }),
      text: async () => "",
    };
  };
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
  const text = await transcribe(sttCfg(), blob, { fetchImpl });
  assert.equal(text, "привет мир");
  assert.equal(captured.url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(captured.init.method, "POST");
  const form = captured.init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("model"), "whisper-large-v3");
  assert.equal(form.get("language"), "ru");
  assert.equal(form.get("response_format"), "json");
  const file = form.get("file");
  assert.equal(file.name, "chunk.webm");
});

test("transcribe: 401 -> auth ошибка", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => '{"error":"bad key"}',
    json: async () => ({}),
  });
  await assert.rejects(
    transcribe(sttCfg(), new Blob([new Uint8Array(4)]), { fetchImpl }),
    (e) => e.type === "auth"
  );
});

test("makeSilentWav: валидный WAV-заголовок и размер", () => {
  const wav = makeSilentWav(600, 16000);
  const header = String.fromCharCode(...wav.slice(0, 4));
  assert.equal(header, "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  // 44 байта заголовок + 600мс * 16000Гц * 2 байта
  assert.equal(wav.length, 44 + 0.6 * 16000 * 2);
});

test("settings: STT-поля мигрируются и клампятся", () => {
  const s = migrateSettings({ stt: { baseUrl: "https://x.example", chunkSeconds: 999 } });
  assert.equal(s.stt.baseUrl, "https://x.example");
  assert.equal(s.stt.chunkSeconds, 120); // clamp
  assert.equal(s.stt.apiPath, "/v1/audio/transcriptions"); // дефолт
  assert.equal(s.stt.responsePath, "text");
  // Старые настройки без stt получают дефолтный блок.
  const old = migrateSettings({ preset: "openai" });
  assert.equal(old.stt.baseUrl, "");
});

test("settings: STT ключ не попадает в экспорт и игнорируется при импорте", () => {
  const s = defaultSettings();
  s.stt.apiKey = "gsk-secret-stt-key-000";
  const exported = exportSettings(s);
  assert.equal("apiKey" in exported.stt, false);
  assert.ok(!JSON.stringify(exported).includes("gsk-secret-stt-key"));

  const merged = importSettings(s, {
    stt: { baseUrl: "https://api.openai.com", apiKey: "should-be-ignored-000" },
  });
  assert.equal(merged.stt.apiKey, "gsk-secret-stt-key-000");
  assert.equal(merged.stt.baseUrl, "https://api.openai.com");
});

test("effectiveConfig: включает stt-блок", () => {
  const s = defaultSettings();
  s.stt.baseUrl = "http://localhost:8000";
  s.stt.authMode = "none";
  const cfg = effectiveConfig(s);
  assert.equal(cfg.stt.baseUrl, "http://localhost:8000");
  assert.equal(cfg.stt.authMode, "none");
});

test("STT_PRESETS: OpenAI, Groq и локальный", () => {
  assert.equal(STT_PRESETS.openai.baseUrl, "https://api.openai.com");
  assert.equal(STT_PRESETS.groq.baseUrl, "https://api.groq.com/openai");
  assert.equal(STT_PRESETS.groq.model, "whisper-large-v3");
  assert.equal(STT_PRESETS.local.authMode, "none");
});
