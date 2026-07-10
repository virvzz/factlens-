import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPrompts,
  DEFAULT_PROMPTS,
  fillTemplate,
} from "../extension/src/shared/prompts.js";

function cfg(overrides = {}) {
  return {
    prompts: { ...DEFAULT_PROMPTS },
    language: "ru",
    customLanguage: "",
    strictness: "balanced",
    ...overrides,
  };
}

test("buildPrompts: текст попадает в user, инструкции — в system", () => {
  const { system, user } = buildPrompts(cfg(), "проверяемый текст");
  assert.ok(user.includes("проверяемый текст"));
  assert.ok(system.includes("Strictness: balanced"));
  assert.ok(!system.includes("{{language_instruction}}")); // подставлено
  assert.ok(!system.includes("{{strictness_instruction}}"));
});

test("buildPrompts: языковая инструкция дублируется в конце user-сообщения", () => {
  const { system, user } = buildPrompts(cfg({ language: "ru" }), "текст");
  assert.ok(system.includes(DEFAULT_PROMPTS.outputRu));
  assert.ok(user.trimEnd().endsWith(DEFAULT_PROMPTS.outputRu));

  const en = buildPrompts(cfg({ language: "en" }), "text");
  assert.ok(en.user.trimEnd().endsWith(DEFAULT_PROMPTS.outputEn));

  const custom = buildPrompts(
    cfg({ language: "custom", customLanguage: "Deutsch" }),
    "text"
  );
  assert.ok(custom.user.includes("Deutsch"));
});

test("fillTemplate: неизвестные плейсхолдеры не трогаются", () => {
  assert.equal(
    fillTemplate("a {{known}} b {{unknown}}", { known: "X" }),
    "a X b {{unknown}}"
  );
});
