import test from "node:test";
import assert from "node:assert/strict";
import { pronunciationText } from "../lib/speech.ts";
import { speechSchema } from "../lib/server/speech-input.ts";
import { DEFAULT_SPEECH_MODEL, DEFAULT_SPEECH_VOICE, isZeroPricedSpeechModel, requestSpeech, SpeechService } from "../lib/server/speech-client.ts";
import { FeedbackUnavailable } from "../lib/server/requesty-client.ts";

const input = { text: "Hello", language: "English" };
const config = { apiKey: "synthetic-test-key", model: DEFAULT_SPEECH_MODEL, voice: DEFAULT_SPEECH_VOICE, allowPaid: false };
const catalog = { data: [{ id: config.model, pricing: { input_character: 0 } }] };
const json = (value: unknown) => new Response(JSON.stringify(value));
const wav = () => {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(40, 4); bytes.write("WAVE", 8);
  return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
};

test("speech input is short word data, with no client-selected model, voice or extra fields", () => {
  assert.equal(speechSchema.safeParse(input).success, true);
  for (const value of [{ ...input, model: "paid/model" }, { ...input, voice: "other" }, { ...input, text: "" },
    { ...input, text: "x".repeat(201) }, { ...input, text: "hello\u0000" }, { ...input, language: "" }]) {
    assert.equal(speechSchema.safeParse(value).success, false);
  }
  assert.equal(pronunciationText(" e\u0301cole | school "), "école");
});

test("speech pricing fails closed for paid, missing, unknown, duplicate and malformed entries", () => {
  assert.equal(isZeroPricedSpeechModel(catalog, config.model), true);
  for (const pricing of [null, [], {}, { input_character: "0" }, { input_character: 0.01 },
    { input_character: 0, extra_fee: 1 }, { input_character: 0, output_token: .01 }]) {
    assert.equal(isZeroPricedSpeechModel({ data: [{ id: config.model, pricing }] }, config.model), false);
  }
  assert.equal(isZeroPricedSpeechModel({ data: [...catalog.data, ...catalog.data] }, config.model), false);
  assert.equal(isZeroPricedSpeechModel(catalog, "missing"), false);
});

test("speech checks the authenticated catalog before exactly one WAV generation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? json(catalog) : wav();
  }) as typeof fetch;
  const result = await requestSpeech(input, config, transport);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.bytes.byteLength, 48);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/models\/speech$/);
  assert.match(calls[1].url, /\/audio\/speech$/);
  assert.equal(calls[0].init?.signal, calls[1].init?.signal);
  assert.equal(calls[1].init?.redirect, "error");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    model: DEFAULT_SPEECH_MODEL, voice: "Mia", input: "Hello", response_format: "wav",
  });
});

test("speech never generates when free pricing is unavailable or nonzero", async () => {
  let calls = 0;
  const transport = (async () => { calls++; return json({ data: [] }); }) as typeof fetch;
  await assert.rejects(requestSpeech(input, config, transport), FeedbackUnavailable);
  assert.equal(calls, 1);
  for (const candidate of [{ ...config, apiKey: "" }, { ...config, model: "policy/anything" }, { ...config, voice: "" }]) {
    await assert.rejects(requestSpeech(input, candidate, transport), FeedbackUnavailable);
  }
  assert.equal(calls, 1);
});

test("speech rejects invalid audio, oversized streams, timeouts and provider errors without retries", async () => {
  for (const value of [
    new Response("not audio"), new Response("x".repeat(4_000_001)),
    new Response("x", { headers: { "content-length": "4000001" } }),
    new Response("private provider error", { status: 429 }),
    new Response("private provider error", { status: 500 }),
  ]) {
    let calls = 0;
    const transport = (async () => { calls++; return value; }) as typeof fetch;
    await assert.rejects(requestSpeech(input, { ...config, allowPaid: true }, transport), FeedbackUnavailable);
    assert.equal(calls, 1);
  }
  await assert.rejects(requestSpeech(input, config, (async () => { throw new Error("private timeout"); }) as typeof fetch), FeedbackUnavailable);
});

test("speech cache replays and deduplicates per account, with no additional provider calls", async () => {
  let calls = 0;
  let complete: (() => void) | undefined;
  const transport = (async (url) => {
    calls++;
    if (String(url).endsWith("/models/speech")) return json(catalog);
    await new Promise<void>(resolve => { complete = resolve; });
    return wav();
  }) as typeof fetch;
  const service = new SpeechService();
  const first = service.get("account-a", input, config, 200, transport);
  const duplicate = service.get("account-a", input, config, 200, transport);
  // Wait for a provider request, not elapsed wall-clock time.
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  complete();
  assert.equal((await first).cache, "miss");
  assert.equal((await duplicate).cache, "hit");
  assert.equal((await service.get("account-a", input, config, 200, transport)).cache, "hit");
  assert.equal(calls, 2);
});

test("speech cache is account/model/voice/language scoped, expires and evicts", async () => {
  let calls = 0;
  let now = Date.UTC(2026, 9, 31, 10);
  const transport = (async (url) => { calls++; return String(url).endsWith("/models/speech") ? json(catalog) : wav(); }) as typeof fetch;
  const service = new SpeechService(() => now, 1);
  await service.get("a", input, config, 200, transport);
  assert.equal((await service.get("b", input, config, 200, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, config, 200, transport)).cache, "miss");
  now += 3_600_001;
  assert.equal((await service.get("a", input, config, 200, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", { ...input, language: "French" }, config, 200, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, { ...config, voice: "Dean" }, 200, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, { ...config, model: "synthetic/other", allowPaid: true }, 200, transport)).cache, "miss");
  assert.equal(calls, 13);
});

test("speech generation quotas do not count cache hits and reset the next UTC day", async () => {
  let now = Date.UTC(2026, 9, 31, 10);
  const service = new SpeechService(() => now);
  const transport = (async (url) => String(url).endsWith("/models/speech") ? json(catalog) : wav()) as typeof fetch;
  await service.get("a", input, config, 1, transport);
  assert.equal((await service.get("a", input, config, 1, transport)).cache, "hit");
  await assert.rejects(service.get("b", input, config, 1, transport), FeedbackUnavailable);
  now += 1000;
  await assert.rejects(service.get("a", { ...input, text: "Please" }, config, 1, transport), FeedbackUnavailable);
  now += 86_400_000;
  assert.equal((await service.get("a", input, config, 1, transport)).cache, "miss");
});

test("failed speech is not cached, releases concurrency and respects the byte budget", async () => {
  let now = Date.UTC(2026, 9, 31, 10);
  let calls = 0;
  const service = new SpeechService(() => now, 128, 47);
  await assert.rejects(service.get("a", input, config, 200, (async () => { throw new Error("private failure"); }) as typeof fetch), FeedbackUnavailable);
  now += 1000;
  const transport = (async (url) => { calls++; return String(url).endsWith("/models/speech") ? json(catalog) : wav(); }) as typeof fetch;
  assert.equal((await service.get("a", input, config, 200, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, config, 200, transport)).cache, "miss");
  assert.equal(calls, 4);
});
