import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyHttpStatus,
  sendRequest,
  runFactCheck,
  testConnection,
  getAdapter,
} from "../extension/src/background/apiClient.js";
import * as deepseekAdapter from "../extension/src/background/providerAdapters/deepseekOfficial.js";
import * as customAdapter from "../extension/src/background/providerAdapters/customTemplate.js";

function cfg(overrides = {}) {
  return {
    preset: "openai",
    presetLabel: "OpenAI-compatible",
    baseUrl: "https://api.openai.com",
    apiPath: "/v1/chat/completions",
    apiKey: "sk-test-key-0000000000",
    authMode: "bearer",
    customAuthHeader: "",
    extraHeaders: {},
    advancedBody: {},
    model: "gpt-4o-mini",
    requestFormat: "openai",
    responsePath: "",
    rawTemplate: "",
    maxTokens: 256,
    temperature: 0.2,
    timeoutSeconds: 30,
    maxRetries: 1,
    retryDelaySeconds: 0,
    stream: false,
    language: "ru",
    customLanguage: "",
    strictness: "balanced",
    prompts: undefined, // buildPrompts подставит дефолтные
    ...overrides,
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function openaiReply(content) {
  return { choices: [{ message: { content } }] };
}

// ---------- Классификация HTTP-ошибок (ТЗ 14, 18) ----------

test("classifyHttpStatus: 401/403 -> auth, не ретраится", () => {
  for (const status of [401, 403]) {
    const err = classifyHttpStatus(status, '{"error": "bad key"}');
    assert.equal(err.type, "auth");
    assert.equal(err.code, "unauthorized");
    assert.equal(err.retryable, false);
  }
});

test("classifyHttpStatus: 429 -> rate_limit, ретраится", () => {
  const err = classifyHttpStatus(429, "Too Many Requests");
  assert.equal(err.type, "rate_limit");
  assert.equal(err.retryable, true);
});

test("classifyHttpStatus: 429 insufficient_quota -> недостаток средств", () => {
  const err = classifyHttpStatus(429, '{"error":{"code":"insufficient_quota"}}');
  assert.equal(err.code, "insufficient_credits");
  assert.equal(err.retryable, false);
});

test("classifyHttpStatus: 402 -> недостаток средств", () => {
  const err = classifyHttpStatus(402, "Insufficient Balance");
  assert.equal(err.code, "insufficient_credits");
});

test("classifyHttpStatus: 404 -> model или base URL", () => {
  const modelErr = classifyHttpStatus(404, '{"error": "model not found"}');
  assert.equal(modelErr.type, "model");
  const urlErr = classifyHttpStatus(404, "<html>Not Found</html>");
  assert.equal(urlErr.type, "network");
  assert.equal(urlErr.code, "not_found");
});

test("classifyHttpStatus: 500 -> network, ретраится; секретов в technical нет", () => {
  const err = classifyHttpStatus(500, "Internal Server Error");
  assert.equal(err.type, "network");
  assert.equal(err.retryable, true);
  assert.ok(err.technical.includes("HTTP 500"));
});

// ---------- Выбор адаптера ----------

test("getAdapter: deepseek preset и custom format выбирают свои адаптеры", () => {
  assert.equal(getAdapter(cfg({ preset: "deepseek" })), deepseekAdapter);
  assert.equal(getAdapter(cfg({ requestFormat: "custom" })), customAdapter);
});

// ---------- sendRequest ----------

test("sendRequest: успешный запрос возвращает текст ответа", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, openaiReply("ответ модели"));
  };
  const { text } = await sendRequest(
    cfg(),
    { system: "s", user: "u" },
    { fetchImpl }
  );
  assert.equal(text, "ответ модели");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-test-key-0000000000");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messages[1].content, "u");
});

test("sendRequest: 500 ретраится и восстанавливается", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    return n === 1
      ? jsonResponse(500, { error: "oops" })
      : jsonResponse(200, openaiReply("ok"));
  };
  const { text } = await sendRequest(cfg(), { system: "s", user: "u" }, { fetchImpl });
  assert.equal(text, "ok");
  assert.equal(n, 2);
});

test("sendRequest: 401 не ретраится", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    return jsonResponse(401, { error: "bad key" });
  };
  await assert.rejects(
    sendRequest(cfg(), { system: "s", user: "u" }, { fetchImpl }),
    (e) => e.type === "auth"
  );
  assert.equal(n, 1);
});

test("sendRequest: таймаут (AbortError) — ошибка network/timeout", async () => {
  const fetchImpl = async () => {
    throw Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
  };
  await assert.rejects(
    sendRequest(cfg({ maxRetries: 0 }), { system: "s", user: "u" }, { fetchImpl }),
    (e) => e.type === "network" && e.code === "timeout"
  );
});

test("sendRequest: не-JSON ответ — ошибка parse", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("Unexpected token <");
    },
    text: async () => "<html></html>",
  });
  await assert.rejects(
    sendRequest(cfg(), { system: "s", user: "u" }, { fetchImpl }),
    (e) => e.type === "parse"
  );
});

// ---------- runFactCheck (JSON extraction в pipeline) ----------

test("runFactCheck: полный pipeline с JSON, обёрнутым текстом", async () => {
  const modelJson = {
    claims: [
      {
        claim: "Тестовое утверждение",
        verdict: "UNVERIFIABLE",
        confidence: 0.4,
        explanation: "Нет доступа к источникам.",
        sources: [],
        needs_manual_review: false,
      },
    ],
  };
  const replyText = "Вот результат:\n```json\n" + JSON.stringify(modelJson) + "\n```";
  let sentBody = null;
  const fetchImpl = async (url, init) => {
    sentBody = JSON.parse(init.body);
    return jsonResponse(200, openaiReply(replyText));
  };
  const result = await runFactCheck(cfg(), "  Проверь   этот    текст  ", { fetchImpl });
  assert.equal(result.claims.length, 1);
  assert.equal(result.claims[0].verdict, "UNVERIFIABLE");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.endpoint, "https://api.openai.com/v1/chat/completions");
  // Текст очищен от лишних пробелов перед отправкой.
  assert.ok(sentBody.messages[1].content.includes("Проверь этот текст"));
});

test("runFactCheck: пустой вход — ошибка", async () => {
  await assert.rejects(runFactCheck(cfg(), "   ", {}), /Пустой/i);
});

test("runFactCheck: не-JSON ответ ретраится с напоминанием о формате", async () => {
  let n = 0;
  let secondUserPrompt = "";
  const fetchImpl = async (url, init) => {
    n++;
    const body = JSON.parse(init.body);
    if (n === 1) {
      return jsonResponse(200, openaiReply("Здесь нет проверяемых утверждений."));
    }
    secondUserPrompt = body.messages[1].content;
    return jsonResponse(200, openaiReply('{"claims": []}'));
  };
  const result = await runFactCheck(cfg(), "просто приветствие без фактов", { fetchImpl });
  assert.equal(n, 2);
  assert.deepEqual(result.claims, []);
  assert.ok(secondUserPrompt.includes("строго один JSON-объект"));
});

test("runFactCheck: если и повтор не JSON — ошибка parse", async () => {
  const fetchImpl = async () => jsonResponse(200, openaiReply("всё ещё не JSON"));
  await assert.rejects(
    runFactCheck(cfg(), "текст", { fetchImpl }),
    (e) => e.type === "parse"
  );
});

// ---------- testConnection ----------

test("testConnection: success", async () => {
  const fetchImpl = async () => jsonResponse(200, openaiReply("ok"));
  const result = await testConnection(cfg(), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
});

test("testConnection: различает типы ошибок", async () => {
  const cases = [
    [jsonResponse(401, { error: "x" }), "unauthorized"],
    [jsonResponse(429, { error: "x" }), "rate_limit"],
    [jsonResponse(402, { error: "insufficient balance" }), "insufficient_credits"],
    [jsonResponse(404, { error: "model not found" }), "model_not_found"],
    [jsonResponse(404, {}), "invalid_base_url"],
  ];
  for (const [response, expected] of cases) {
    const result = await testConnection(cfg(), { fetchImpl: async () => response });
    assert.equal(result.ok, false);
    assert.equal(result.status, expected, `ожидался статус ${expected}`);
  }
});

test("testConnection: сетевая ошибка (TypeError) -> cors_or_permission", async () => {
  const fetchImpl = async () => {
    throw new TypeError("NetworkError when attempting to fetch resource.");
  };
  const result = await testConnection(cfg(), { fetchImpl });
  assert.equal(result.status, "cors_or_permission");
});
