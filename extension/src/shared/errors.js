// Единый формат ошибок расширения (ТЗ, раздел 14).

export const ERROR_TYPES = [
  "auth",
  "network",
  "rate_limit",
  "model",
  "parse",
  "permission",
  "unknown",
];

export class ApiError extends Error {
  /**
   * @param {string} type - один из ERROR_TYPES
   * @param {string} message - сообщение для пользователя (на русском)
   * @param {{technical?: string, retryable?: boolean, code?: string}} [opts]
   */
  constructor(type, message, opts = {}) {
    super(message);
    this.name = "ApiError";
    this.type = ERROR_TYPES.includes(type) ? type : "unknown";
    this.technical = String(opts.technical || "");
    this.retryable = Boolean(opts.retryable);
    // Машиночитаемый код для более точной диагностики (test connection).
    this.code = String(opts.code || "");
  }

  toPlain() {
    return {
      type: this.type,
      message: this.message,
      technical: this.technical,
      retryable: this.retryable,
      code: this.code,
    };
  }
}

/** Приводит произвольное исключение к ApiError, не теряя данные. */
export function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err && typeof err === "object" && ERROR_TYPES.includes(err.type)) {
    return new ApiError(err.type, err.message || "Неизвестная ошибка", {
      technical: err.technical,
      retryable: err.retryable,
      code: err.code,
    });
  }
  return new ApiError("unknown", "Неизвестная ошибка", {
    technical: String((err && err.message) || err || ""),
  });
}
