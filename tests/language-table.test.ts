import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageView } from "../lib/admin/ai-settings.ts";
import { changedLanguages, sameLanguage, withField } from "../lib/admin/language-table.ts";

const blank = { model: "", voice: "", instructions: "" };
const language = (name: string, revision = "1"): LanguageView => ({
  name,
  revision,
  code: "",
  hidden: false,
  speech: blank,
  plusSpeech: blank,
});

test("a bulk field sets one value on a language, leaving the rest", () => {
  const sv = language("Swedish");
  assert.deepEqual(withField(sv, "speech.model", "openai/gpt-4o-mini-tts").speech, {
    ...blank,
    model: "openai/gpt-4o-mini-tts",
  });
  assert.deepEqual(withField(sv, "plusSpeech.voice", "marin").plusSpeech, {
    ...blank,
    voice: "marin",
  });
  assert.equal(withField(sv, "speech.model", "x").plusSpeech, sv.plusSpeech);
  assert.equal(withField(sv, "hidden", "yes").hidden, true);
  assert.equal(withField({ ...sv, hidden: true }, "hidden", "no").hidden, false);
});

test("only edited rows that differ are saved, from the server's current revision", () => {
  const server = [language("Swedish", "4"), language("French", "2")];
  assert.ok(sameLanguage(language("Swedish", "1"), server[0]));
  const drafts = {
    // Edited back to what the server has: nothing to save.
    Swedish: { ...language("Swedish", "3") },
    French: withField(language("French", "1"), "hidden", "yes"),
  };
  assert.deepEqual(changedLanguages(server, drafts), [
    { ...language("French", "2"), hidden: true },
  ]);
  assert.deepEqual(changedLanguages(server, {}), []);
});
