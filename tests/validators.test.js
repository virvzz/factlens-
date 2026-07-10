import { test } from "node:test";
import assert from "node:assert/strict";

import {
  joinUrl,
  validateUrl,
  maskApiKey,
  getByPath,
} from "../extension/src/shared/validators.js";

test("joinUrl: примеры из ТЗ 7.3", () => {
  assert.equal(
    joinUrl("https://api.anthropic.com", "/v1/messages"),
    "https://api.anthropic.com/v1/messages"
  );
  assert.equal(
    joinUrl("https://api.anthropic.com/v1", "/messages"),
    "https://api.anthropic.com/v1/messages"
  );
  assert.equal(
    joinUrl("https://api.deepseek.com", "/chat/completions"),
    "https://api.deepseek.com/chat/completions"
  );
  assert.equal(
    joinUrl("https://api.artemox.com/v1", "/chat/completions"),
    "https://api.artemox.com/v1/chat/completions"
  );
});

test("joinUrl: не удваивает /v1 и обрабатывает завершающие слэши", () => {
  assert.equal(
    joinUrl("https://api.example.com/v1", "/v1/chat/completions"),
    "https://api.example.com/v1/chat/completions"
  );
  assert.equal(
    joinUrl("https://api.example.com/v1/", "/chat/completions"),
    "https://api.example.com/v1/chat/completions"
  );
  assert.equal(
    joinUrl("https://api.example.com///", "chat/completions"),
    "https://api.example.com/chat/completions"
  );
  assert.equal(joinUrl("https://api.example.com", ""), "https://api.example.com");
});

test("validateUrl: принимает http(s), отклоняет прочее", () => {
  assert.equal(validateUrl("https://api.openai.com").ok, true);
  assert.equal(validateUrl("https://api.openai.com").origin, "https://api.openai.com");
  assert.equal(validateUrl("http://localhost:11434").ok, true);
  assert.equal(validateUrl("ftp://example.com").ok, false);
  assert.equal(validateUrl("не url").ok, false);
  assert.equal(validateUrl("").ok, false);
});

test("maskApiKey: первые 6 + последние 4, короткие ключи скрыты полностью", () => {
  const key = "sk-abcdef1234567890xyz9876";
  const masked = maskApiKey(key);
  assert.equal(masked, "sk-abc…9876");
  assert.ok(!masked.includes("def1234567890"));
  assert.equal(maskApiKey("short"), "••••••••");
  assert.equal(maskApiKey(""), "");
});

test("getByPath: поддерживает скобки и точки", () => {
  const obj = {
    content: [{ type: "text", text: "hello" }],
    choices: [{ message: { content: "world" } }],
  };
  assert.equal(getByPath(obj, "content[0].text"), "hello");
  assert.equal(getByPath(obj, "choices[0].message.content"), "world");
  assert.equal(getByPath(obj, "choices.0.message.content"), "world");
  assert.equal(getByPath(obj, "missing.path"), undefined);
  assert.equal(getByPath(obj, ""), undefined);
});
