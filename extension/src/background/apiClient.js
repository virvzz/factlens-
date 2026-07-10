// HTTP-клиент: выбор адаптера, таймаут, ретраи, классификация ошибок (ТЗ 14),
// fact-check pipeline (ТЗ 9) и test connection.

import { ApiError, toApiError } from "../shared/errors.js";
import { cleanInputText } from "../shared/sanitizer.js";
import { buildPrompts } from "../shared/prompts.js";
import { extractJson, normalizeClaims } from "../shared/resultParser.js";
import { joinUrl } from "../shared/validators.js";
import * as anthropicMessages from "./providerAdapters/anthropicMessages.js";
import * as openaiChatCompletions from "./providerAdapters/openaiChatCompletions.js";
import * as deepseekOfficial from "./providerAdapters/deepseekOfficial.js";
import * as customTemplate from "./providerAdapters/customTemplate.js";

/** Выбор адаптера по request format / preset. */
export function getAdapter(cfg) {
  if (cfg.requestFormat === "custom") return customTemplate;
  if (cfg.preset === "deepseek") return deepseekOfficial;
  if (cfg.requestFormat === "anthropic") return anthropicMessages;
  return openaiChatCompletions;
}

const CREDIT_MARKERS = [
  "insufficient_quota",
  "insufficient balance",
  "insufficient credits",
  "insufficient funds",
  "exceeded your current quota",
  "billing",
];

/** Классифицирует HTTP-ошибку по статусу и телу ответа. */
export function classifyHttpStatus(status, bodyText = "") {
  const body = String(bodyText || "").slice(0, 1000);
  const lower = body.toLowerCase();
  const technical = `HTTP ${status}: ${body.slice(0, 300)}`;

  const looksLikeCredits = CREDIT_MARKERS.some((m) => lower.includes(m));

  if (status === 402 || ((status === 429 || status === 403) && looksLikeCredits)) {
    return new ApiError(
      "auth",
      "Недостаточно средств или квоты у провайдера.",
      { technical, code: "insufficient_credits" }
    );
  }
  if (status === 401 || status === 403) {
    return new ApiError(
      "auth",
      "Ошибка авторизации: проверьте API key и auth mode.",
      { technical, code: "unauthorized" }
    );
  }
  if (status === 429) {
    return new ApiError("rate_limit", "Превышен лимит запросов. Попробуйте позже.", {
      technical,
      retryable: true,
      code: "rate_limit",
    });
  }
  if (status === 404) {
    if (lower.includes("model")) {
      return new ApiError("model", "Модель не найдена: проверьте имя модели.", {
        technical,
        code: "model_not_found",
      });
    }
    return new ApiError(
      "network",
      "Endpoint не найден (404): проверьте base URL и path.",
      { technical, code: "not_found" }
    );
  }
  if (status === 400 && lower.includes("model")) {
    return new ApiError("model", "Провайдер отклонил модель: проверьте имя модели.", {
      technical,
      code: "model_not_found",
    });
  }
  if (status >= 500) {
    return new ApiError(
      "network",
      `Ошибка на стороне провайдера (HTTP ${status}). Попробуйте позже.`,
      { technical, retryable: true, code: "server_error" }
    );
  }
  return new ApiError("unknown", `Провайдер вернул ошибку (HTTP ${status}).`, {
    technical,
    code: "http_error",
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Отправляет один chat-запрос через выбранный адаптер.
 * Ретраит только retryable-ошибки (сеть, 429, 5xx) до cfg.maxRetries раз.
 *
 * @returns {Promise<{text: string, json: object, url: string}>}
 */
export async function sendRequest(cfg, prompts, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const adapter = getAdapter(cfg);
  const { url, headers, body } = adapter.buildRequest(cfg, prompts);
  const maxRetries = Math.max(0, cfg.maxRetries | 0);

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(Math.max(0, cfg.retryDelaySeconds * 1000));
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1, cfg.timeoutSeconds) * 1000
    );

    let response = null;
    let error = null;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        error = new ApiError(
          "network",
          `Таймаут запроса (${cfg.timeoutSeconds} с).`,
          { retryable: true, code: "timeout" }
        );
      } else {
        error = new ApiError(
          "network",
          "Сетевая ошибка: неверный адрес, CORS или нет разрешения на этот origin.",
          {
            technical: String((e && e.message) || e),
            retryable: true,
            code: "network",
          }
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (!error && !response.ok) {
      const bodyText = await response.text().catch(() => "");
      error = classifyHttpStatus(response.status, bodyText);
    }

    if (error) {
      lastError = error;
      if (error.retryable && attempt < maxRetries) continue;
      throw error;
    }

    let json;
    try {
      json = await response.json();
    } catch (e) {
      throw new ApiError("parse", "Ответ endpoint не является JSON.", {
        technical: String((e && e.message) || e),
        code: "not_json",
      });
    }

    let text;
    try {
      text = adapter.parseResponse(json, cfg.responsePath);
    } catch (e) {
      throw new ApiError(
        "parse",
        "Не удалось извлечь текст ответа: проверьте response parser path.",
        { technical: String((e && e.message) || e), code: "bad_response_path" }
      );
    }
    return { text, json, url };
  }

  throw lastError || new ApiError("unknown", "Запрос не выполнен.");
}

/**
 * Полный fact-check pipeline (ТЗ 9): очистка текста, промпты, запрос,
 * извлечение JSON, нормализация claims.
 */
export async function runFactCheck(cfg, rawText, deps = {}) {
  const { text, truncated } = cleanInputText(rawText);
  if (!text) {
    throw new ApiError("unknown", "Пустой текст для проверки.", {
      code: "empty_input",
    });
  }
  const prompts = buildPrompts(cfg, text);
  const { text: replyText } = await sendRequest(cfg, prompts, deps);
  let parsed;
  try {
    parsed = extractJson(replyText);
  } catch {
    // Модель ответила текстом вместо JSON (бывает на фрагментах без
    // фактов). Одна повторная попытка с жёстким напоминанием о формате.
    const retryPrompts = {
      system: prompts.system,
      user:
        prompts.user +
        '\n\nВАЖНО: ответ — строго один JSON-объект по схеме, без какого-либо текста вне JSON. Если проверяемых фактических утверждений нет, верни {"claims": []}.',
    };
    const second = await sendRequest(cfg, retryPrompts, deps);
    parsed = extractJson(second.text); // если снова не JSON — ошибка parse
  }
  const { claims, dropped } = normalizeClaims(parsed);
  return {
    claims,
    dropped,
    truncated,
    inputPreview: text.slice(0, 160),
    provider: cfg.presetLabel || cfg.preset,
    model: cfg.model,
    endpoint: joinUrl(cfg.baseUrl, cfg.apiPath),
    checkedAt: Date.now(),
  };
}

export const TEST_STATUSES = [
  "success",
  "unauthorized",
  "invalid_base_url",
  "cors_or_permission",
  "model_not_found",
  "insufficient_credits",
  "rate_limit",
  "parse_error",
  "unknown",
];

function testStatusFromError(err) {
  const e = toApiError(err);
  if (e.type === "auth") {
    return e.code === "insufficient_credits"
      ? "insufficient_credits"
      : "unauthorized";
  }
  if (e.type === "rate_limit") return "rate_limit";
  if (e.type === "model") return "model_not_found";
  if (e.type === "parse") return "parse_error";
  if (e.type === "permission") return "cors_or_permission";
  if (e.type === "network") {
    if (e.code === "not_found") return "invalid_base_url";
    return "cors_or_permission";
  }
  return "unknown";
}

/**
 * Test connection (ТЗ 7, 14): короткий запрос к endpoint,
 * различает success / unauthorized / invalid base URL / CORS / model /
 * credits / rate limit / parse / unknown.
 */
export async function testConnection(cfg, deps = {}) {
  const testCfg = {
    ...cfg,
    maxTokens: Math.min(64, cfg.maxTokens || 64),
    maxRetries: 0,
    timeoutSeconds: Math.min(30, cfg.timeoutSeconds || 30),
  };
  const prompts = {
    system: "You are a connection test. Reply with the single word: ok",
    user: "ping",
  };
  try {
    const { text, url } = await sendRequest(testCfg, prompts, deps);
    return {
      ok: true,
      status: "success",
      message: "Соединение работает: ответ модели получен.",
      sample: String(text).slice(0, 120),
      endpoint: url,
    };
  } catch (err) {
    const e = toApiError(err);
    return {
      ok: false,
      status: testStatusFromError(e),
      message: e.message,
      technical: e.technical,
      error: e.toPlain(),
    };
  }
}
