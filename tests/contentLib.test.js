import { test } from "node:test";
import assert from "node:assert/strict";

// contentLib — classic script: экспортирует через globalThis (side-effect).
import "../extension/src/content/contentLib.js";

const lib = globalThis.FactLensLib;

test("appendWithOverlap: бегущая строка субтитров склеивается без дублей", () => {
  let buf = "";
  buf = lib.appendWithOverlap(buf, "сегодня мы поговорим");
  buf = lib.appendWithOverlap(buf, "мы поговорим о новостях");
  buf = lib.appendWithOverlap(buf, "о новостях экономики");
  assert.equal(buf, "сегодня мы поговорим о новостях экономики");
});

test("appendWithOverlap: полный повтор не добавляется", () => {
  const buf = "инфляция составила пять процентов";
  assert.equal(
    lib.appendWithOverlap(buf, "составила пять процентов"),
    buf
  );
  assert.equal(lib.appendWithOverlap(buf, ""), buf);
});

test("appendWithOverlap: текст без перекрытия добавляется через пробел", () => {
  assert.equal(
    lib.appendWithOverlap("первая фраза.", "вторая фраза."),
    "первая фраза. вторая фраза."
  );
  assert.equal(lib.appendWithOverlap("", "начало"), "начало");
});

test("splitIntoChunks: режет по границам предложений и держит лимит", () => {
  const text =
    "Первое предложение о фактах. Второе предложение подлиннее и с цифрами 123! " +
    "Третье предложение? Четвёртое предложение для набора длины.";
  const chunks = lib.splitIntoChunks(text, 80);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 80, `чанк длиннее лимита: ${chunk.length}`);
  }
  // Ничего не потеряли.
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  // Первый чанк заканчивается на границе предложения.
  assert.ok(/[.!?]$/.test(chunks[0]));
});

test("splitIntoChunks: сверхдлинное предложение режется жёстко", () => {
  const long = "слово ".repeat(100).trim() + "."; // ~600 символов без границ
  const chunks = lib.splitIntoChunks(long, 100);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 100);
});

test("splitIntoChunks: пустой вход", () => {
  assert.deepEqual(lib.splitIntoChunks("", 100), []);
  assert.deepEqual(lib.splitIntoChunks("   ", 100), []);
});

test("findFlushCut: режет после последней границы предложения", () => {
  const pending = "Первое. Второе! Третье незаконченное";
  const cut = lib.findFlushCut(pending, false);
  assert.equal(pending.slice(0, cut).trim(), "Первое. Второе!");
  // Без границ и без force — не режем.
  assert.equal(lib.findFlushCut("нет границ предложения", false), -1);
  // C force — режем всё.
  assert.equal(
    lib.findFlushCut("нет границ предложения", true),
    "нет границ предложения".length
  );
});

test("parseTimedTextJson3: собирает события из json3", () => {
  const data = {
    events: [
      { tStartMs: 0, segs: [{ utf8: "Привет " }, { utf8: "мир" }] },
      { tStartMs: 1500, segs: [{ utf8: "\n" }] }, // пустое — пропускаем
      { tStartMs: 3000, segs: [{ utf8: "вторая реплика" }] },
      { tStartMs: 4000 }, // без segs — пропускаем
    ],
  };
  const events = lib.parseTimedTextJson3(data);
  assert.deepEqual(events, [
    { tMs: 0, text: "Привет мир" },
    { tMs: 3000, text: "вторая реплика" },
  ]);
  assert.equal(lib.transcriptToText(events), "Привет мир вторая реплика");
  assert.deepEqual(lib.parseTimedTextJson3(null), []);
});

test("pickCaptionTrack: приоритет ручных дорожек и языков", () => {
  const ruAsr = { languageCode: "ru", kind: "asr", name: "ru auto" };
  const enManual = { languageCode: "en", name: "en manual" };
  const deManual = { languageCode: "de", name: "de manual" };

  // Ручная en важнее авто-ru при preferred ["ru","en"]? Нет:
  // сначала ищем ручную ru (нет), ручную en (есть) -> en manual.
  assert.equal(lib.pickCaptionTrack([ruAsr, enManual], ["ru", "en"]), enManual);
  // Только авто-ru и ручная de: ручных ru/en нет, авто-ru есть -> ru asr.
  assert.equal(lib.pickCaptionTrack([ruAsr, deManual], ["ru", "en"]), ruAsr);
  // Ничего из preferred: берём первую ручную.
  assert.equal(lib.pickCaptionTrack([ruAsr, deManual], ["fr"]), deManual);
  assert.equal(lib.pickCaptionTrack([], ["ru"]), null);
});

test("formatTimeMs", () => {
  assert.equal(lib.formatTimeMs(0), "0:00");
  assert.equal(lib.formatTimeMs(65000), "1:05");
  assert.equal(lib.formatTimeMs(600000), "10:00");
});
