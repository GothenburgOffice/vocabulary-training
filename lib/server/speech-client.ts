import { createHash } from "node:crypto";
import { SPEECH_TIMEOUT_MS, type SpeechInput } from "../speech";
import { speechSchema } from "./speech-input";
import { FeedbackUnavailable } from "./requesty-client";

const endpoint = "https://router.requesty.ai/v1";
const MAX_AUDIO_BYTES = 4_000_000;
// Voice and instructions are optional: not every model accepts them, so they are sent only
// when set.
export type SpeechConfig = { apiKey: string; model: string; voice: string; instructions: string };
export type SpeechAudio = { bytes: Uint8Array; contentType: "audio/wav" };
type RequestLogger = (prompt: Record<string, unknown>) => Promise<void>;

function checkConfig(config: SpeechConfig) {
  if (
    !config.apiKey ||
    !config.model ||
    config.model.length > 200 ||
    config.model.startsWith("policy/") ||
    config.voice.length > 60 ||
    /[\u0000-\u001f\u007f]/u.test(config.voice) ||
    config.instructions.length > 2000 ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(config.instructions)
  ) {
    throw new FeedbackUnavailable("configuration");
  }
}

export async function requestSpeech(
  input: SpeechInput,
  config: SpeechConfig,
  transport: typeof fetch = fetch,
  // Aborts the request when a newer one from the account takes over (SpeechGate).
  abandon?: AbortSignal,
  logRequest?: RequestLogger,
): Promise<SpeechAudio> {
  if (!speechSchema.safeParse(input).success) throw new FeedbackUnavailable("configuration");
  checkConfig(config);
  const timeout = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
  const signal = abandon ? AbortSignal.any([timeout, abandon]) : timeout;
  const prompt = {
    model: config.model,
    ...(config.voice ? { voice: config.voice } : {}),
    ...(config.instructions ? { instructions: config.instructions } : {}),
    input: input.text,
    response_format: "wav",
  };
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    await logRequest?.(prompt);
    const response = await transport(`${endpoint}/audio/speech`, {
      method: "POST",
      headers,
      signal,
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(prompt),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) {
      await response.body?.cancel();
      throw new FeedbackUnavailable(response.status === 429 ? "limited" : "unavailable");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FeedbackUnavailable();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new FeedbackUnavailable();
      }
      parts.push(value);
    }
    const bytes = Buffer.concat(parts);
    // Providers have returned WAV bytes with incorrect MIME/format declarations.
    // Validate the actual container instead of trusting Content-Type.
    if (
      bytes.length < 44 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new FeedbackUnavailable();
    }
    return { bytes: new Uint8Array(bytes), contentType: "audio/wav" };
  } catch (error) {
    if (error instanceof FeedbackUnavailable) throw error;
    throw new FeedbackUnavailable();
  }
}

// How long a clip stays in memory; /privacy promises it, so expiry deletes it on a timer.
const CACHE_MS = 60 * 60_000;
// Private, bounded, one-process demo cache. Never persist words/audio to disk.
// One speech request at a time per account (#82), per server process: the app runs as one
// process, so that's per account. With several processes, each would keep its own turns (the
// letter budgets stay shared, in the database); a shared lease would be needed then. Another request while one is in flight is
// refused as "busy", so the first one plays instead of being dropped for the latest click,
// unless the first has waited `blockMs`: then it is abandoned (aborted, so it stops costing)
// and the new one goes ahead. A cooldown between requests catches scripted use.
export class SpeechGate {
  private running = new Map<string, { started: number; controller: AbortController }>();
  private last = new Map<string, number>();
  acquire(user: string, now: number, blockMs: number, cooldownMs: number) {
    const other = this.running.get(user);
    if (other && now - other.started < blockMs) throw new FeedbackUnavailable("busy");
    if (now < (this.last.get(user) ?? 0) + cooldownMs) throw new FeedbackUnavailable("limited");
    other?.controller.abort();
    // Forget old cooldowns so the map only holds recently active accounts.
    if (this.last.size > 1_000)
      for (const [id, at] of this.last) if (at + cooldownMs <= now) this.last.delete(id);
    const entry = { started: now, controller: new AbortController() };
    this.running.set(user, entry);
    this.last.set(user, now);
    return {
      signal: entry.controller.signal,
      release: () => {
        if (this.running.get(user) === entry) this.running.delete(user);
      },
    };
  }
}

// What a request may use, from the site's limits; `charge` records its letters or refuses it.
export type SpeechGuard = {
  blockMs: number;
  cooldownMs: number;
  charge?: () => Promise<void>;
  logRequest?: RequestLogger;
};
const NO_GUARD: SpeechGuard = { blockMs: 10_000, cooldownMs: 500 };

// Account scope prevents another user from retrieving a cached private word.
export class SpeechService {
  private entries = new Map<string, { audio: SpeechAudio; expires: number }>();
  // Requests in flight, with when they started: a duplicate shares one while it is younger than
  // the block, and replaces it after (a request that stuck).
  private pending = new Map<string, { task: Promise<SpeechAudio>; started: number }>();
  private bytes = 0;
  private gate = new SpeechGate();
  constructor(
    private readonly clock: () => number = Date.now,
    private readonly maxEntries = 128,
    private readonly maxBytes = 16_000_000,
    // Runs a deletion later without keeping the process alive.
    private readonly schedule: (run: () => void, ms: number) => void = (run, ms) => {
      setTimeout(run, ms).unref();
    },
  ) {}
  // Removes a clip if it's still the one stored under its key.
  private drop(key: string, entry: { audio: SpeechAudio; expires: number }) {
    if (this.entries.get(key) !== entry) return;
    this.bytes -= entry.audio.bytes.byteLength;
    this.entries.delete(key);
  }

  async get(
    user: string,
    input: SpeechInput,
    config: SpeechConfig,
    transport: typeof fetch = fetch,
    guard: SpeechGuard = NO_GUARD,
  ) {
    checkConfig(config);
    if (!user || user.length > 256 || !speechSchema.safeParse(input).success)
      throw new FeedbackUnavailable("configuration");
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          user,
          config.model,
          config.voice,
          config.instructions,
          input.language,
          input.text,
        ]),
      )
      .digest("hex");
    const now = this.clock();
    const existing = this.entries.get(key);
    if (existing && existing.expires > now) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return { ...existing.audio, cache: "hit" as const };
    }
    const running = this.pending.get(key);
    if (running && now - running.started < guard.blockMs)
      return { ...(await running.task), cache: "hit" as const };
    if (existing) {
      this.bytes -= existing.audio.bytes.byteLength;
      this.entries.delete(key);
    }
    // Replays and cached clips cost nothing; only a new request takes the account's turn and
    // its letters. It's registered as pending at once, so a duplicate arriving while the
    // letters are charged shares it instead of being refused as busy.
    const turn = this.gate.acquire(user, now, guard.blockMs, guard.cooldownMs);
    const task = (async () => {
      await guard.charge?.();
      return requestSpeech(input, config, transport, turn.signal, guard.logRequest);
    })()
      .then((audio) => {
        const entry = { audio, expires: this.clock() + CACHE_MS };
        this.entries.set(key, entry);
        this.bytes += audio.bytes.byteLength;
        // Deleted at expiry even if nobody asks for it again.
        this.schedule(() => this.drop(key, entry), CACHE_MS);
        while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
          const oldest = this.entries.keys().next().value;
          if (!oldest) break;
          this.bytes -= this.entries.get(oldest)!.audio.bytes.byteLength;
          this.entries.delete(oldest);
        }
        return audio;
      })
      .finally(() => {
        // A newer request may have replaced this one under the same key.
        if (this.pending.get(key)?.task === task) this.pending.delete(key);
        turn.release();
      });
    this.pending.set(key, { task, started: now });
    return { ...(await task), cache: "miss" as const };
  }
}
