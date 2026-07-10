// Настройки: значения по умолчанию, provider presets (ТЗ 6),
// миграция, экспорт/импорт без ключа, эффективная конфигурация.

import { DEFAULT_PROMPTS } from "./prompts.js";
import { ApiError } from "./errors.js";
import { AUTH_MODES } from "./auth.js";

export const SETTINGS_VERSION = 1;
export const STORAGE_KEY = "settings";

export const REQUEST_FORMATS = ["anthropic", "openai", "custom"];
export const LANGUAGES = ["auto", "ru", "en", "custom"];
export const STRICTNESS_LEVELS = ["lenient", "balanced", "strict"];

export const DEFAULT_RAW_TEMPLATE = `{
  "model": "{{model}}",
  "max_tokens": {{max_tokens}},
  "temperature": {{temperature}},
  "messages": [
    { "role": "system", "content": "{{system_prompt}}" },
    { "role": "user", "content": "{{user_prompt}}" }
  ]
}`;

const ANTHROPIC_HEADERS_JSON = `{
  "anthropic-version": "2023-06-01"
}`;

// Provider presets (ТЗ, раздел 6).
export const PRESETS = {
  anthropic: {
    label: "Anthropic official",
    baseUrl: "https://api.anthropic.com",
    apiPath: "/v1/messages",
    authMode: "x-api-key",
    requestFormat: "anthropic",
    responsePath: "content[0].text",
    extraHeadersJson: ANTHROPIC_HEADERS_JSON,
    modelSuggestions: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"],
    legacyModels: [],
  },
  openai: {
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com",
    apiPath: "/v1/chat/completions",
    authMode: "bearer",
    requestFormat: "openai",
    responsePath: "choices[0].message.content",
    extraHeadersJson: "",
    modelSuggestions: ["gpt-4o-mini", "gpt-4o"],
    legacyModels: [],
  },
  deepseek: {
    label: "DeepSeek official",
    baseUrl: "https://api.deepseek.com",
    apiPath: "/chat/completions",
    authMode: "bearer",
    requestFormat: "openai",
    responsePath: "choices[0].message.content",
    extraHeadersJson: "",
    modelSuggestions: ["deepseek-v4-flash", "deepseek-v4-pro"],
    // Устаревающие модели: оставлены как совместимые варианты с предупреждением.
    legacyModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  artemox: {
    label: "Artemox / custom OpenAI-compatible",
    baseUrl: "https://api.artemox.com/v1",
    apiPath: "/chat/completions",
    authMode: "bearer",
    requestFormat: "openai",
    responsePath: "choices[0].message.content",
    extraHeadersJson: "",
    modelSuggestions: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-fable-5"],
    legacyModels: [],
  },
  customAnthropic: {
    label: "Custom Anthropic-compatible",
    baseUrl: "",
    apiPath: "/v1/messages",
    authMode: "x-api-key",
    requestFormat: "anthropic",
    responsePath: "content[0].text",
    extraHeadersJson: ANTHROPIC_HEADERS_JSON,
    modelSuggestions: [],
    legacyModels: [],
  },
  customRaw: {
    label: "Custom raw HTTP",
    baseUrl: "",
    apiPath: "",
    authMode: "bearer",
    requestFormat: "custom",
    responsePath: "",
    extraHeadersJson: "",
    modelSuggestions: [],
    legacyModels: [],
  },
};

// Быстрые пресеты для STT endpoint (распознавание речи, Этап 3).
export const STT_PRESETS = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com",
    apiPath: "/v1/audio/transcriptions",
    model: "whisper-1",
    authMode: "bearer",
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai",
    apiPath: "/v1/audio/transcriptions",
    model: "whisper-large-v3",
    authMode: "bearer",
  },
  local: {
    label: "Локальный Whisper",
    baseUrl: "http://localhost:8000",
    apiPath: "/v1/audio/transcriptions",
    model: "whisper-1",
    authMode: "none",
  },
};

export function defaultSttSettings() {
  return {
    baseUrl: "",
    apiPath: "/v1/audio/transcriptions",
    apiKey: "",
    authMode: "bearer",
    customAuthHeader: "",
    model: "whisper-1",
    language: "",
    responsePath: "text",
    chunkSeconds: 20,
  };
}

export function defaultSettings() {
  const preset = PRESETS.anthropic;
  return {
    settingsVersion: SETTINGS_VERSION,
    preset: "anthropic",
    baseUrl: preset.baseUrl,
    apiPath: preset.apiPath,
    apiKey: "",
    authMode: preset.authMode,
    customAuthHeader: "",
    extraHeadersJson: preset.extraHeadersJson,
    model: "",
    recentModels: [],
    requestFormat: preset.requestFormat,
    responsePath: preset.responsePath,
    rawTemplate: DEFAULT_RAW_TEMPLATE,
    advancedBodyJson: "",
    maxTokens: 1024,
    temperature: 0.2,
    timeoutSeconds: 60,
    maxRetries: 1,
    retryDelaySeconds: 2,
    stream: false,
    language: "auto",
    customLanguage: "",
    strictness: "balanced",
    prompts: { ...DEFAULT_PROMPTS },
    stt: defaultSttSettings(),
    // История проверок: только по явному включению (ТЗ, этап 4).
    historyEnabled: false,
  };
}

function pickString(raw, fallback) {
  return typeof raw === "string" ? raw : fallback;
}

function pickNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function pickEnum(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

/**
 * Миграция/нормализация настроек из storage: недостающие поля заполняются
 * значениями по умолчанию, лишние отбрасываются, типы приводятся.
 */
export function migrateSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== "object") return d;

  const s = { ...d };
  s.preset = pickEnum(raw.preset, Object.keys(PRESETS), d.preset);
  s.baseUrl = pickString(raw.baseUrl, d.baseUrl);
  s.apiPath = pickString(raw.apiPath, d.apiPath);
  s.apiKey = pickString(raw.apiKey, "");
  s.authMode = pickEnum(raw.authMode, AUTH_MODES, PRESETS[s.preset].authMode);
  s.customAuthHeader = pickString(raw.customAuthHeader, "");
  s.extraHeadersJson = pickString(raw.extraHeadersJson, d.extraHeadersJson);
  s.model = pickString(raw.model, "");
  s.recentModels = Array.isArray(raw.recentModels)
    ? raw.recentModels.filter((m) => typeof m === "string" && m).slice(0, 8)
    : [];
  s.requestFormat = pickEnum(
    raw.requestFormat,
    REQUEST_FORMATS,
    PRESETS[s.preset].requestFormat
  );
  s.responsePath = pickString(raw.responsePath, d.responsePath);
  s.rawTemplate = pickString(raw.rawTemplate, d.rawTemplate);
  s.advancedBodyJson = pickString(raw.advancedBodyJson, "");
  s.maxTokens = clamp(pickNumber(raw.maxTokens, d.maxTokens), 16, 100000);
  s.temperature = clamp(pickNumber(raw.temperature, d.temperature), 0, 2);
  s.timeoutSeconds = clamp(pickNumber(raw.timeoutSeconds, d.timeoutSeconds), 5, 600);
  s.maxRetries = clamp(Math.round(pickNumber(raw.maxRetries, d.maxRetries)), 0, 5);
  s.retryDelaySeconds = clamp(
    pickNumber(raw.retryDelaySeconds, d.retryDelaySeconds),
    0,
    60
  );
  s.stream = Boolean(raw.stream);
  s.language = pickEnum(raw.language, LANGUAGES, d.language);
  s.customLanguage = pickString(raw.customLanguage, "");
  s.strictness = pickEnum(raw.strictness, STRICTNESS_LEVELS, d.strictness);
  s.prompts = { ...DEFAULT_PROMPTS };
  if (raw.prompts && typeof raw.prompts === "object") {
    for (const key of Object.keys(DEFAULT_PROMPTS)) {
      if (typeof raw.prompts[key] === "string" && raw.prompts[key].trim()) {
        s.prompts[key] = raw.prompts[key];
      }
    }
  }
  s.stt = migrateSttSettings(raw.stt);
  s.historyEnabled = Boolean(raw.historyEnabled);
  s.settingsVersion = SETTINGS_VERSION;
  return s;
}

function migrateSttSettings(raw) {
  const d = defaultSttSettings();
  if (!raw || typeof raw !== "object") return d;
  return {
    baseUrl: pickString(raw.baseUrl, d.baseUrl),
    apiPath: pickString(raw.apiPath, d.apiPath),
    apiKey: pickString(raw.apiKey, ""),
    authMode: pickEnum(raw.authMode, AUTH_MODES, d.authMode),
    customAuthHeader: pickString(raw.customAuthHeader, ""),
    model: pickString(raw.model, d.model),
    language: pickString(raw.language, ""),
    responsePath: pickString(raw.responsePath, d.responsePath),
    chunkSeconds: clamp(pickNumber(raw.chunkSeconds, d.chunkSeconds), 5, 120),
  };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Экспорт настроек: API keys (основной и STT) не попадают в экспорт (ТЗ 7.1). */
export function exportSettings(settings) {
  const clone = JSON.parse(JSON.stringify(settings));
  delete clone.apiKey;
  if (clone.stt) delete clone.stt.apiKey;
  return clone;
}

/**
 * Импорт настроек: входящий JSON нормализуется, а API keys из него
 * игнорируются — сохраняются текущие ключи пользователя.
 */
export function importSettings(currentSettings, incomingRaw) {
  const merged = migrateSettings(incomingRaw);
  merged.apiKey = (currentSettings && currentSettings.apiKey) || "";
  merged.stt.apiKey =
    (currentSettings && currentSettings.stt && currentSettings.stt.apiKey) || "";
  return merged;
}

function parseJsonObject(text, fieldLabel) {
  const raw = String(text || "").trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ApiError("parse", `Поле «${fieldLabel}» содержит невалидный JSON.`, {
      technical: String(e.message || e),
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(
      "parse",
      `Поле «${fieldLabel}» должно быть JSON-объектом вида {"ключ": "значение"}.`
    );
  }
  return parsed;
}

/**
 * Преобразует сохранённые настройки в «эффективную конфигурацию»
 * для apiClient: JSON-поля распарсены, числа приведены.
 * Бросает ApiError(type: "parse") при невалидных JSON-полях.
 */
export function effectiveConfig(settings) {
  const s = migrateSettings(settings);
  return {
    preset: s.preset,
    presetLabel: (PRESETS[s.preset] || {}).label || s.preset,
    baseUrl: s.baseUrl,
    apiPath: s.apiPath,
    apiKey: s.apiKey,
    authMode: s.authMode,
    customAuthHeader: s.customAuthHeader,
    extraHeaders: lowercaseKeys(
      parseJsonObject(s.extraHeadersJson, "Дополнительные заголовки")
    ),
    advancedBody: parseJsonObject(
      s.advancedBodyJson,
      "Дополнительные поля тела запроса"
    ),
    model: s.model,
    requestFormat: s.requestFormat,
    responsePath: s.responsePath,
    rawTemplate: s.rawTemplate,
    maxTokens: s.maxTokens,
    temperature: s.temperature,
    timeoutSeconds: s.timeoutSeconds,
    maxRetries: s.maxRetries,
    retryDelaySeconds: s.retryDelaySeconds,
    stream: s.stream,
    language: s.language,
    customLanguage: s.customLanguage,
    strictness: s.strictness,
    prompts: s.prompts,
    stt: s.stt,
  };
}

function lowercaseKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[String(k).toLowerCase()] = String(v);
  }
  return out;
}

function storageLocal() {
  const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome
  if (!b || !b.storage || !b.storage.local) {
    throw new Error("storage.local недоступен");
  }
  return b.storage.local;
}

/** Загружает настройки из browser.storage.local (с миграцией). */
export async function loadSettings(area = null) {
  const storage = area || storageLocal();
  const data = await storage.get(STORAGE_KEY);
  return migrateSettings(data ? data[STORAGE_KEY] : null);
}

/** Сохраняет настройки в browser.storage.local. */
export async function saveSettings(settings, area = null) {
  const storage = area || storageLocal();
  await storage.set({ [STORAGE_KEY]: migrateSettings(settings) });
}
