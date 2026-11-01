import assert from "node:assert/strict";
import { test } from "node:test";
import { aiConfig } from "../lib/server/ai-config.ts";
import { DEFAULT_FEEDBACK_MODEL } from "../lib/server/requesty-client.ts";
import { DEFAULT_SPEECH_MODEL, DEFAULT_SPEECH_VOICE } from "../lib/server/speech-client.ts";

const env = {
  REQUESTY_API_KEY: "basic-key",
  REQUESTY_MODEL: "basic/model",
  REQUESTY_SPEECH_MODEL: "basic/tts",
  REQUESTY_SPEECH_VOICE: "Mia",
};

test("basic tier uses the basic settings and defaults", () => {
  assert.deepEqual(aiConfig("basic", {}), {
    tier: "basic",
    apiKey: "",
    model: DEFAULT_FEEDBACK_MODEL,
    speechModel: DEFAULT_SPEECH_MODEL,
    speechVoice: DEFAULT_SPEECH_VOICE,
  });
  assert.equal(aiConfig("basic", env).apiKey, "basic-key");
});

test("unknown or missing tiers fall back to basic", () => {
  const plusEnv = { ...env, REQUESTY_PLUS_API_KEY: "plus-key" };
  assert.equal(aiConfig(undefined, plusEnv).tier, "basic");
  assert.equal(aiConfig("gold", plusEnv).apiKey, "basic-key");
});

test("plus tier without its own key uses the basic tier", () => {
  assert.deepEqual(aiConfig("plus", env), aiConfig("basic", env));
});

test("plus tier uses its own key and models, inheriting blank settings", () => {
  const plus = aiConfig("plus", {
    ...env,
    REQUESTY_PLUS_API_KEY: "plus-key",
    REQUESTY_PLUS_MODEL: "plus/model",
    REQUESTY_PLUS_SPEECH_MODEL: "",
  });
  assert.deepEqual(plus, {
    tier: "plus",
    apiKey: "plus-key",
    model: "plus/model",
    speechModel: "basic/tts",
    speechVoice: "Mia",
  });
});
