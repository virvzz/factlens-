import { test } from "node:test";
import assert from "node:assert/strict";

import * as anthropic from "../extension/src/background/providerAdapters/anthropicMessages.js";
import * as openai from "../extension/src/background/providerAdapters/openaiChatCompletions.js";
import * as deepseek from "../extension/src/background/providerAdapters/deepseekOfficial.js";
import * as custom from "../extension/src/background/providerAdapters/customTemplate.js";

const prompts = { system: "SYSTEM PROMPT", user: "USER PROMPT" };

function anthropicCfg(overrides = {}) {
  return {
    baseUrl: "https://api.anthropic.com",
    apiPath: "/v1/messages",
    apiKey: "sk-ant-test-key-000000",
    authMode: "x-api-key",
    customAuthHeader: "",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    advancedBody: {},
    model: "claude-sonnet-4-20250514",
    maxTokens: 1024,
    temperature: 0.2,
    ...overrides,
  };
}

function openaiCfg(overrides = {}) {
  return {
    baseUrl: "https://api.openai.com",
    apiPath: "/v1/chat/completions",
    apiKey: "sk-oai-test-key-000000",
    authMode: "bearer",
    customAuthHeader: "",
    extraHeaders: {},
    advancedBody: {},
    model: "gpt-4o-mini",
    maxTokens: 512,
    temperature: 0.3,
    ...overrides,
  };
}

test("Anthropic: сборка запроса по ТЗ 8.1", () => {
  const { url, headers, body } = anthropic.buildRequest(anthropicCfg(), prompts);
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers["x-api-key"], "sk-ant-test-key-000000");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers.authorization, undefined);
  assert.equal(body.model, "claude-sonnet-4-20250514");
  assert.equal(body.max_tokens, 1024);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.system, "SYSTEM PROMPT");
  assert.deepEqual(body.messages, [{ role: "user", content: "USER PROMPT" }]);
});

test("Anthropic: парсер ответа content[0].text + fallback по типу блока", () => {
  assert.equal(
    anthropic.parseResponse({ content: [{ type: "text", text: "привет" }] }),
    "привет"
  );
  // Первый блок не text — fallback находит текстовый блок.
  assert.equal(
    anthropic.parseResponse({
      content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "ответ" }],
    }),
    "ответ"
  );
  assert.throws(() => anthropic.parseResponse({ content: [] }));
});

test("OpenAI-compatible: сборка запроса по ТЗ 8.2", () => {
  const { url, headers, body } = openai.buildRequest(openaiCfg(), prompts);
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
  assert.equal(headers.authorization, "Bearer sk-oai-test-key-000000");
  assert.equal(headers["x-api-key"], undefined);
  assert.equal(body.model, "gpt-4o-mini");
  assert.equal(body.max_tokens, 512);
  assert.deepEqual(body.messages[0], { role: "system", content: "SYSTEM PROMPT" });
  assert.deepEqual(body.messages[1], { role: "user", content: "USER PROMPT" });
});

test("OpenAI-compatible: парсер ответа choices[0].message.content", () => {
  assert.equal(
    openai.parseResponse({ choices: [{ message: { content: "ок" } }] }),
    "ок"
  );
  assert.throws(() => openai.parseResponse({ choices: [] }));
});

test("DeepSeek: OpenAI-формат + advanced body options", () => {
  const cfg = openaiCfg({
    baseUrl: "https://api.deepseek.com",
    apiPath: "/chat/completions",
    model: "deepseek-v4-flash",
    advancedBody: { thinking: { type: "disabled" } },
  });
  const { url, body } = deepseek.buildRequest(cfg, prompts);
  assert.equal(url, "https://api.deepseek.com/chat/completions");
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.messages.length, 2);
});

test("DeepSeek: определение legacy-моделей", () => {
  assert.equal(deepseek.isLegacyModel("deepseek-chat"), true);
  assert.equal(deepseek.isLegacyModel("deepseek-reasoner"), true);
  assert.equal(deepseek.isLegacyModel("deepseek-v4-flash"), false);
  assert.equal(deepseek.isLegacyModel(""), false);
});

test("Custom template: подстановка с JSON-экранированием", () => {
  const template = '{"model": "{{model}}", "text": "{{user_prompt}}", "n": {{max_tokens}}}';
  const rendered = custom.renderTemplate(template, {
    model: "my-model",
    user_prompt: 'строка с "кавычками"\nи переводом строки',
    max_tokens: 256,
  });
  const parsed = JSON.parse(rendered);
  assert.equal(parsed.model, "my-model");
  assert.equal(parsed.text, 'строка с "кавычками"\nи переводом строки');
  assert.equal(parsed.n, 256);
});

test("Custom template: сборка запроса и парсер по пользовательскому пути", () => {
  const cfg = openaiCfg({
    baseUrl: "https://my.local.host",
    apiPath: "/api/generate",
    requestFormat: "custom",
    rawTemplate:
      '{"model": "{{model}}", "system": "{{system_prompt}}", "prompt": "{{user_prompt}}", "opts": {"tokens": {{max_tokens}}, "temp": {{temperature}}}}',
    language: "ru",
    customLanguage: "",
    strictness: "balanced",
  });
  const { url, body } = custom.buildRequest(cfg, prompts);
  assert.equal(url, "https://my.local.host/api/generate");
  assert.equal(body.system, "SYSTEM PROMPT");
  assert.equal(body.prompt, "USER PROMPT");
  assert.equal(body.opts.tokens, 512);

  assert.equal(
    custom.parseResponse({ data: { output: [{ text: "готово" }] } }, "data.output[0].text"),
    "готово"
  );
  assert.throws(() => custom.parseResponse({ a: 1 }, "b.c"));
  assert.throws(() => custom.parseResponse({ a: 1 }, ""));
});

test("Custom template: невалидный JSON после подстановки — ошибка parse", () => {
  const cfg = openaiCfg({ rawTemplate: '{"broken": {{user_prompt}}}' });
  assert.throws(() => custom.buildRequest(cfg, prompts), /JSON/);
});
