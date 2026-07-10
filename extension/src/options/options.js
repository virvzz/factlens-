// Options page: форма настроек, presets, runtime host permissions,
// test connection, экспорт/импорт без ключа, очистка данных.

import {
  PRESETS,
  STT_PRESETS,
  defaultSettings,
  loadSettings,
  saveSettings,
  exportSettings,
  importSettings,
  migrateSettings,
} from "../shared/settings.js";
import { DEFAULT_PROMPTS } from "../shared/prompts.js";
import { joinUrl, validateUrl, maskApiKey } from "../shared/validators.js";
import { isLegacyModel } from "../background/providerAdapters/deepseekOfficial.js";
import { t } from "../shared/i18n/index.js";

const b = globalThis.browser ?? globalThis.chrome; // Firefox / Chrome

const $ = (id) => document.getElementById(id);

const els = {
  presetSelect: $("presetSelect"),
  baseUrl: $("baseUrl"),
  apiPath: $("apiPath"),
  originPreview: $("originPreview"),
  requestFormat: $("requestFormat"),
  responsePath: $("responsePath"),
  model: $("model"),
  recentModelsList: $("recentModelsList"),
  modelSuggestions: $("modelSuggestions"),
  legacyWarning: $("legacyWarning"),
  rawTemplateBlock: $("rawTemplateBlock"),
  rawTemplate: $("rawTemplate"),
  authMode: $("authMode"),
  customAuthHeaderLabel: $("customAuthHeaderLabel"),
  customAuthHeader: $("customAuthHeader"),
  apiKey: $("apiKey"),
  maskedKeyInfo: $("maskedKeyInfo"),
  btnClearKey: $("btnClearKey"),
  extraHeaders: $("extraHeaders"),
  advancedBody: $("advancedBody"),
  maxTokens: $("maxTokens"),
  temperature: $("temperature"),
  timeoutSeconds: $("timeoutSeconds"),
  maxRetries: $("maxRetries"),
  retryDelaySeconds: $("retryDelaySeconds"),
  language: $("language"),
  customLanguageLabel: $("customLanguageLabel"),
  customLanguage: $("customLanguage"),
  strictness: $("strictness"),
  stream: $("stream"),
  btnResetPrompts: $("btnResetPrompts"),
  btnSave: $("btnSave"),
  btnTest: $("btnTest"),
  saveStatus: $("saveStatus"),
  testResult: $("testResult"),
  btnExport: $("btnExport"),
  importFile: $("importFile"),
  btnClearData: $("btnClearData"),
  sttPresets: $("sttPresets"),
  sttBaseUrl: $("sttBaseUrl"),
  sttApiPath: $("sttApiPath"),
  sttOriginPreview: $("sttOriginPreview"),
  sttAuthMode: $("sttAuthMode"),
  sttCustomAuthHeaderLabel: $("sttCustomAuthHeaderLabel"),
  sttCustomAuthHeader: $("sttCustomAuthHeader"),
  sttApiKey: $("sttApiKey"),
  sttMaskedKeyInfo: $("sttMaskedKeyInfo"),
  sttModel: $("sttModel"),
  sttLanguage: $("sttLanguage"),
  sttChunkSeconds: $("sttChunkSeconds"),
  sttResponsePath: $("sttResponsePath"),
  btnTestStt: $("btnTestStt"),
  btnClearSttKey: $("btnClearSttKey"),
  sttTestResult: $("sttTestResult"),
  historyEnabled: $("historyEnabled"),
  btnClearHistory: $("btnClearHistory"),
};

const PROMPT_FIELDS = [
  "factCheck",
  "factCheckUser",
  "claimExtraction",
  "summarization",
  "sourceVerification",
  "outputRu",
  "outputEn",
];

// Настройки, как они лежат в storage (ключ не показываем в форме).
let stored = defaultSettings();

// ---------- Рендер формы ----------

function fillPresetOptions() {
  els.presetSelect.textContent = "";
  for (const [key, preset] of Object.entries(PRESETS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.label;
    els.presetSelect.appendChild(opt);
  }
}

function renderModelSuggestions() {
  const preset = PRESETS[els.presetSelect.value] || {};
  els.modelSuggestions.textContent = "";
  for (const model of preset.modelSuggestions || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = model;
    btn.addEventListener("click", () => {
      els.model.value = model;
      updateDynamicVisibility();
    });
    els.modelSuggestions.appendChild(btn);
  }
  for (const model of preset.legacyModels || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${model} (legacy)`;
    btn.title = "Устаревающая модель";
    btn.addEventListener("click", () => {
      els.model.value = model;
      updateDynamicVisibility();
    });
    els.modelSuggestions.appendChild(btn);
  }
}

function renderRecentModels() {
  els.recentModelsList.textContent = "";
  for (const model of stored.recentModels || []) {
    const opt = document.createElement("option");
    opt.value = model;
    els.recentModelsList.appendChild(opt);
  }
}

function renderMaskedKey() {
  if (stored.apiKey) {
    els.maskedKeyInfo.textContent = `Сохранённый ключ: ${maskApiKey(stored.apiKey)}. Ключ не показывается целиком и не попадает в экспорт и логи.`;
  } else {
    els.maskedKeyInfo.textContent = "Ключ не сохранён.";
  }
}

function updateOriginPreview() {
  const url = joinUrl(els.baseUrl.value, els.apiPath.value);
  const parsed = validateUrl(url);
  if (parsed.ok) {
    els.originPreview.textContent = `Текст будет отправляться на: ${url}`;
    els.originPreview.className = "origin-preview ok";
  } else {
    els.originPreview.textContent = `Некорректный endpoint: ${parsed.error}`;
    els.originPreview.className = "origin-preview bad";
  }
}

function renderSttMaskedKey() {
  if (stored.stt && stored.stt.apiKey) {
    els.sttMaskedKeyInfo.textContent = `Сохранённый STT ключ: ${maskApiKey(stored.stt.apiKey)}.`;
  } else {
    els.sttMaskedKeyInfo.textContent = "STT ключ не сохранён.";
  }
}

function updateSttOriginPreview() {
  if (!els.sttBaseUrl.value.trim()) {
    els.sttOriginPreview.textContent =
      "STT не настроен — распознавание звука недоступно.";
    els.sttOriginPreview.className = "origin-preview";
    return;
  }
  const url = joinUrl(els.sttBaseUrl.value, els.sttApiPath.value);
  const parsed = validateUrl(url);
  if (parsed.ok) {
    els.sttOriginPreview.textContent = `Аудио будет отправляться на: ${url}`;
    els.sttOriginPreview.className = "origin-preview ok";
  } else {
    els.sttOriginPreview.textContent = `Некорректный STT endpoint: ${parsed.error}`;
    els.sttOriginPreview.className = "origin-preview bad";
  }
}

function renderSttPresets() {
  els.sttPresets.textContent = "";
  for (const preset of Object.values(STT_PRESETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      els.sttBaseUrl.value = preset.baseUrl;
      els.sttApiPath.value = preset.apiPath;
      els.sttModel.value = preset.model;
      els.sttAuthMode.value = preset.authMode;
      updateSttOriginPreview();
      updateDynamicVisibility();
    });
    els.sttPresets.appendChild(btn);
  }
}

function updateDynamicVisibility() {
  els.customAuthHeaderLabel.classList.toggle(
    "hidden",
    els.authMode.value !== "custom"
  );
  els.sttCustomAuthHeaderLabel.classList.toggle(
    "hidden",
    els.sttAuthMode.value !== "custom"
  );
  els.customLanguageLabel.classList.toggle(
    "hidden",
    els.language.value !== "custom"
  );
  els.rawTemplateBlock.classList.toggle(
    "hidden",
    els.requestFormat.value !== "custom"
  );
  const legacy =
    els.presetSelect.value === "deepseek" && isLegacyModel(els.model.value);
  els.legacyWarning.classList.toggle("hidden", !legacy);
}

function fillForm(s) {
  els.presetSelect.value = s.preset;
  els.baseUrl.value = s.baseUrl;
  els.apiPath.value = s.apiPath;
  els.requestFormat.value = s.requestFormat;
  els.responsePath.value = s.responsePath;
  els.model.value = s.model;
  els.rawTemplate.value = s.rawTemplate;
  els.authMode.value = s.authMode;
  els.customAuthHeader.value = s.customAuthHeader;
  els.apiKey.value = "";
  els.extraHeaders.value = s.extraHeadersJson;
  els.advancedBody.value = s.advancedBodyJson;
  els.maxTokens.value = s.maxTokens;
  els.temperature.value = s.temperature;
  els.timeoutSeconds.value = s.timeoutSeconds;
  els.maxRetries.value = s.maxRetries;
  els.retryDelaySeconds.value = s.retryDelaySeconds;
  els.language.value = s.language;
  els.customLanguage.value = s.customLanguage;
  els.strictness.value = s.strictness;
  els.stream.checked = s.stream;
  for (const key of PROMPT_FIELDS) {
    $(`p_${key}`).value = s.prompts[key] ?? "";
  }
  const stt = s.stt || {};
  els.sttBaseUrl.value = stt.baseUrl || "";
  els.sttApiPath.value = stt.apiPath || "";
  els.sttAuthMode.value = stt.authMode || "bearer";
  els.sttCustomAuthHeader.value = stt.customAuthHeader || "";
  els.sttApiKey.value = "";
  els.sttModel.value = stt.model || "";
  els.sttLanguage.value = stt.language || "";
  els.sttChunkSeconds.value = stt.chunkSeconds || 20;
  els.sttResponsePath.value = stt.responsePath || "text";
  els.historyEnabled.checked = Boolean(s.historyEnabled);
  renderModelSuggestions();
  renderRecentModels();
  renderMaskedKey();
  renderSttMaskedKey();
  updateOriginPreview();
  updateSttOriginPreview();
  updateDynamicVisibility();
}

// ---------- Сбор формы (синхронно — важно для permissions.request) ----------

class FormError extends Error {}

function collect() {
  const s = { ...stored };
  s.preset = els.presetSelect.value;
  s.baseUrl = els.baseUrl.value.trim();
  s.apiPath = els.apiPath.value.trim();
  s.requestFormat = els.requestFormat.value;
  s.responsePath = els.responsePath.value.trim();
  s.model = els.model.value.trim();
  s.rawTemplate = els.rawTemplate.value;
  s.authMode = els.authMode.value;
  s.customAuthHeader = els.customAuthHeader.value.trim();
  s.extraHeadersJson = els.extraHeaders.value.trim();
  s.advancedBodyJson = els.advancedBody.value.trim();
  s.maxTokens = Number(els.maxTokens.value);
  s.temperature = Number(els.temperature.value);
  s.timeoutSeconds = Number(els.timeoutSeconds.value);
  s.maxRetries = Number(els.maxRetries.value);
  s.retryDelaySeconds = Number(els.retryDelaySeconds.value);
  s.language = els.language.value;
  s.customLanguage = els.customLanguage.value.trim();
  s.strictness = els.strictness.value;
  s.stream = els.stream.checked;
  s.prompts = { ...stored.prompts };
  for (const key of PROMPT_FIELDS) {
    s.prompts[key] = $(`p_${key}`).value;
  }

  // Новый ключ из поля; пустое поле = оставить сохранённый.
  const newKey = els.apiKey.value.trim();
  if (newKey && /[\s"'{}<>\\]/.test(newKey)) {
    throw new FormError(
      "Поле API key содержит пробелы, кавычки или скобки — похоже, вставлен не ключ, а посторонний текст. Вставьте только сам ключ."
    );
  }
  s.apiKey = newKey || stored.apiKey;

  // STT-секция.
  const storedStt = stored.stt || {};
  const newSttKey = els.sttApiKey.value.trim();
  if (newSttKey && /[\s"'{}<>\\]/.test(newSttKey)) {
    throw new FormError(
      "Поле STT API key содержит пробелы, кавычки или скобки — вставьте только сам ключ."
    );
  }
  s.historyEnabled = els.historyEnabled.checked;
  s.stt = {
    baseUrl: els.sttBaseUrl.value.trim(),
    apiPath: els.sttApiPath.value.trim(),
    apiKey: newSttKey || storedStt.apiKey || "",
    authMode: els.sttAuthMode.value,
    customAuthHeader: els.sttCustomAuthHeader.value.trim(),
    model: els.sttModel.value.trim(),
    language: els.sttLanguage.value.trim(),
    responsePath: els.sttResponsePath.value.trim() || "text",
    chunkSeconds: Number(els.sttChunkSeconds.value) || 20,
  };

  // Синхронная валидация.
  const url = joinUrl(s.baseUrl, s.apiPath);
  const parsed = validateUrl(url);
  if (!parsed.ok) throw new FormError(`Endpoint: ${parsed.error}`);

  const origins = [`${parsed.origin}/*`];
  let sttOrigin = "";
  if (s.stt.baseUrl) {
    const sttUrl = joinUrl(s.stt.baseUrl, s.stt.apiPath);
    const sttParsed = validateUrl(sttUrl);
    if (!sttParsed.ok) throw new FormError(`STT endpoint: ${sttParsed.error}`);
    sttOrigin = sttParsed.origin;
    if (!origins.includes(`${sttOrigin}/*`)) origins.push(`${sttOrigin}/*`);
  }
  for (const [label, value] of [
    ["Дополнительные заголовки", s.extraHeadersJson],
    ["Дополнительные поля тела запроса", s.advancedBodyJson],
  ]) {
    if (!value) continue;
    let obj;
    try {
      obj = JSON.parse(value);
    } catch {
      throw new FormError(`Поле «${label}» содержит невалидный JSON.`);
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new FormError(`Поле «${label}» должно быть JSON-объектом.`);
    }
  }
  if (s.authMode === "custom" && !s.customAuthHeader) {
    throw new FormError("Укажите имя заголовка для custom auth mode.");
  }
  if (s.requestFormat === "custom" && !s.responsePath) {
    throw new FormError("Для custom raw HTTP задайте response parser path.");
  }

  return { settings: s, origin: parsed.origin, origins };
}

function showStatus(node, message, ok) {
  node.textContent = message;
  node.className = `status ${ok ? "ok" : "bad"}`;
  node.classList.remove("hidden");
}

// ---------- Действия ----------

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;
  els.baseUrl.value = preset.baseUrl;
  els.apiPath.value = preset.apiPath;
  els.authMode.value = preset.authMode;
  els.requestFormat.value = preset.requestFormat;
  els.responsePath.value = preset.responsePath;
  els.extraHeaders.value = preset.extraHeadersJson;
  renderModelSuggestions();
  updateOriginPreview();
  updateDynamicVisibility();
}

async function requestOriginPermissions(origins) {
  // ВАЖНО: permissions.request должен быть ПЕРВЫМ await в обработчике клика,
  // иначе Firefox теряет user gesture и отклоняет запрос без диалога.
  // Если разрешения уже выданы, request вернёт true без показа диалога.
  try {
    return await b.permissions.request({ origins });
  } catch (e) {
    console.warn("[FactLens] permissions.request:", e);
    // request упал (например, вызван вне user gesture) —
    // проверим, не выданы ли разрешения раньше.
    try {
      return await b.permissions.contains({ origins });
    } catch {
      return false;
    }
  }
}

els.btnSave.addEventListener("click", async () => {
  els.saveStatus.classList.add("hidden");
  let collected;
  try {
    collected = collect(); // синхронно, чтобы не потерять user gesture
  } catch (e) {
    showStatus(els.saveStatus, String(e.message || e), false);
    return;
  }
  // Первый await в обработчике — запрос разрешений (требование Firefox).
  const granted = await requestOriginPermissions(collected.origins);

  const s = collected.settings;
  if (s.model) {
    s.recentModels = [
      s.model,
      ...(stored.recentModels || []).filter((m) => m !== s.model),
    ].slice(0, 8);
  }
  stored = migrateSettings(s);
  await saveSettings(stored);
  els.apiKey.value = "";
  els.sttApiKey.value = "";
  renderMaskedKey();
  renderSttMaskedKey();
  renderRecentModels();

  if (granted) {
    showStatus(els.saveStatus, "Настройки сохранены. Разрешение на endpoint выдано.", true);
  } else {
    showStatus(
      els.saveStatus,
      `Настройки сохранены, но разрешение на ${collected.origin} не выдано — запросы к API работать не будут. Нажмите «Сохранить настройки» ещё раз и подтвердите разрешение.`,
      false
    );
  }
});

els.btnTest.addEventListener("click", async () => {
  els.testResult.classList.add("hidden");
  let collected;
  try {
    collected = collect();
  } catch (e) {
    showStatus(els.testResult, String(e.message || e), false);
    return;
  }
  const granted = await requestOriginPermissions(collected.origins);
  if (!granted) {
    showStatus(
      els.testResult,
      `Нет разрешения на ${collected.origin} — тест невозможен.`,
      false
    );
    return;
  }
  showStatus(els.testResult, "Проверка соединения…", true);
  const result = await b.runtime.sendMessage({
    type: "testConnection",
    settings: collected.settings,
  });
  if (!result) {
    showStatus(els.testResult, t("test.unknown"), false);
    return;
  }
  const label = t(`test.${result.status}`);
  let text = result.ok ? `✓ ${label}` : `✗ ${label}`;
  if (result.message && result.message !== label) text += `\n${result.message}`;
  if (result.technical) text += `\n${result.technical}`;
  showStatus(els.testResult, text, result.ok);
});

els.btnClearKey.addEventListener("click", async () => {
  if (!confirm("Удалить сохранённый API key?")) return;
  stored.apiKey = "";
  await saveSettings(stored);
  els.apiKey.value = "";
  renderMaskedKey();
  showStatus(els.saveStatus, "API key удалён.", true);
});

els.btnExport.addEventListener("click", () => {
  const data = JSON.stringify(exportSettings(stored), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "factlens-settings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files && els.importFile.files[0];
  els.importFile.value = "";
  if (!file) return;
  let incoming;
  try {
    incoming = JSON.parse(await file.text());
  } catch {
    showStatus(els.saveStatus, "Файл импорта не является валидным JSON.", false);
    return;
  }
  stored = importSettings(stored, incoming);
  await saveSettings(stored);
  fillForm(stored);
  showStatus(
    els.saveStatus,
    "Настройки импортированы (API key из файла игнорируется).",
    true
  );
});

els.btnClearData.addEventListener("click", async () => {
  if (
    !confirm(
      "Удалить все локальные данные расширения (настройки, ключ, последний результат)?"
    )
  ) {
    return;
  }
  await b.storage.local.clear();
  try {
    await b.storage.session.clear();
  } catch {
    /* session storage может отсутствовать */
  }
  stored = defaultSettings();
  fillForm(stored);
  showStatus(els.saveStatus, "Все локальные данные удалены.", true);
});

els.btnResetPrompts.addEventListener("click", () => {
  for (const key of PROMPT_FIELDS) {
    $(`p_${key}`).value = DEFAULT_PROMPTS[key] ?? "";
  }
});

els.btnTestStt.addEventListener("click", async () => {
  els.sttTestResult.classList.add("hidden");
  let collected;
  try {
    collected = collect();
  } catch (e) {
    showStatus(els.sttTestResult, String(e.message || e), false);
    return;
  }
  if (!collected.settings.stt.baseUrl) {
    showStatus(els.sttTestResult, "STT base URL не задан.", false);
    return;
  }
  const granted = await requestOriginPermissions(collected.origins);
  if (!granted) {
    showStatus(els.sttTestResult, "Разрешение на STT origin не выдано — тест невозможен.", false);
    return;
  }
  showStatus(els.sttTestResult, "Проверка STT (отправляю тестовый тихий фрагмент)…", true);
  const result = await b.runtime.sendMessage({
    type: "testStt",
    settings: collected.settings,
  });
  if (!result) {
    showStatus(els.sttTestResult, t("test.unknown"), false);
    return;
  }
  let text = result.ok ? `✓ ${result.message}` : `✗ ${result.message}`;
  if (result.technical) text += `\n${result.technical}`;
  showStatus(els.sttTestResult, text, result.ok);
});

els.btnClearHistory.addEventListener("click", async () => {
  if (!confirm("Удалить всю историю проверок?")) return;
  await b.runtime.sendMessage({ type: "clearHistory" });
  showStatus(els.saveStatus, "История очищена.", true);
});

els.btnClearSttKey.addEventListener("click", async () => {
  if (!confirm("Удалить сохранённый STT API key?")) return;
  stored.stt = { ...(stored.stt || {}), apiKey: "" };
  stored = migrateSettings(stored);
  await saveSettings(stored);
  els.sttApiKey.value = "";
  renderSttMaskedKey();
  showStatus(els.saveStatus, "STT ключ удалён.", true);
});

// ---------- Слушатели формы ----------

els.presetSelect.addEventListener("change", () => applyPreset(els.presetSelect.value));
els.baseUrl.addEventListener("input", updateOriginPreview);
els.apiPath.addEventListener("input", updateOriginPreview);
els.authMode.addEventListener("change", updateDynamicVisibility);
els.language.addEventListener("change", updateDynamicVisibility);
els.requestFormat.addEventListener("change", updateDynamicVisibility);
els.model.addEventListener("input", updateDynamicVisibility);
els.sttBaseUrl.addEventListener("input", updateSttOriginPreview);
els.sttApiPath.addEventListener("input", updateSttOriginPreview);
els.sttAuthMode.addEventListener("change", updateDynamicVisibility);

// ---------- Инициализация ----------

fillPresetOptions();
renderSttPresets();
loadSettings().then((s) => {
  stored = s;
  fillForm(stored);
});
