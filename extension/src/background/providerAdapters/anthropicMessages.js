// Адаптер Anthropic Messages API (ТЗ 8.1).

import { joinUrl, getByPath } from "../../shared/validators.js";
import { buildAuthHeaders } from "../../shared/auth.js";

export const id = "anthropic";

export const DEFAULT_RESPONSE_PATH = "content[0].text";

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
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
    system: prompts.system,
    messages: [{ role: "user", content: prompts.user }],
    ...(cfg.advancedBody || {}),
  };
  return { url, headers, body };
}

/**
 * Извлекает текст ответа. Основной путь — responsePath (по умолчанию
 * content[0].text); fallback — первый блок типа "text".
 */
export function parseResponse(json, responsePath) {
  const viaPath = getByPath(json, responsePath || DEFAULT_RESPONSE_PATH);
  if (typeof viaPath === "string" && viaPath) return viaPath;
  if (Array.isArray(json && json.content)) {
    const block = json.content.find(
      (b) => b && b.type === "text" && typeof b.text === "string"
    );
    if (block) return block.text;
  }
  throw new Error(
    `не найден текст по пути "${responsePath || DEFAULT_RESPONSE_PATH}"`
  );
}
