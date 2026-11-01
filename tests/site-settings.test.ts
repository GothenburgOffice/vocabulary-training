import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptionReady, encryptSecret } from "../lib/server/secrets.ts";
import { listModels } from "../lib/server/requesty-client.ts";
import {
  DEFAULT_LANGUAGES,
  languageCodes,
  OTHER_LANGUAGE,
  pickerLanguages,
} from "../lib/languages.ts";
import { languageCreateSchema, tierUpdateSchema } from "../lib/admin/ai-settings.ts";

const env = { SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const otherEnv = { SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") };

test("API keys are encrypted at rest and only readable with the same key", () => {
  const stored = encryptSecret("rqsty-sk-test-only", env);
  assert(!stored.includes("rqsty-sk-test-only"));
  assert.notEqual(stored, encryptSecret("rqsty-sk-test-only", env));
  assert.equal(decryptSecret(stored, env), "rqsty-sk-test-only");
  assert.equal(decryptSecret(stored, otherEnv), null);
  assert.equal(decryptSecret(stored, {}), null);
  const [version, iv, tag] = stored.split(":");
  const tampered = [version, iv, tag, Buffer.from("tampered").toString("base64")].join(":");
  assert.equal(decryptSecret(tampered, env), null);
});

test("saving a key without a usable encryption key fails with a clear 503", () => {
  for (const bad of [{}, { SETTINGS_ENCRYPTION_KEY: "too-short" }]) {
    assert.equal(encryptionReady(bad), false);
    assert.throws(() => encryptSecret("key", bad), { status: 503 });
  }
  assert.equal(encryptionReady(env), true);
});

test("pickers offer visible languages and Other, keeping hidden ones already in use", () => {
  const languages = [...DEFAULT_LANGUAGES, { name: "Klingon", code: "tlh", hidden: true }];
  const visible = pickerLanguages(languages);
  assert.equal(visible.at(-1), OTHER_LANGUAGE);
  assert.equal(visible.includes("Klingon"), false);
  assert.deepEqual(pickerLanguages(languages, ["Klingon", ""]).slice(-2), [
    OTHER_LANGUAGE,
    "Klingon",
  ]);
  assert.equal(languageCodes(languages).tlh, "Klingon");
  assert.equal(languageCodes(languages).sv, "Swedish");
});

test("admin input: codes are optional and normalized, Other is reserved, keys are write-only", () => {
  assert.deepEqual(languageCreateSchema.parse({ name: " Dutch ", code: " NL " }), {
    name: "Dutch",
    code: "nl",
  });
  assert.equal(languageCreateSchema.safeParse({ name: "Dutch", code: "" }).success, true);
  assert.equal(languageCreateSchema.safeParse({ name: "other", code: "" }).success, false);
  assert.equal(languageCreateSchema.safeParse({ name: "Dutch", code: "n" }).success, false);
  assert.equal(tierUpdateSchema.safeParse({ tier: "plus", apiKey: null }).success, true);
  assert.equal(tierUpdateSchema.safeParse({ tier: "gold" }).success, false);
});

test("the model list is sorted into chat and speech models, sending only the key", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({
      data: [
        { id: "openai/gpt-4o-mini", api: "chat" },
        { id: "openai/gpt-4o-mini-tts", api: "speech" },
        { id: "openai/text-embedding-3", api: "embedding" },
        { id: "deepinfra/kokoro-tts" },
        { id: "some/chat-model" },
      ],
    });
  }) as typeof fetch;
  assert.deepEqual(await listModels("synthetic-key", transport), {
    chat: ["openai/gpt-4o-mini", "some/chat-model"],
    speech: ["deepinfra/kokoro-tts", "openai/gpt-4o-mini-tts"],
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/models\/all$/);
  assert.equal(calls[0].init?.body, undefined);
  assert.deepEqual(calls[0].init?.headers, { Authorization: "Bearer synthetic-key" });
});
