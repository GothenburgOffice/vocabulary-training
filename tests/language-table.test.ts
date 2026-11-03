import assert from "node:assert/strict";
import { test } from "node:test";
import type { LanguageView } from "../lib/admin/ai-settings.ts";
import {
  changedLanguages,
  sameLanguage,
  sortLanguages,
  withField,
} from "../lib/admin/language-table.ts";
import { voicesFor } from "../lib/admin/voices.ts";

const blank = { model: "", voice: "", instructions: "" };
const language = (name: string, revision = "1"): LanguageView => ({
  name,
  revision,
  code: "",
  hidden: false,
  highlighted: false,
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
  assert.equal(withField(sv, "highlighted", "yes").highlighted, true);
});

test("only edited rows that differ are saved, from the revision they were edited from", () => {
  const server = [language("Swedish", "4"), language("French", "2")];
  assert.ok(sameLanguage(language("Swedish", "1"), server[0]));
  const drafts = {
    // Edited back to what the server has: nothing to save.
    Swedish: { ...language("Swedish", "3") },
    French: withField(language("French", "1"), "hidden", "yes"),
  };
  // Not rebased onto the server's revision 2: if French changed elsewhere, this must get 409.
  assert.deepEqual(changedLanguages(server, drafts), [
    { ...language("French", "1"), hidden: true },
  ]);
  assert.deepEqual(changedLanguages(server, {}), []);
});

test("voice lists match the providers' docs, grouped by language where they have several", () => {
  const mimo = voicesFor("deepinfra/XiaomiMiMo/MiMo-V2.5-tts");
  assert.deepEqual(
    mimo.groups?.map((g) => [g.label, g.voices]),
    [
      ["English", ["Mia", "Chloe", "Milo", "Dean"]],
      ["Chinese", ["冰糖", "茉莉", "苏打", "白桦"]],
    ],
  );
  assert.equal(mimo.voices[0], "mimo_default");
  const kokoro = voicesFor("deepinfra/hexgrad/Kokoro-82M");
  assert.equal(kokoro.voices.length, 54);
  // Every grouped voice is offered, and only once.
  for (const { voices, groups = [] } of [mimo, kokoro]) {
    assert.equal(new Set(voices).size, voices.length);
    for (const group of groups) for (const v of group.voices) assert.ok(voices.includes(v));
  }
  assert.deepEqual(voicesFor("deepinfra/ResembleAI/chatterbox").voices, []);
  assert.deepEqual(voicesFor("unknown/model"), { voices: [], note: "" });
});

test("languages sort by a heading, empty text last, ties in the server's order", () => {
  const sv = { ...language("Swedish"), code: "sv", highlighted: true };
  const fr = { ...language("French"), code: "fr" };
  const xx = language("Klingon");
  const de = { ...language("German"), code: "de", speech: { ...blank, model: "b-model" } };
  const list = [sv, fr, xx, de];
  const names = (sorted: LanguageView[]) => sorted.map((l) => l.name);
  assert.equal(sortLanguages(list, null), list);
  assert.deepEqual(names(sortLanguages(list, { key: "code", dir: "asc" })), [
    "German",
    "French",
    "Swedish",
    "Klingon",
  ]);
  // Reversed, empty text still goes last.
  assert.deepEqual(names(sortLanguages(list, { key: "code", dir: "desc" })), [
    "Swedish",
    "French",
    "German",
    "Klingon",
  ]);
  assert.deepEqual(names(sortLanguages(list, { key: "name", dir: "asc" })), [
    "French",
    "German",
    "Klingon",
    "Swedish",
  ]);
  // Ticked first when descending; the rest keep the server's order.
  assert.deepEqual(names(sortLanguages(list, { key: "highlighted", dir: "desc" })), [
    "Swedish",
    "French",
    "Klingon",
    "German",
  ]);
  assert.deepEqual(names(sortLanguages(list, { key: "speech.model", dir: "asc" })), [
    "German",
    "Swedish",
    "French",
    "Klingon",
  ]);
});
