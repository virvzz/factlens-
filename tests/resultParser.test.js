import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractJson,
  normalizeClaims,
  VERDICTS,
} from "../extension/src/shared/resultParser.js";

const sample = {
  claims: [
    {
      claim: "Инфляция в США достигла 9.1% в 2022 году.",
      speaker: "unknown",
      verdict: "MOSTLY_TRUE",
      confidence: 0.86,
      explanation: "Краткое объяснение.",
      sources: [{ title: "Источник", url: "https://example.com", quote: "цитата" }],
      needs_manual_review: false,
    },
  ],
};

test("extractJson: чистый JSON", () => {
  assert.deepEqual(extractJson(JSON.stringify(sample)), sample);
});

test("extractJson: JSON в markdown fence", () => {
  const wrapped = "Вот результат:\n```json\n" + JSON.stringify(sample) + "\n```\nГотово.";
  assert.deepEqual(extractJson(wrapped), sample);
});

test("extractJson: JSON обёрнут текстом (без fence)", () => {
  const wrapped =
    "Конечно! Вот анализ: " + JSON.stringify(sample) + " Надеюсь, это поможет.";
  assert.deepEqual(extractJson(wrapped), sample);
});

test("extractJson: фигурные скобки внутри строк не ломают парсер", () => {
  const tricky = { claims: [{ claim: "Текст со скобками { и } внутри", verdict: "TRUE" }] };
  const wrapped = "Ответ: " + JSON.stringify(tricky) + " конец";
  assert.deepEqual(extractJson(wrapped), tricky);
});

test("extractJson: мусор — ошибка parse", () => {
  assert.throws(() => extractJson("никакого json здесь нет"), /JSON/);
  assert.throws(() => extractJson(""), /пустой/i);
});

test("normalizeClaims: валидный ответ проходит без изменений", () => {
  const { claims, dropped } = normalizeClaims(sample);
  assert.equal(dropped, 0);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].verdict, "MOSTLY_TRUE");
  assert.equal(claims[0].confidence, 0.86);
  assert.equal(claims[0].sources[0].url, "https://example.com");
});

test("normalizeClaims: фильтрация мусора (claim filtering)", () => {
  const { claims, dropped } = normalizeClaims({
    claims: [
      { claim: "", verdict: "TRUE" }, // пустой текст — отброшен
      "просто строка", // не объект — отброшен
      null,
      { claim: "Нормальное утверждение", verdict: "FALSE", confidence: 5 },
    ],
  });
  assert.equal(dropped, 3);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].claim, "Нормальное утверждение");
  assert.equal(claims[0].confidence, 1); // clamp 0..1
});

test("normalizeClaims: невалидный verdict превращается в UNVERIFIABLE", () => {
  const { claims } = normalizeClaims({
    claims: [
      { claim: "A", verdict: "mostly true" }, // нормализация регистра/пробелов
      { claim: "B", verdict: "TOTALLY_BOGUS" },
      { claim: "C", verdict: null },
    ],
  });
  assert.equal(claims[0].verdict, "MOSTLY_TRUE");
  assert.equal(claims[0].needs_manual_review, false);
  assert.equal(claims[1].verdict, "UNVERIFIABLE");
  assert.equal(claims[1].needs_manual_review, true);
  assert.equal(claims[2].verdict, "UNVERIFIABLE");
});

test("normalizeClaims: источники с невалидным URL чистятся, выдуманные протоколы отбрасываются", () => {
  const { claims } = normalizeClaims({
    claims: [
      {
        claim: "X",
        verdict: "TRUE",
        sources: [
          { title: "Ок", url: "https://good.example.com/page" },
          { title: "Без URL" },
          { title: "Плохой URL", url: "javascript:alert(1)" },
          { url: "" }, // ни title, ни url — отброшен
          "мусор",
        ],
      },
    ],
  });
  const sources = claims[0].sources;
  assert.equal(sources.length, 3);
  assert.equal(sources[0].url, "https://good.example.com/page");
  assert.equal(sources[1].url, "");
  assert.equal(sources[2].url, ""); // javascript: вырезан
});

test("normalizeClaims: ответ без claims — ошибка parse", () => {
  assert.throws(() => normalizeClaims({ result: "ok" }), /claims/);
  assert.throws(() => normalizeClaims(null), /claims/);
});

test("VERDICTS: полный набор из ТЗ 9.2", () => {
  assert.deepEqual(VERDICTS, [
    "TRUE",
    "MOSTLY_TRUE",
    "MISLEADING",
    "FALSE",
    "UNVERIFIABLE",
    "OPINION_NOT_CHECK_WORTHY",
  ]);
});
