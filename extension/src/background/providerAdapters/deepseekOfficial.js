// Адаптер DeepSeek official (ТЗ 8.3): OpenAI-compatible формат.
// Provider-specific поля (reasoning/thinking) добавляются через
// advancedBody (секция "Дополнительные поля тела запроса" в настройках).

import * as openai from "./openaiChatCompletions.js";

export const id = "deepseek";

export const DEFAULT_RESPONSE_PATH = openai.DEFAULT_RESPONSE_PATH;

// Устаревающие модели: работают, но не рекомендуются как дефолт (ТЗ 6.3).
export const LEGACY_MODELS = ["deepseek-chat", "deepseek-reasoner"];

export function isLegacyModel(model) {
  return LEGACY_MODELS.includes(String(model || "").trim());
}

export const buildRequest = openai.buildRequest;
export const parseResponse = openai.parseResponse;
