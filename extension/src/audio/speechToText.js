// STT-клиент (Этап 3): отправка аудио-чанков на Whisper-совместимый
// endpoint (/v1/audio/transcriptions, multipart/form-data).
// ESM-модуль, используется background'ом.

import { joinUrl, getByPath } from "../shared/validators.js";
import { buildAuthHeaders } from "../shared/auth.js";
import { ApiError } from "../shared/errors.js";
import { classifyHttpStatus } from "../background/apiClient.js";

const STT_TIMEOUT_MS = 60000;

export function buildSttRequest(stt) {
  return {
    url: joinUrl(stt.baseUrl, stt.apiPath),
    // content-type не задаём: FormData сам выставит boundary.
    headers: { ...buildAuthHeaders(stt) },
  };
}

/** Извлекает текст из ответа STT: JSON {text} (default) или свой путь. */
export function parseSttResponse(json, responsePath) {
  if (typeof json === "string") return json;
  const value = getByPath(json, responsePath || "text");
  if (typeof value === "string") return value; // пустая строка = тишина, это ок
  throw new ApiError(
    "parse",
    "Не удалось извлечь текст из ответа STT: проверьте response path.",
    { technical: JSON.stringify(json).slice(0, 200) }
  );
}

/**
 * Распознаёт аудио-чанк.
 * @param {object} stt - эффективные STT-настройки (settings.stt)
 * @param {Blob} blob - аудио (webm/ogg/wav)
 * @returns {Promise<string>} распознанный текст (может быть пустым)
 */
export async function transcribe(stt, blob, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const { url, headers } = buildSttRequest(stt);

  const type = String(blob.type || "");
  const ext = type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", blob, `chunk.${ext}`);
  if (stt.model) form.append("model", stt.model);
  if (stt.language) form.append("language", stt.language);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new ApiError("network", "Таймаут STT-запроса.", {
        retryable: true,
        code: "timeout",
      });
    }
    throw new ApiError(
      "network",
      "Сетевая ошибка при обращении к STT endpoint: адрес, CORS или нет разрешения.",
      { technical: String((e && e.message) || e), code: "network" }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw classifyHttpStatus(response.status, bodyText);
  }

  let json;
  try {
    json = await response.json();
  } catch (e) {
    throw new ApiError("parse", "Ответ STT endpoint не является JSON.", {
      technical: String((e && e.message) || e),
      code: "not_json",
    });
  }
  return parseSttResponse(json, stt.responsePath);
}

/**
 * Генерирует короткий тихий WAV (PCM16 mono) для Test connection STT:
 * проверяет доступность endpoint без реального аудио.
 */
export function makeSilentWav(ms = 600, sampleRate = 16000) {
  const samples = Math.floor((sampleRate * ms) / 1000);
  const dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true); // размер fmt-блока
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // бит на сэмпл
  writeStr(36, "data");
  dv.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}
