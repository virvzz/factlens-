// Адаптер Custom raw HTTP (ТЗ 6.6): пользовательский JSON-шаблон тела
// с переменными {{model}}, {{system_prompt}}, {{user_prompt}},
// {{max_tokens}}, {{temperature}}, {{language}}, {{strictness}}.

import { joinUrl, getByPath } from "../../shared/validators.js";
import { buildAuthHeaders } from "../../shared/auth.js";
import { ApiError } from "../../shared/errors.js";

export const id = "custom";

/**
 * Подставляет переменные в JSON-шаблон.
 * Строковые значения экранируются как содержимое JSON-строки
 * (шаблон должен содержать их в кавычках: "{{user_prompt}}").
 * Числовые значения подставляются как есть: {{max_tokens}}.
 */
export function renderTemplate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (whole, name) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
    const v = vars[name];
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    // JSON-экранирование без внешних кавычек.
    return JSON.stringify(String(v ?? "")).slice(1, -1);
  });
}

export function buildRequest(cfg, prompts) {
  const url = joinUrl(cfg.baseUrl, cfg.apiPath);
  const headers = {
    "content-type": "application/json",
    ...cfg.extraHeaders,
    ...buildAuthHeaders(cfg),
  };
  const rendered = renderTemplate(cfg.rawTemplate, {
    model: cfg.model,
    system_prompt: prompts.system,
    user_prompt: prompts.user,
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
    language: cfg.language === "custom" ? cfg.customLanguage : cfg.language,
    strictness: cfg.strictness,
  });
  let body;
  try {
    body = JSON.parse(rendered);
  } catch (e) {
    throw new ApiError(
      "parse",
      "Custom raw HTTP шаблон после подстановки переменных не является валидным JSON.",
      { technical: String(e.message || e) }
    );
  }
  return { url, headers, body };
}

export function parseResponse(json, responsePath) {
  if (!responsePath) {
    throw new Error("для custom raw HTTP нужно задать response path");
  }
  const viaPath = getByPath(json, responsePath);
  if (typeof viaPath === "string" && viaPath) return viaPath;
  throw new Error(`не найден текст по пути "${responsePath}"`);
}
