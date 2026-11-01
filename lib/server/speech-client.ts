import { createHash } from "node:crypto";
import { SPEECH_TIMEOUT_MS, type SpeechInput } from "../speech";
import { speechSchema } from "./speech-input";
import { FeedbackLimiter, FeedbackUnavailable } from "./requesty-client";

const endpoint = "https://router.requesty.ai/v1";
const MAX_AUDIO_BYTES = 4_000_000;
// Voice and instructions are optional: not every model accepts them, so they are sent only
// when set.
export type SpeechConfig = { apiKey: string; model: string; voice: string; instructions: string };
export type SpeechAudio = { bytes: Uint8Array; contentType: "audio/wav" };

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
): Promise<SpeechAudio> {
  if (!speechSchema.safeParse(input).success) throw new FeedbackUnavailable("configuration");
  checkConfig(config);
  const signal = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    const response = await transport(`${endpoint}/audio/speech`, {
      method: "POST",
      headers,
      signal,
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify({
        model: config.model,
        ...(config.voice ? { voice: config.voice } : {}),
        ...(config.instructions ? { instructions: config.instructions } : {}),
        input: input.text,
        response_format: "wav",
      }),
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
// Account scope prevents another user from retrieving a cached private word.
export class SpeechService {
  private entries = new Map<string, { audio: SpeechAudio; expires: number }>();
  private pending = new Map<string, Promise<SpeechAudio>>();
  private bytes = 0;
  private limiter = new FeedbackLimiter(500, 2);
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
    if (running) return { ...(await running), cache: "hit" as const };
    if (existing) {
      this.bytes -= existing.audio.bytes.byteLength;
      this.entries.delete(key);
    }
    const release = this.limiter.acquire(user, now);
    const task = requestSpeech(input, config, transport)
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
        this.pending.delete(key);
        release();
      });
    this.pending.set(key, task);
    return { ...(await task), cache: "miss" as const };
  }
}
