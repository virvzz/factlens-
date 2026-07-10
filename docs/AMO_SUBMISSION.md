# Шпаргалка для публикации на AMO (addons.mozilla.org)

Готовые тексты для полей формы. Загружаемый файл: `dist/factlens_ai_api-0.2.0.zip`
(собрать свежий: `npm run build`).

## Name (имя)

```
FactLens
```

(Если AMO скажет, что имя занято — «FactLens AI» или «FactLens — AI Fact Checker».)

## Summary (до 250 символов, обязательное)

```
Проверка фактов через ВАШ AI API: выделенный текст, субтитры YouTube в реальном времени, распознавание звука видео. Ключи и данные — только у выбранного вами провайдера (Anthropic, OpenAI-compatible, DeepSeek и др.). Без серверов разработчика.
```

## Description (описание)

```
FactLens помогает быстро замечать спорные утверждения: выделите текст, вставьте его вручную или включите live-проверку видео — расширение извлекает фактические утверждения и показывает предварительную оценку: Верно / В основном верно / Вводит в заблуждение / Ложно / Невозможно проверить / Мнение — с объяснением и источниками.

Ключевое отличие: вы сами настраиваете AI-провайдера. Поддерживаются Anthropic, OpenAI-compatible (включая локальные серверы), DeepSeek, прокси-сервисы и полностью свой HTTP API. Расширение не имеет собственных серверов, аналитики и телеметрии — текст уходит только на endpoint, который вы указали, с вашим ключом.

Возможности:
• проверка выделенного и вставленного текста (контекстное меню, горячие клавиши);
• live-проверка субтитров YouTube и HTML5-видео с оверлеем поверх страницы;
• проверка всего транскрипта видео;
• распознавание звука видео через настраиваемый Whisper-совместимый STT (OpenAI, Groq, локальный);
• боковая панель с историей (история — только по явному включению, локально);
• встроенная справка по всем параметрам;
• экспорт/импорт настроек без API-ключей.

⚠ Автоматический фактчекинг может ошибаться. Не используйте результат как окончательный источник истины: без web search модель опирается на свои знания, и «Невозможно проверить» — честный ответ, а не сбой. Использование API оплачивается по тарифам вашего провайдера.
```

## Categories

- Основная: **Search Tools** (или **Privacy & Security** — на выбор; подходит и «Other»)

## Support / Homepage

- Homepage: `https://github.com/<username>/factlens`
- Support email: ваш email

## License

- MIT (выбрать из списка AMO)

## Privacy policy (обязательное поле — вставить текст)

Взять из `PRIVACY.md` (русскую часть + английское summary).

## Notes to Reviewer (на английском — ускоряет ревью)

```
FactLens is a bring-your-own-API fact-checking extension. Key points for review:

1. No developer servers, no analytics, no telemetry. All network requests go
   exclusively to API endpoints explicitly configured by the user (AI chat
   provider and optional speech-to-text provider). Endpoints are shown to the
   user in the options UI.

2. Host permissions: host_permissions is empty. The extension requests
   optional_host_permissions at runtime ONLY for the exact origin the user
   saves in options (browser.permissions.request on the Save button click).
   "https://*/*" is listed in optional_host_permissions solely so users can
   configure arbitrary self-hosted/OpenAI-compatible endpoints (e.g.
   http://localhost Ollama, corporate proxies); it is never requested as a
   wildcard — only specific origins are requested.

3. activeTab + scripting are used to read the user's text selection and to
   inject the overlay/captions reader into the current tab strictly upon
   explicit user action (toolbar popup button / context menu / keyboard
   shortcut).

4. Audio mode captures audio of the page's own <video> element via Web Audio
   (createMediaElementSource) after an explicit user click, and sends chunks
   to the user-configured speech-to-text endpoint. Silence is filtered
   locally and not transmitted.

5. API keys are stored in browser.storage.local, masked in the UI, excluded
   from settings export and from console logging (dedicated redaction module,
   covered by unit tests).

6. Check history is OFF by default; when enabled by the user it is stored
   locally only (max 50 entries) and can be cleared with one click.

7. Code is plain unminified JavaScript, no bundler, no remote code. Source:
   https://github.com/<username>/factlens (tests: npm test, lint: web-ext lint).

To test: any OpenAI-compatible API key works (options -> preset
"OpenAI-compatible" -> enter key -> Save (grant permission) -> Test
connection). Then select any text on a page -> context menu -> "Проверить
факты в выделенном тексте".
```

## Скриншоты (сделать перед сабмитом, минимум 1, лучше 3–4)

1. Popup с результатом проверки (карточки вердиктов).
2. Оверлей на YouTube с live-проверкой.
3. Страница настроек (провайдер + STT).
4. Боковая панель с историей.

PNG/JPG, рекомендуемо 1280×800 или реальный размер окна.

## После загрузки

- «Do you use minified/obfuscated code?» → **No** (код не минифицирован,
  сборщика нет — приложение исходников не требуется).
- Версия следующего релиза: поднять `version` в extension/manifest.json
  и `npm run build` заново.
