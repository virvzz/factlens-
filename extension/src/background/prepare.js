// Подготовка конфигурации перед запросом: настройки, валидация,
// проверка host permission. Используется и разовыми проверками,
// и live-очередью.

import { loadSettings, effectiveConfig } from "../shared/settings.js";
import { joinUrl, validateUrl } from "../shared/validators.js";
import { ApiError } from "../shared/errors.js";
import { registerSecret } from "../shared/logger.js";

export async function ensureOriginPermission(url) {
  const parsed = validateUrl(url);
  if (!parsed.ok) {
    throw new ApiError("network", `Некорректный endpoint URL: ${parsed.error}.`, {
      code: "bad_url",
    });
  }
  const originPattern = `${parsed.origin}/*`;
  const api = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome
  const granted = await api.permissions.contains({
    origins: [originPattern],
  });
  if (!granted) {
    throw new ApiError(
      "permission",
      `Нет разрешения на запросы к ${parsed.origin}. Откройте настройки и нажмите «Сохранить настройки», чтобы выдать разрешение.`,
      { code: "no_host_permission" }
    );
  }
}

/** Загружает и валидирует настройки; бросает ApiError, если что-то не так. */
export async function prepareConfig() {
  const settings = await loadSettings();
  const cfg = effectiveConfig(settings);
  if (cfg.apiKey) registerSecret(cfg.apiKey);
  if (!cfg.baseUrl) {
    throw new ApiError("network", "Не задан base URL. Откройте настройки.", {
      code: "not_configured",
    });
  }
  if (!cfg.model) {
    throw new ApiError("model", "Не задана модель. Откройте настройки.", {
      code: "not_configured",
    });
  }
  if (!cfg.apiKey && cfg.authMode !== "none") {
    throw new ApiError("auth", "Не задан API key. Откройте настройки.", {
      code: "not_configured",
    });
  }
  await ensureOriginPermission(joinUrl(cfg.baseUrl, cfg.apiPath));
  return cfg;
}
