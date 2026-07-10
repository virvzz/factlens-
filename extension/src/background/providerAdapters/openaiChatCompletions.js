// Адаптер OpenAI Chat Completions (ТЗ 8.2).

import { joinUrl, getByPath } from "../../shared/validators.js";
import { buildAuthHeaders } from "../../shared/auth.js";

export const id = "openai";

export const DEFAULT_RESPONSE_PATH = "choices[0].message.content";

/**
 * @param {object} cfg - эффективная конфигурация (settings.effectiveConfig)
 * @param {{system: string, user: string}} prompts
 * @returns {{url: string, headers: object, body: object}}
 */
export function buildRequest(cfg, prompts) {
  const url = joinUrl(cfg.baseUrl, cfg.apiPath);
  const headers = {
    "content-type": "application/json",
    ...cfg.extraHeaders,
    ...buildAuthHeaders(cfg),
  };
  const body = {
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    messages: [
      { role: "system", content: prompts.system },
      { role: "user", content: prompts.user },
    ],
    ...(cfg.advancedBody || {}),
  };
  return { url, headers, body };
}

export function parseResponse(json, responsePath) {
  const viaPath = getByPath(json, responsePath || DEFAULT_RESPONSE_PATH);
  if (typeof viaPath === "string" && viaPath) return viaPath;
  // Reasoning-модели (DeepSeek и т.п.): весь лимит токенов ушёл на
  // размышления, content пустой — подсказываем причину явно.
  const choice = json && Array.isArray(json.choices) ? json.choices[0] : null;
  const message = choice && choice.message;
  if (
    message &&
    !message.content &&
    (message.reasoning_content || (choice && choice.finish_reason === "length"))
  ) {
    throw new Error(
      "модель потратила лимит токенов на размышления (reasoning) и не вернула ответ — увеличьте Max tokens (например, до 4096) или отключите thinking через «Дополнительные поля тела запроса»"
    );
  }
  throw new Error(
    `не найден текст по пути "${responsePath || DEFAULT_RESPONSE_PATH}"`
  );
}
