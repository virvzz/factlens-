# ТЗ: Firefox WebExtension для fact-checking с настраиваемыми AI API

## 1. Цель

Разработать независимое расширение для Firefox Desktop в формате WebExtension. Расширение помогает пользователю проверять фактические утверждения из текста, субтитров, транскриптов и, на следующих этапах, из аудио/видео.

Функционально продукт может быть похож на идею InTruth: пользователь открывает страницу, видео, стрим, интервью, дебаты или выступление; расширение извлекает текстовые фрагменты, находит проверяемые фактические утверждения и показывает предварительную оценку достоверности с объяснением.

Расширение должно быть самостоятельной реализацией. Нельзя копировать чужой код, название, бренд, иконки, UI-дизайн или приватные API оригинального InTruth.

Ключевое отличие: пользователь сам настраивает AI provider и API endpoint. Расширение не использует скрытые серверы разработчика и не отправляет данные куда-либо, кроме явно выбранного пользователем endpoint.

## 2. Главный принцип продукта

Расширение не является окончательным источником истины. Оно показывает предварительную оценку и помогает пользователю быстрее увидеть спорные утверждения.

Если выбранный AI provider не имеет доступа к web search, tools или надежной базе источников, модель не должна выдумывать источники и обязана возвращать `UNVERIFIABLE` для утверждений, которые невозможно проверить без актуальных данных.

В интерфейсе обязательно показывать предупреждение:

```text
Автоматический фактчекинг может ошибаться. Не используйте результат как окончательный источник истины.
```

## 3. Целевая платформа

Целевая платформа: Firefox Desktop.

Формат: WebExtension.

Предпочтительно использовать Manifest V3, если выбранная архитектура стабильно работает в Firefox. Если фоновые процессы, аудио или долгие сессии требуют Manifest V2, допускается подготовить MV2 fallback, но это нужно обосновать в README.

Использовать стандартный WebExtensions API через `browser.*`. При необходимости добавить минимальный polyfill.

## 4. Этапы разработки

### Этап 1 - MVP без аудио

Цель этапа: сделать стабильное расширение, которое проверяет выделенный и вручную вставленный текст.

Обязательные возможности:

* Firefox extension scaffold.
* `manifest.json`.
* Popup.
* Options page.
* Хранение настроек через `browser.storage.local`.
* Настройка provider/base URL/path/model/auth/request format.
* API adapters:
  * Anthropic Messages API;
  * OpenAI Chat Completions;
  * DeepSeek official через OpenAI-compatible формат.
* Test connection.
* Проверка выделенного текста.
* Проверка вручную вставленного текста.
* Отображение результата в popup или overlay.
* Безопасное логирование без API key.
* README с инструкциями.
* Unit-тесты для критичной логики.
* `web-ext lint` без критических ошибок.

### Этап 2 - Overlay, субтитры и YouTube

Цель этапа: приблизиться к live-сценарию без обязательного аудиозахвата.

Обязательные возможности:

* Content script overlay поверх страницы.
* Извлечение доступного выделенного текста со страницы.
* YouTube captions/transcript extraction, если данные доступны в DOM или через легальный публичный механизм страницы.
* Generic captions extraction для страниц, где субтитры доступны в HTML/video track.
* Очередь фрагментов.
* Разбиение текста на чанки.
* Claim queue.
* Pause/resume.
* Отображение статусов: idle, reading, checking, error.

### Этап 3 - Аудио и STT (обязательный)

Цель этапа: распознавание звука видео в Firefox.

Важно: `chrome.tabCapture` и `offscreen` из Chrome в Firefox не работают.
Захват аудио через `getDisplayMedia({ audio: true })` в Firefox также
фактически недоступен. Поэтому основной механизм другой:

**Захват звука напрямую из элемента `<video>`** через Web Audio API:
`AudioContext` + `createMediaElementSource` (плюс обратное подключение к
`destination`, чтобы пользователь продолжал слышать звук). Запись кусками
по 10-30 секунд через `MediaRecorder` (webm/ogg opus), отправка на
**внешний STT endpoint**, настроенный пользователем (Whisper-совместимый
API, `/v1/audio/transcriptions`, multipart/form-data). Распознанный текст
поступает в тот же конвейер чанков/claims, что и субтитры (Этап 2).

Требования:

* Отдельная секция STT в настройках: base URL, path, API key (маскируется,
  не экспортируется), auth mode, модель, язык, длина куска, response path.
* Быстрые пресеты: OpenAI (`whisper-1`), Groq (`whisper-large-v3`),
  локальный Whisper-сервер.
* Test connection для STT (тестовый тихий фрагмент).
* Детекция тишины (AnalyserNode): пустые куски не отправляются на STT.
* Runtime host permission на STT origin — как для основного AI endpoint.

Порядок источников текста:

1. Выделенный текст.
2. Ручной ввод.
3. Субтитры/транскрипт.
4. Звук `<video>` через Web Audio + STT.

Известные ограничения (не считать ошибкой расширения):

* DRM-видео (EME) и CORS-закрытые плееры отдают тишину — захват невозможен.
* Mute/volume=0 элемента глушат захват — звук видео должен быть включён.

Если аудио недоступно, расширение не должно падать. Нужно показать сообщение:

```text
Звук не захватывается (DRM/CORS или звук выключен). Используйте субтитры, выделенный текст или ручной ввод.
```

STT варианты:

* Внешний STT endpoint, настроенный пользователем (основной вариант).
* Браузерный Web Speech API в Firefox нерабочий — не использовать.

### Этап 4 - Улучшения

Возможные улучшения:

* Sidebar mode.
* История проверок только по явному включению пользователя.
* Импорт/экспорт настроек без API key.
* Горячие клавиши.
* Streaming responses.
* Better source verification.
* Поддержка web-search/tool-enabled providers.
* Расширенные STT providers.

## 5. Основные пользовательские сценарии

### 5.1. Проверка выделенного текста

Пользователь выделяет текст на странице и запускает проверку через popup или context menu.

Расширение:

1. Получает выделенный текст.
2. Показывает пользователю, какой provider и base URL будут использованы.
3. Отправляет текст в выбранный AI API.
4. Получает JSON-результат.
5. Показывает список claims, verdict, confidence, explanation и sources.

### 5.2. Проверка вручную вставленного текста

Пользователь открывает popup, вставляет текст и нажимает кнопку анализа.

Расширение выполняет тот же pipeline, что и для выделенного текста.

### 5.3. Проверка субтитров/транскрипта

Пользователь открывает видео или страницу с доступными субтитрами/транскриптом.

Расширение:

1. Проверяет, есть ли доступные captions/transcript.
2. Показывает найденный источник текста.
3. Разбивает текст на фрагменты.
4. Отправляет фрагменты по очереди.
5. Обновляет overlay с результатами.

### 5.4. Проверка видео/стрима через аудио

Этот сценарий относится к этапу 3.

Захват звука запускается только по явному действию пользователя (выбор
источника «Распознавание звука» в overlay). Звук берётся из элемента
`<video>` через Web Audio API и отправляется кусками на STT endpoint,
настроенный пользователем. Если захват невозможен (DRM, CORS, mute),
предлагаются fallback-источники: субтитры, выделенный текст, ручной ввод.

## 6. Provider presets

В настройках должен быть список provider presets:

* Anthropic official.
* OpenAI-compatible.
* DeepSeek official.
* Artemox / custom OpenAI-compatible.
* Custom Anthropic-compatible.
* Custom raw HTTP.

### 6.1. Anthropic official

Default settings:

```text
base URL: https://api.anthropic.com
path: /v1/messages
auth: x-api-key
request format: Anthropic Messages API
response parser: content[0].text
headers:
  content-type: application/json
  anthropic-version: 2023-06-01
```

Model не зашивать жестко. Можно предложить примеры:

```text
claude-sonnet-4-20250514
claude-3-7-sonnet-latest
```

### 6.2. OpenAI-compatible

Default settings:

```text
base URL: https://api.openai.com
path: /v1/chat/completions
auth: Authorization: Bearer
request format: OpenAI Chat Completions
response parser: choices[0].message.content
headers:
  content-type: application/json
```

Model редактируемый.

### 6.3. DeepSeek official

DeepSeek должен быть отдельным preset, а не только custom endpoint.

По состоянию на 2026-07-09, официальный DeepSeek API совместим с OpenAI/Anthropic API. Для MVP использовать OpenAI-compatible формат.

Default settings:

```text
base URL: https://api.deepseek.com
path: /chat/completions
auth: Authorization: Bearer
request format: OpenAI Chat Completions
response parser: choices[0].message.content
headers:
  content-type: application/json
```

Default model suggestions:

```text
deepseek-v4-flash
deepseek-v4-pro
```

Не использовать устаревающие модели как дефолт. `deepseek-chat` и `deepseek-reasoner` можно оставить только как совместимые legacy options с предупреждением, если они еще доступны у пользователя.

Для reasoning/thinking-параметров DeepSeek добавить расширяемую секцию advanced JSON body options, но не делать ее обязательной в MVP.

### 6.4. Artemox / custom OpenAI-compatible

Default settings:

```text
base URL: https://api.artemox.com/v1
path: /chat/completions
auth: Authorization: Bearer
request format: OpenAI Chat Completions
response parser: choices[0].message.content
```

### 6.5. Custom Anthropic-compatible

Пользователь задает:

* base URL;
* path;
* auth mode;
* model;
* headers;
* response parser.

### 6.6. Custom raw HTTP

Пользователь задает JSON template.

Поддерживаемые переменные:

```text
{{model}}
{{system_prompt}}
{{user_prompt}}
{{max_tokens}}
{{temperature}}
{{language}}
{{strictness}}
```

Пользователь задает response path вручную.

## 7. Настройки API

Options page должна содержать:

* Provider preset.
* Base URL.
* API path.
* API key.
* Auth mode.
* Custom auth header name.
* Additional headers.
* Model.
* Recent models.
* Request format.
* Response parser.
* Generation settings.
* Prompt templates.
* Test connection.
* Export settings without key.
* Import settings.
* Clear key.
* Clear local data.

### 7.1. API key

Требования:

* Поле пароля.
* Не логировать ключ.
* Не показывать ключ целиком после сохранения.
* Показывать только маску: первые 6-8 символов и последние 4 символа.
* При экспорте настроек исключать API key.

Кнопки:

* Save.
* Test connection.
* Clear key.
* Export settings without key.

### 7.2. Auth mode

Поддержать:

* `x-api-key: <key>`.
* `Authorization: Bearer <key>`.
* Custom header name.

Для Anthropic official default: `x-api-key`.

Для OpenAI-compatible, DeepSeek official и Artemox-like default: `Authorization: Bearer`.

### 7.3. Base URL и path

Требования:

* Нормально обрабатывать завершающий `/`.
* Не удваивать `/v1`, если base URL уже содержит `/v1`, а path задан как `/chat/completions`.
* Валидировать URL.
* Показывать origin, куда будет отправлен текст.

Примеры:

```text
https://api.anthropic.com + /v1/messages -> https://api.anthropic.com/v1/messages
https://api.anthropic.com/v1 + /messages -> https://api.anthropic.com/v1/messages
https://api.deepseek.com + /chat/completions -> https://api.deepseek.com/chat/completions
https://api.artemox.com/v1 + /chat/completions -> https://api.artemox.com/v1/chat/completions
```

### 7.4. Generation settings

Поля:

* max tokens;
* temperature;
* timeout seconds;
* max retries;
* retry delay;
* stream on/off;
* language of output: auto / ru / en / custom;
* fact-check strictness: lenient / balanced / strict.

## 8. API adapters

### 8.1. Anthropic Messages API

Request body:

```json
{
  "model": "<model>",
  "max_tokens": 1024,
  "temperature": 0.2,
  "system": "<system_prompt>",
  "messages": [
    {
      "role": "user",
      "content": "<user_prompt>"
    }
  ]
}
```

Response parser:

```text
content[0].text
```

### 8.2. OpenAI Chat Completions

Request body:

```json
{
  "model": "<model>",
  "temperature": 0.2,
  "max_tokens": 1024,
  "messages": [
    {
      "role": "system",
      "content": "<system_prompt>"
    },
    {
      "role": "user",
      "content": "<user_prompt>"
    }
  ]
}
```

Response parser:

```text
choices[0].message.content
```

### 8.3. DeepSeek official

Использовать OpenAI Chat Completions adapter.

Для advanced options разрешить добавлять provider-specific поля в request body, например reasoning/thinking options, но сохранять базовый MVP совместимым с обычным OpenAI-compatible форматом.

## 9. Fact-checking pipeline

Pipeline:

1. Получить входной текст.
2. Очистить текст от лишней разметки.
3. Разбить на фрагменты.
4. Выделить проверяемые claims.
5. Отправить claims в fact-check prompt.
6. Получить строгий JSON.
7. Извлечь JSON даже если модель обернула его текстом.
8. Провалидировать структуру.
9. Показать результат пользователю.

### 9.1. Проверяемые claims

Проверять:

* конкретные факты;
* числа и статистику;
* даты;
* исторические события;
* законы, решения, голосования;
* публичные заявления;
* научные/медицинские утверждения;
* утверждения о действиях организаций, компаний или государств.

Не проверять как факты:

* мнения;
* прогнозы;
* обещания;
* риторические вопросы;
* эмоциональные оценки;
* лозунги;
* субъективные формулировки.

### 9.2. Verdict labels

Использовать внутренние labels:

* `TRUE`
* `MOSTLY_TRUE`
* `MISLEADING`
* `FALSE`
* `UNVERIFIABLE`
* `OPINION_NOT_CHECK_WORTHY`

Русская локализация:

* Верно.
* В основном верно.
* Вводит в заблуждение.
* Ложно.
* Невозможно проверить.
* Мнение / не требует фактчекинга.

### 9.3. Формат ответа модели

Модель должна возвращать JSON:

```json
{
  "claims": [
    {
      "claim": "Инфляция в США достигла 9.1% в 2022 году.",
      "speaker": "unknown",
      "verdict": "MOSTLY_TRUE",
      "confidence": 0.86,
      "explanation": "Краткое объяснение.",
      "sources": [
        {
          "title": "Источник",
          "url": "https://example.com",
          "quote": "Короткая цитата или описание"
        }
      ],
      "needs_manual_review": false
    }
  ]
}
```

Если источников нет или модель не может проверить утверждение, использовать `UNVERIFIABLE`.

Запрещено выдумывать ссылки, названия источников и цитаты.

## 10. Prompt templates

Сделать редактируемые prompt templates в настройках:

* claim extraction;
* fact-checking;
* summarization;
* source verification;
* Russian output;
* English output.

Добавить кнопку `Reset to defaults`.

В system prompt обязательно указать:

* не проверять мнения;
* не выдумывать источники;
* если нет доступа к источникам, возвращать `UNVERIFIABLE`;
* отвечать строго JSON;
* не раскрывать API key;
* не отправлять лишние данные;
* не утверждать больше, чем подтверждают источники.

## 11. UI

### 11.1. Popup

Popup должен содержать:

* текущий provider/model;
* статус;
* кнопку Check selected text;
* поле Paste text;
* кнопку Analyze;
* кнопку Open settings;
* last error;
* краткий результат последней проверки.

### 11.2. Options page

Options page - основной экран настроек.

Требования:

* Понятная форма provider settings.
* Test connection.
* Маскированный API key.
* Предупреждение о privacy.
* Отображение endpoint origin.
* Экспорт/импорт настроек без ключа.
* Очистка локальных данных.

### 11.3. Overlay

Overlay нужен начиная с этапа 2.

Показывать:

* статус: idle / reading / checking / error;
* текущий provider/model;
* список claims;
* цветовую маркировку verdict;
* раскрытие карточки claim;
* explanation;
* sources;
* copy result;
* report wrong result;
* pause/resume.

### 11.4. Sidebar

Sidebar не обязателен для MVP. Оставить как TODO для этапа 4.

## 12. Безопасность и приватность

Обязательно:

* Не логировать API key.
* Не отправлять API key никуда, кроме выбранного API endpoint.
* Не использовать аналитику.
* Не подключать сторонние трекеры.
* Не хранить историю проверок по умолчанию.
* Дать кнопку очистки локальных данных.
* Хранить настройки через `browser.storage.local`.
* Предупредить, что `browser.storage.local` не является полноценным secrets manager.
* Не запрашивать `<all_urls>`, если можно обойтись `activeTab` и optional permissions.
* При custom endpoint явно показывать домен, куда будет отправлен текст.
* Не использовать `eval`.
* Не загружать JS с внешних CDN.

Запрещено:

* hardcoded API keys;
* hidden endpoints;
* telemetry;
* отправка текста на сервер разработчика;
* remote code execution;
* обход ограничений провайдеров.

## 13. Permissions

Минимизировать разрешения.

Базовые permissions:

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus"
  ],
  "host_permissions": [],
  "optional_host_permissions": [
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://api.deepseek.com/*",
    "https://api.artemox.com/*",
    "https://openrouter.ai/*",
    "https://*/*"
  ]
}
```

При сохранении custom base URL запросить runtime permission только на нужный origin, если это требуется Firefox.

Если Firefox требует заранее объявлять host permissions для fetch к API, реализовать onboarding с понятным запросом разрешения.

## 14. Обработка ошибок

Единый формат ошибки:

```js
{
  type: "auth" | "network" | "rate_limit" | "model" | "parse" | "permission" | "unknown",
  message: "user friendly message",
  technical: "short technical detail without secrets",
  retryable: true
}
```

Пользовательские сообщения - на русском.

Test connection должен различать:

* success;
* unauthorized;
* invalid base URL;
* CORS/permission error;
* model not found;
* insufficient credits;
* rate limit;
* parse error;
* unknown error.

API key в ошибках маскировать.

## 15. Локализация

MVP: русский интерфейс.

Подготовить структуру для английской локализации:

```text
src/shared/i18n/ru.js
src/shared/i18n/en.js
```

## 16. Архитектура проекта

Рекомендуемая структура:

```text
extension/
  manifest.json
  package.json
  src/
    background/
      background.js
      apiClient.js
      providerAdapters/
        anthropicMessages.js
        openaiChatCompletions.js
        deepseekOfficial.js
        customTemplate.js
    content/
      contentScript.js
      overlay.js
      subtitleExtractors/
        youtube.js
        genericCaptions.js
    audio/
      capture.js
      speechToText.js
    popup/
      popup.html
      popup.js
      popup.css
    options/
      options.html
      options.js
      options.css
    shared/
      settings.js
      prompts.js
      validators.js
      logger.js
      sanitizer.js
      i18n/
        ru.js
        en.js
  icons/
  tests/
  README.md
```

## 17. Сборка и запуск

Нужны команды:

```bash
npm install
npm run lint
npm run test
npm run build
npm run zip
```

Если проект будет без сборщика, README должен описывать загрузку unpacked extension через `about:debugging`.

README должен содержать:

* как установить расширение временно в Firefox;
* как настроить Anthropic official;
* как настроить OpenAI-compatible endpoint;
* как настроить DeepSeek official;
* как настроить Artemox-like endpoint;
* как проверить соединение;
* как удалить ключ;
* как очистить локальные данные;
* какие данные отправляются на выбранный endpoint;
* ограничения fact-checking без web search/tools.

## 18. Тесты

Обязательно покрыть unit-тестами:

* нормализацию base URL + path;
* маскирование API key;
* сборку Anthropic request;
* сборку OpenAI-compatible request;
* сборку DeepSeek request;
* response parser для Anthropic;
* response parser для OpenAI-compatible;
* обработку HTTP 401/403/429/500;
* JSON extraction из ответа модели;
* claim filtering;
* storage settings migration;
* удаление ключа при export settings;
* sanitizer/log redaction.

## 19. Acceptance criteria для MVP

MVP считается готовым, если:

1. Расширение устанавливается в Firefox через `about:debugging`.
2. Открывается popup.
3. Открывается options page.
4. Можно сохранить custom base URL.
5. Можно выбрать auth mode.
6. Можно выбрать request format.
7. Можно сохранить model name.
8. Есть отдельный DeepSeek official preset.
9. Test connection работает для OpenAI-compatible endpoint.
10. Test connection работает для DeepSeek official при корректном ключе.
11. Test connection работает для Anthropic-compatible endpoint при корректном ключе.
12. API key не отображается полностью в UI и логах.
13. Можно проверить выделенный текст на странице.
14. Можно вставить текст вручную и получить fact-check result.
15. Результат отображается в popup или overlay.
16. Ошибки показываются понятно.
17. Есть README с инструкциями.
18. Нет внешней аналитики, трекеров и скрытых endpoints.
19. Код не содержит hardcoded API keys.
20. Расширение проходит `web-ext lint` без критических ошибок.
21. Unit-тесты проходят.

## 20. Важные ограничения

Не обещать абсолютную точность.

Не выдавать результат модели за окончательную истину.

Не отправлять приватный контент без явного действия пользователя.

Не пытаться обходить ограничения AI providers.

Не считать аудио real-time обязательной частью MVP.

Не считать claims с `UNVERIFIABLE` ошибкой расширения, если provider не имеет доступа к актуальным источникам.

