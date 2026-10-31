import { createHash } from "node:crypto";
import { SPEECH_TIMEOUT_MS, type SpeechInput } from "../speech";
import { speechSchema } from "./speech-input";
import { FeedbackLimiter, FeedbackUnavailable, readRequestyJSON } from "./requesty-client";

export const DEFAULT_SPEECH_MODEL = "deepinfra/XiaomiMiMo/MiMo-V2.5-tts";
export const DEFAULT_SPEECH_VOICE = "Mia";
const endpoint = "https://router.requesty.ai/v1";
const MAX_AUDIO_BYTES = 4_000_000;
export type SpeechConfig = { apiKey: string; model: string; voice: string; allowPaid: boolean };
export type SpeechAudio = { bytes: Uint8Array; contentType: "audio/wav" };

export function isZeroPricedSpeechModel(catalog: unknown, id: string): boolean {
  if (!catalog || typeof catalog !== "object" || !("data" in catalog) || !Array.isArray(catalog.data)) return false;
  const matches = catalog.data.filter((item: unknown) => item && typeof item === "object" && "id" in item && item.id === id);
  if (matches.length !== 1) return false;
  const pricing = matches[0].pricing;
  return !!pricing && !Array.isArray(pricing) && typeof pricing === "object" &&
    pricing.input_character === 0 &&
    Object.entries(pricing).every(([key, value]) =>
      ["input_character", "output_character", "input_token", "output_token"].includes(key) && value === 0);
}

function checkConfig(config: SpeechConfig) {
  if (!config.apiKey || !config.model || config.model.length > 200 || config.model.startsWith("policy/") ||
    !config.voice.trim() || config.voice.length > 60 || /[\u0000-\u001f\u007f]/u.test(config.voice)) {
    throw new FeedbackUnavailable("configuration");
  }
}

export async function requestSpeech(input: SpeechInput, config: SpeechConfig, transport: typeof fetch = fetch): Promise<SpeechAudio> {
  if (!speechSchema.safeParse(input).success) throw new FeedbackUnavailable("configuration");
  checkConfig(config);
  const signal = AbortSignal.timeout(SPEECH_TIMEOUT_MS);
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    if (!config.allowPaid) {
      const catalog = await readRequestyJSON(await transport(`${endpoint}/models/speech`, {
        headers, signal, cache: "no-store", redirect: "error",
      }), 4_000_000);
      if (!isZeroPricedSpeechModel(catalog, config.model)) throw new FeedbackUnavailable("configuration");
    }
    const response = await transport(`${endpoint}/audio/speech`, {
      method: "POST", headers, signal, cache: "no-store", redirect: "error",
      body: JSON.stringify({ model: config.model, voice: config.voice, input: input.text, response_format: "wav" }),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) {
      await response.body?.cancel();
      throw new FeedbackUnavailable(response.status === 429 ? "limited" : "unavailable");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FeedbackUnavailable();
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) { await reader.cancel(); throw new FeedbackUnavailable(); }
      parts.push(value);
    }
    const bytes = Buffer.concat(parts);
    // Providers have returned WAV bytes with incorrect MIME/format declarations.
    // Validate the actual container instead of trusting Content-Type.
    if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
      throw new FeedbackUnavailable();
    }
    return { bytes: new Uint8Array(bytes), contentType: "audio/wav" };
  } catch (error) {
    if (error instanceof FeedbackUnavailable) throw error;
    throw new FeedbackUnavailable();
  }
}

// Private, bounded, one-process demo cache. Never persist words/audio to disk.
// Account scope prevents another user from retrieving a cached private word.
export class SpeechService {
  private entries = new Map<string, { audio: SpeechAudio; expires: number }>();
  private pending = new Map<string, Promise<SpeechAudio>>();
  private bytes = 0;
  private limiter = new FeedbackLimiter(500);
  constructor(private readonly clock: () => number = Date.now, private readonly maxEntries = 128, private readonly maxBytes = 16_000_000) {}

  async get(user: string, input: SpeechInput, config: SpeechConfig, dailyLimit: number, transport: typeof fetch = fetch) {
    checkConfig(config);
    if (!user || user.length > 256 || !speechSchema.safeParse(input).success) throw new FeedbackUnavailable("configuration");
    const key = createHash("sha256").update(JSON.stringify([user, config.model, config.voice, input.language, input.text])).digest("hex");
    const now = this.clock();
    const existing = this.entries.get(key);
    if (existing && existing.expires > now) {
      this.entries.delete(key); this.entries.set(key, existing);
      return { ...existing.audio, cache: "hit" as const };
    }
    const running = this.pending.get(key);
    if (running) return { ...await running, cache: "hit" as const };
    if (existing) { this.bytes -= existing.audio.bytes.byteLength; this.entries.delete(key); }
    const release = this.limiter.acquire(user, dailyLimit, now);
    const task = requestSpeech(input, config, transport).then(audio => {
      this.entries.set(key, { audio, expires: this.clock() + 60 * 60_000 });
      this.bytes += audio.bytes.byteLength;
      while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
        const oldest = this.entries.keys().next().value;
        if (!oldest) break;
        this.bytes -= this.entries.get(oldest)!.audio.bytes.byteLength;
        this.entries.delete(oldest);
      }
      return audio;
    }).finally(() => { this.pending.delete(key); release(); });
    this.pending.set(key, task);
    return { ...await task, cache: "miss" as const };
  }
}
