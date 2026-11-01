import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aiConfig,
  EMPTY_AI_SETTINGS,
  NO_SPEECH,
  type AiSettings,
  type LanguageSettings,
} from "../lib/server/ai-config.ts";

const language = (name: string, overrides: Partial<LanguageSettings> = {}): LanguageSettings => ({
  name,
  code: "",
  hidden: false,
  speech: NO_SPEECH,
  plusSpeech: NO_SPEECH,
  ...overrides,
});
const basicSpeech = { model: "basic/tts", voice: "Mia", instructions: "Calm." };
const plusSpeech = { model: "plus/tts", voice: "", instructions: "" };
const settings: AiSettings = {
  basic: { apiKey: "basic-key", model: "basic/chat" },
  plus: { apiKey: "", model: "" },
  languages: [
    language("Swedish", { speech: basicSpeech }),
    language("French", { speech: basicSpeech, plusSpeech }),
    language("German", { plusSpeech }),
    language("Italian"),
  ],
};

test("nothing configured means every AI feature is off", () => {
  const config = aiConfig("basic", { ...EMPTY_AI_SETTINGS, languages: settings.languages });
  assert.deepEqual(config.features, { languageNotes: false, speech: [] });
  assert.equal(config.speech("Swedish"), null);
});

test("a key without a model, or a model without a key, keeps language notes off", () => {
  const noModel = { ...settings, basic: { apiKey: "basic-key", model: "" } };
  assert.equal(aiConfig("basic", noModel).languageNotes, false);
  const noKey = { ...settings, basic: { apiKey: "", model: "basic/chat" } };
  assert.equal(aiConfig("basic", noKey).languageNotes, false);
  assert.deepEqual(aiConfig("basic", noKey).features.speech, []);
});

test("basic accounts get basic speech only for languages with a basic model", () => {
  const config = aiConfig("basic", settings);
  assert.equal(config.languageNotes, true);
  assert.equal(config.languageNoteModel, "basic/chat");
  assert.deepEqual(config.features.speech, ["Swedish", "French"]);
  assert.deepEqual(config.speech("French"), basicSpeech);
  assert.equal(config.speech("German"), null);
  assert.equal(config.speech("Other"), null);
});

test("plus accounts use plus speech where set, else the three basic settings together", () => {
  const config = aiConfig("plus", settings);
  assert.deepEqual(config.speech("French"), plusSpeech);
  assert.deepEqual(config.speech("Swedish"), basicSpeech);
  assert.deepEqual(config.speech("German"), plusSpeech);
  assert.equal(config.speech("Italian"), null);
  assert.deepEqual(config.features.speech, ["Swedish", "French", "German"]);
});

test("plus settings left blank use the basic key and model; set ones replace them", () => {
  assert.equal(aiConfig("plus", settings).apiKey, "basic-key");
  assert.equal(aiConfig("plus", settings).languageNoteModel, "basic/chat");
  const own = { ...settings, plus: { apiKey: "plus-key", model: "plus/chat" } };
  assert.equal(aiConfig("plus", own).apiKey, "plus-key");
  assert.equal(aiConfig("plus", own).languageNoteModel, "plus/chat");
  assert.equal(aiConfig("basic", own).apiKey, "basic-key");
});

test("unknown or missing tiers are treated as basic", () => {
  for (const tier of [undefined, "gold"]) {
    assert.equal(aiConfig(tier, settings).tier, "basic");
    assert.equal(aiConfig(tier, settings).speech("German"), null);
  }
});
