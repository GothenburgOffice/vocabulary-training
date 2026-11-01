import test from "node:test";
import assert from "node:assert/strict";
import { pronunciationText } from "../lib/speech.ts";
import { speechSchema } from "../lib/server/speech-input.ts";
import { requestSpeech, SpeechService } from "../lib/server/speech-client.ts";
import { FeedbackUnavailable } from "../lib/server/requesty-client.ts";

const input = { text: "Hello", language: "English" };
const config = {
  apiKey: "synthetic-test-key",
  model: "synthetic/tts",
  voice: "Mia",
  instructions: "",
};
const wav = () => {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(40, 4);
  bytes.write("WAVE", 8);
  return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
};

test("speech input is short word data, with no client-selected model, voice or extra fields", () => {
  assert.equal(speechSchema.safeParse(input).success, true);
  for (const value of [
    { ...input, model: "paid/model" },
    { ...input, voice: "other" },
    { ...input, text: "" },
    { ...input, text: "x".repeat(201) },
    { ...input, text: "hello\u0000" },
    { ...input, language: "" },
  ]) {
    assert.equal(speechSchema.safeParse(value).success, false);
  }
  assert.equal(pronunciationText(" e\u0301cole "), "école");
});

test("speech makes exactly one WAV generation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    return wav();
  }) as typeof fetch;
  const result = await requestSpeech(input, config, transport);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.bytes.byteLength, 48);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/audio\/speech$/);
  assert.equal(calls[0].init?.redirect, "error");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    model: "synthetic/tts",
    voice: "Mia",
    input: "Hello",
    response_format: "wav",
  });
});

test("speech sends voice and instructions only when they are set", async () => {
  const bodies: Record<string, unknown>[] = [];
  const transport = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return wav();
  }) as typeof fetch;
  await requestSpeech(input, { ...config, voice: "" }, transport);
  await requestSpeech(input, { ...config, instructions: "Speak slowly." }, transport);
  assert.equal("voice" in bodies[0], false);
  assert.equal("instructions" in bodies[0], false);
  assert.equal(bodies[1].instructions, "Speak slowly.");
});

test("invalid speech configuration is refused before any request", async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    return wav();
  }) as typeof fetch;
  for (const candidate of [
    { ...config, apiKey: "" },
    { ...config, model: "policy/anything" },
    { ...config, model: "" },
    { ...config, voice: "x".repeat(61) },
    { ...config, instructions: "x".repeat(2001) },
  ]) {
    await assert.rejects(requestSpeech(input, candidate, transport), FeedbackUnavailable);
  }
  assert.equal(calls, 0);
});

test("speech rejects invalid audio, oversized streams, timeouts and provider errors without retries", async () => {
  for (const value of [
    new Response("not audio"),
    new Response("x".repeat(4_000_001)),
    new Response("x", { headers: { "content-length": "4000001" } }),
    new Response("private provider error", { status: 429 }),
    new Response("private provider error", { status: 500 }),
  ]) {
    let calls = 0;
    const transport = (async () => {
      calls++;
      return value;
    }) as typeof fetch;
    await assert.rejects(requestSpeech(input, config, transport), FeedbackUnavailable);
    assert.equal(calls, 1);
  }
  await assert.rejects(
    requestSpeech(input, config, (async () => {
      throw new Error("private timeout");
    }) as typeof fetch),
    FeedbackUnavailable,
  );
});

test("speech cache replays and deduplicates per account, with no additional provider calls", async () => {
  let calls = 0;
  let complete: (() => void) | undefined;
  const transport = (async () => {
    calls++;
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return wav();
  }) as typeof fetch;
  const service = new SpeechService();
  const first = service.get("account-a", input, config, transport);
  const duplicate = service.get("account-a", input, config, transport);
  // Wait for a provider request, not elapsed wall-clock time.
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  complete();
  assert.equal((await first).cache, "miss");
  assert.equal((await duplicate).cache, "hit");
  assert.equal((await service.get("account-a", input, config, transport)).cache, "hit");
  assert.equal(calls, 1);
});

test("speech cache is account/model/voice/language scoped, expires and evicts", async () => {
  let calls = 0;
  let now = Date.UTC(2026, 9, 31, 10);
  const transport = (async () => {
    calls++;
    return wav();
  }) as typeof fetch;
  const service = new SpeechService(() => now, 1);
  await service.get("a", input, config, transport);
  assert.equal((await service.get("b", input, config, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, config, transport)).cache, "miss");
  now += 3_600_001;
  assert.equal((await service.get("a", input, config, transport)).cache, "miss");
  now += 1000;
  assert.equal(
    (await service.get("a", { ...input, language: "French" }, config, transport)).cache,
    "miss",
  );
  now += 1000;
  assert.equal(
    (await service.get("a", input, { ...config, voice: "Dean" }, transport)).cache,
    "miss",
  );
  now += 1000;
  assert.equal(
    (await service.get("a", input, { ...config, model: "synthetic/other" }, transport)).cache,
    "miss",
  );
  assert.equal(calls, 7);
});

test("speech cooldown is per account and skips cache hits, with no global quota", async () => {
  let now = Date.UTC(2026, 9, 31, 10);
  const service = new SpeechService(() => now);
  const transport = (async () => wav()) as typeof fetch;
  await service.get("a", input, config, transport);
  assert.equal((await service.get("a", input, config, transport)).cache, "hit");
  assert.equal((await service.get("b", input, config, transport)).cache, "miss");
  await assert.rejects(
    service.get("a", { ...input, text: "Please" }, config, transport),
    FeedbackUnavailable,
  );
  now += 500;
  assert.equal(
    (await service.get("a", { ...input, text: "Please" }, config, transport)).cache,
    "miss",
  );
});

test("failed speech is not cached, releases concurrency and respects the byte budget", async () => {
  let now = Date.UTC(2026, 9, 31, 10);
  let calls = 0;
  const service = new SpeechService(() => now, 128, 47);
  await assert.rejects(
    service.get("a", input, config, (async () => {
      throw new Error("private failure");
    }) as typeof fetch),
    FeedbackUnavailable,
  );
  now += 1000;
  const transport = (async () => {
    calls++;
    return wav();
  }) as typeof fetch;
  assert.equal((await service.get("a", input, config, transport)).cache, "miss");
  now += 1000;
  assert.equal((await service.get("a", input, config, transport)).cache, "miss");
  assert.equal(calls, 2);
});
