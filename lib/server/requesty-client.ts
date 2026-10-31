// Imported only by the server route. Explicit configuration and transport keep
// unit tests independent of real credentials and external calls.
import { boundedComment, feedbackMessages, FEEDBACK_TIMEOUT_MS, shouldRequestFeedback, type FeedbackInput } from "../feedback";

const endpoint = "https://router.requesty.ai/v1";
export const DEFAULT_FEEDBACK_MODEL = "novita/ling-3.1-flash";
export class FeedbackUnavailable extends Error {
  constructor(public reason: "unavailable" | "limited" | "configuration" = "unavailable") { super(reason); }
}
export class FeedbackNotNeeded extends Error {
  constructor() { super("Feedback is not needed for an accepted or empty answer."); }
}
type Config = { apiKey: string; model: string; allowPaid: boolean; timeoutMs?: number };
type Fetcher = typeof fetch;

export async function readRequestyJSON(response: Response, max: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new FeedbackUnavailable(response.status === 429 ? "limited" : "unavailable");
  }
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel(); throw new FeedbackUnavailable();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new FeedbackUnavailable();
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new FeedbackUnavailable(); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new FeedbackUnavailable(); }
}

export function isZeroPricedModel(catalog: unknown, id: string): boolean {
  if (!catalog || typeof catalog !== "object" || !("data" in catalog) || !Array.isArray(catalog.data)) return false;
  const matches = catalog.data.filter((item: unknown) => item && typeof item === "object" && "id" in item && item.id === id);
  if (matches.length !== 1) return false;
  const model = matches[0];
  // Fail closed for aliases, policies, absent pricing or unknown pricing schemes.
  if (!model || !Array.isArray(model.pricing) || !model.pricing.length || model.id.startsWith("policy/")) return false;
  return model.pricing.every((band: Record<string, unknown>) =>
    band && typeof band === "object" && band.input_price === 0 && band.output_price === 0 &&
    Object.entries(band).every(([key, value]) =>
      key === "prompt_tokens_threshold" ? typeof value === "number" && Number.isFinite(value) && value >= 0 :
      key === "pricing_scheme" ? value === "token" : /price|cost/.test(key) && value === 0) &&
    (!band.pricing_scheme || band.pricing_scheme === "token"));
}

export function isFreeOnlyPolicyCatalog(catalog: unknown): boolean {
  if (!catalog || typeof catalog !== "object" || !("data" in catalog) || !Array.isArray(catalog.data) || !catalog.data.length) return false;
  const ids = catalog.data.map((model: unknown) => model && typeof model === "object" && "id" in model ? model.id : null);
  if (new Set(ids).size !== ids.length) return false;
  // Authenticated /models includes unpriced policy aliases as well as concrete
  // chat models. Aliases are routing metadata, not pricing evidence.
  // Require a dedicated, free-only Access List so even an edited/nested policy
  // cannot route to a paid model through the key. Never trust a policy's name.
  const concrete = ids.filter((id): id is string => typeof id === "string" && !id.startsWith("policy/"));
  return concrete.length > 0 &&
    ids.every(id => typeof id === "string" && id.length > 0) &&
    concrete.every(id => isZeroPricedModel(catalog, id));
}

export async function requestLanguageComment(input: FeedbackInput, config: Config, transport: Fetcher = fetch) {
  if (!shouldRequestFeedback(input)) throw new FeedbackNotNeeded();
  const policy = config.model.startsWith("policy/");
  const timeoutMs = config.timeoutMs ?? FEEDBACK_TIMEOUT_MS;
  if (!config.apiKey || !config.model || config.model.length > 200 ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180_000 ||
    (policy && !/^policy\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(config.model))) throw new FeedbackUnavailable("configuration");
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    if (!config.allowPaid) {
      const catalog = await readRequestyJSON(await transport(`${endpoint}/models`, { headers, signal, cache: "no-store", redirect: "error" }), 4_000_000);
      if (!(policy ? isFreeOnlyPolicyCatalog(catalog) : isZeroPricedModel(catalog, config.model))) throw new FeedbackUnavailable("configuration");
    }
    const result = await readRequestyJSON(await transport(`${endpoint}/chat/completions`, {
      method: "POST", headers, signal, redirect: "error", cache: "no-store",
      // Some free providers still spend tokens on reasoning at "none". The
      // visible comment has its own independent 240-character hard cap.
      body: JSON.stringify({ model: config.model, messages: feedbackMessages(input), max_tokens: 768, reasoning_effort: "none", temperature: .2, stream: false }),
    }), 16_000) as { choices?: { message?: { content?: unknown } }[] };
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new FeedbackUnavailable();
    const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    // Plain text avoids spending model effort on a display-only envelope.
    // Retain strict parsing when a provider returns a structured comment.
    if (/^[{[]/.test(text)) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).some(k => k !== "comment")) throw new FeedbackUnavailable();
      return boundedComment(parsed.comment);
    }
    return boundedComment(text);
  } catch (error) {
    if (error instanceof FeedbackUnavailable) throw error;
    // No raw upstream bodies, credentials, stack traces or answers in errors.
    throw new FeedbackUnavailable();
  }
}

// Per-process by design: this hobby deployment runs one Next.js process.
// Provider-side key/model/spend restrictions are the final account-wide guard.
export class FeedbackLimiter {
  constructor(private readonly userCooldownMs = 3_000) {}
  private day = "";
  private daily = 0;
  private minute = -1;
  private minuteCount = 0;
  private users = new Map<string, number>();
  private inFlight = 0;
  acquire(user: string, dailyLimit: number, now = Date.now()): () => void {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.daily = 0; this.users.clear(); }
    const minute = Math.floor(now / 60_000);
    if (minute !== this.minute) { this.minute = minute; this.minuteCount = 0; }
    if (this.daily >= dailyLimit || this.minuteCount >= 20 || this.inFlight >= 2 || now < (this.users.get(user) ?? 0)) throw new FeedbackUnavailable("limited");
    this.users.set(user, now + this.userCooldownMs); this.daily++; this.minuteCount++; this.inFlight++;
    let released = false;
    return () => { if (!released) { released = true; this.inFlight--; } };
  }
}
