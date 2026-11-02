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

test("speech input is word data built on the server, with no model, voice or extra fields", () => {
  assert.equal(speechSchema.safeParse(input).success, true);
  assert.equal(speechSchema.safeParse({ ...input, text: "x".repeat(1000) }).success, true);
  for (const value of [
    { ...input, model: "paid/model" },
    { ...input, voice: "other" },
    { ...input, text: "" },
    // Every accepted answer may be read, up to 1,000 characters (#82).
    { ...input, text: "x".repeat(1001) },
    { ...input, text: "hello\u0000" },
    { ...input, language: "" },
  ]) {
    assert.equal(speechSchema.safeParse(value).success, false);
  }
  assert.equal(pronunciationText(" e\u0301cole "), "école");
});

test("speech makes exactly one WAV generation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const logged: Record<string, unknown>[] = [];
  const transport = (async (url, init) => {
    calls.push({ url: String(url), init });
    return wav();
  }) as typeof fetch;
  const result = await requestSpeech(input, config, transport, undefined, async (prompt) => {
    logged.push(prompt);
  });
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.bytes.byteLength, 48);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/audio\/speech$/);
  assert.equal(calls[0].init?.redirect, "error");
  const payload = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(payload, {
    model: "synthetic/tts",
    voice: "Mia",
    input: "Hello",
    response_format: "wav",
  });
  assert.deepEqual(logged, [payload]);
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
  let payload: unknown;
  const logged: Record<string, unknown>[] = [];
  let complete: (() => void) | undefined;
  const transport = (async (_url, init) => {
    calls++;
    payload = JSON.parse(String(init?.body));
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return wav();
  }) as typeof fetch;
  const service = new SpeechService();
  const guard = {
    blockMs: 10_000,
    cooldownMs: 500,
    logRequest: async (prompt: Record<string, unknown>) => {
      logged.push(prompt);
    },
  };
  const first = service.get("account-a", input, config, transport, guard);
  const duplicate = service.get("account-a", input, config, transport, guard);
  // Wait for a provider request, not elapsed wall-clock time.
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  complete();
  assert.equal((await first).cache, "miss");
  assert.equal((await duplicate).cache, "hit");
  assert.equal((await service.get("account-a", input, config, transport, guard)).cache, "hit");
  assert.equal(calls, 1);
  assert.equal(logged.length, 1);
  assert.deepEqual(logged, [payload]);
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

test("cached audio is deleted from memory when it expires, even if never asked for again", async () => {
  let now = Date.UTC(2026, 9, 31, 10);
  let calls = 0;
  const timers: { run: () => void; ms: number }[] = [];
  const transport = (async () => {
    calls++;
    return wav();
  }) as typeof fetch;
  const service = new SpeechService(
    () => now,
    128,
    16_000_000,
    (run, ms) => {
      timers.push({ run, ms });
    },
  );
  await service.get("a", input, config, transport);
  assert.deepEqual(
    timers.map((t) => t.ms),
    [3_600_000],
  );
  assert.equal((await service.get("a", input, config, transport)).cache, "hit");
  // The timer fires on a quiet server: the clip is gone, without any request or clock check.
  // (The clock moves only past the per-account cooldown, nowhere near the hour.)
  timers[0].run();
  now += 1000;
  assert.equal((await service.get("a", input, config, transport)).cache, "miss");
  assert.equal(calls, 2);
  // An old timer never removes the newer clip stored under the same key.
  timers[0].run();
  assert.equal((await service.get("a", input, config, transport)).cache, "hit");
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

test("one speech request at a time per account; a stuck one is replaced after the block", async () => {
  let now = Date.UTC(2026, 10, 2, 10);
  const service = new SpeechService(() => now);
  const signals: AbortSignal[] = [];
  const answers: (() => void)[] = [];
  // Each provider call waits until the test lets it answer, or is aborted.
  const transport = (async (_url: string, init: RequestInit) => {
    signals.push(init.signal!);
    await new Promise<void>((resolve, reject) => {
      answers.push(resolve);
      init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
    });
    return wav();
  }) as unknown as typeof fetch;
  const guard = { blockMs: 10_000, cooldownMs: 0 };
  const first = service.get("a", input, config, transport, guard);
  while (!answers.length) await new Promise((resolve) => setImmediate(resolve));

  // Another clip while the first loads: refused as busy, and the first one carries on.
  now += 2_000;
  await assert.rejects(
    service.get("a", { ...input, text: "Please" }, config, transport, guard),
    (e: FeedbackUnavailable) => e.reason === "busy",
  );
  // Other accounts are never held up by it.
  const other = service.get("b", { ...input, text: "Please" }, config, transport, guard);
  while (answers.length < 2) await new Promise((resolve) => setImmediate(resolve));
  answers[0]();
  answers[1]();
  assert.equal((await first).cache, "miss");
  assert.equal((await other).cache, "miss");

  // A request still unanswered after the block is abandoned, and stops costing.
  const stuck = service.get("a", { ...input, text: "Slow" }, config, transport, guard);
  while (answers.length < 3) await new Promise((resolve) => setImmediate(resolve));
  now += 10_000;
  const next = service.get("a", { ...input, text: "Next" }, config, transport, guard);
  await assert.rejects(stuck, FeedbackUnavailable);
  assert.equal(signals[2].aborted, true);
  while (answers.length < 4) await new Promise((resolve) => setImmediate(resolve));
  answers[3]();
  assert.equal((await next).cache, "miss");
});

test("letters are charged only for new requests, and a refused charge frees the account", async () => {
  const now = Date.UTC(2026, 10, 2, 10);
  const service = new SpeechService(() => now);
  const transport = (async () => wav()) as typeof fetch;
  let charged = 0;
  const guard = {
    blockMs: 10_000,
    cooldownMs: 0,
    charge: async () => {
      charged++;
    },
  };
  await service.get("a", input, config, transport, guard);
  // A cached replay is free.
  assert.equal((await service.get("a", input, config, transport, guard)).cache, "hit");
  assert.equal(charged, 1);

  const refused = {
    ...guard,
    charge: async () => {
      throw new FeedbackUnavailable("limited");
    },
  };
  await assert.rejects(
    service.get("a", { ...input, text: "Please" }, config, transport, refused),
    (e: FeedbackUnavailable) => e.reason === "limited",
  );
  // Nothing is left in flight: the next request isn't refused as busy.
  assert.equal(
    (await service.get("a", { ...input, text: "Please" }, config, transport, guard)).cache,
    "miss",
  );
});

test("the same clip clicked again after the block replaces a stuck request", async () => {
  let now = Date.UTC(2026, 10, 2, 10);
  const service = new SpeechService(() => now);
  const signals: AbortSignal[] = [];
  const answers: (() => void)[] = [];
  const transport = (async (_url: string, init: RequestInit) => {
    signals.push(init.signal!);
    await new Promise<void>((resolve, reject) => {
      answers.push(resolve);
      init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
    });
    return wav();
  }) as unknown as typeof fetch;
  const guard = { blockMs: 10_000, cooldownMs: 0 };
  // Both end aborted; the checks are attached now, before that happens.
  const stuck = assert.rejects(
    service.get("a", input, config, transport, guard),
    FeedbackUnavailable,
  );
  while (!answers.length) await new Promise((resolve) => setImmediate(resolve));
  // Within the block, the same clip shares the request in flight.
  now += 5_000;
  const shared = assert.rejects(
    service.get("a", input, config, transport, guard),
    FeedbackUnavailable,
  );
  // After it, the same clip starts a new request and the stuck one is aborted.
  now += 5_000;
  const fresh = service.get("a", input, config, transport, guard);
  while (answers.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signals[0].aborted, true);
  await stuck;
  await shared;
  answers[1]();
  assert.equal((await fresh).cache, "miss");
  // The finished request is the one cached, not removed by the abandoned one.
  assert.equal((await service.get("a", input, config, transport, guard)).cache, "hit");
});
