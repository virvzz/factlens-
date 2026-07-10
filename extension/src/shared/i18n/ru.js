// Русская локализация (основной язык MVP).

export default {
  // Verdict labels (ТЗ 9.2).
  "verdict.TRUE": "Верно",
  "verdict.MOSTLY_TRUE": "В основном верно",
  "verdict.MISLEADING": "Вводит в заблуждение",
  "verdict.FALSE": "Ложно",
  "verdict.UNVERIFIABLE": "Невозможно проверить",
  "verdict.OPINION_NOT_CHECK_WORTHY": "Мнение / не требует фактчекинга",

  // Статусы.
  "status.idle": "Ожидание",
  "status.checking": "Проверка…",
  "status.done": "Готово",
  "status.error": "Ошибка",

  // Test connection.
  "test.success": "Соединение работает",
  "test.unauthorized": "Ошибка авторизации: проверьте API key и auth mode",
  "test.invalid_base_url": "Endpoint не найден: проверьте base URL и path",
  "test.cors_or_permission": "Сетевая ошибка: неверный адрес, CORS или нет разрешения на origin",
  "test.model_not_found": "Модель не найдена: проверьте имя модели",
  "test.insufficient_credits": "Недостаточно средств или квоты у провайдера",
  "test.rate_limit": "Превышен лимит запросов, попробуйте позже",
  "test.parse_error": "Ответ получен, но не удалось его разобрать",
  "test.unknown": "Неизвестная ошибка",

  // Общие строки UI, используемые из JS.
  "ui.noSelection": "Сначала выделите текст на странице.",
  "ui.noPageAccess":
    "Нет доступа к этой странице (системные страницы Firefox недоступны). Вставьте текст вручную.",
  "ui.emptyText": "Введите или вставьте текст для проверки.",
  "ui.noClaims": "Проверяемых фактических утверждений не найдено.",
  "ui.truncated": "Текст был длиннее лимита и был обрезан.",
  "ui.copied": "Скопировано",
  "ui.speaker": "Кто утверждает",
  "ui.sources": "Источники",
  "ui.needsReview": "Требует ручной проверки",
  "ui.confidence": "Уверенность",
  "ui.disclaimer":
    "Автоматический фактчекинг может ошибаться. Не используйте результат как окончательный источник истины.",
};
