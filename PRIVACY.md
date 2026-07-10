# FactLens — Политика приватности / Privacy Policy

## Русский

FactLens не собирает, не хранит и не передаёт данные разработчику или третьим
лицам. У расширения нет собственных серверов, аналитики и телеметрии.

**Куда уходят данные.** Текст, который вы проверяете (выделенный, вставленный,
субтитры или распознанная речь), и аудио-фрагменты (в режиме распознавания
звука) отправляются **только** на API-endpoint'ы, которые вы сами указали в
настройках (AI-провайдер и, опционально, STT-провайдер). Точные адреса всегда
показаны в настройках. Обработка этих данных регулируется политикой выбранного
вами провайдера.

**Что хранится локально** (в `browser.storage.local` вашего профиля):
настройки, включая API-ключи (маскируются в интерфейсе, не попадают в экспорт
настроек и логи). История проверок по умолчанию **выключена**; при явном
включении хранится локально (до 50 записей) и удаляется кнопкой «Очистить
историю» или «Очистить все локальные данные».

**Разрешения.** Доступ к сайтам запрашивается в рантайме и только к доменам
API, которые вы указали. `activeTab`/`scripting` используются для чтения
выделенного текста и субтитров на активной вкладке по вашему явному действию.

## English (summary)

FactLens does not collect, store, or transmit any data to the developer or
third parties. There are no developer servers, analytics, or telemetry.
Checked text and (optionally) audio chunks are sent **only** to the API
endpoints the user explicitly configures (AI provider and optional
speech-to-text provider); their processing is governed by those providers'
policies. Settings, including API keys, are stored locally in
`browser.storage.local`; keys are masked in the UI and excluded from settings
export and logs. Check history is **off by default**, local-only when enabled
(max 50 entries), and can be cleared at any time. Host permissions are
requested at runtime only for the API origins the user configures;
`activeTab`/`scripting` are used to read selected text and captions on the
active tab upon explicit user action.
