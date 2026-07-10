// Формирование auth-заголовков по выбранному auth mode (ТЗ 7.2).

export const AUTH_MODES = ["x-api-key", "bearer", "custom", "none"];

/**
 * @param {{authMode?: string, apiKey?: string, customAuthHeader?: string}} cfg
 * @returns {Record<string, string>}
 */
export function buildAuthHeaders(cfg) {
  const key = String(cfg.apiKey || "");
  switch (cfg.authMode) {
    case "x-api-key":
      return key ? { "x-api-key": key } : {};
    case "bearer":
      return key ? { authorization: `Bearer ${key}` } : {};
    case "custom": {
      const name = String(cfg.customAuthHeader || "").trim().toLowerCase();
      return name && key ? { [name]: key } : {};
    }
    case "none":
    default:
      return {};
  }
}
