// Imported only by the server route. Explicit configuration and transport keep
// unit tests independent of real credentials and external calls.
import {
  boundedComment,
  feedbackMessages,
  FEEDBACK_TIMEOUT_MS,
  shouldRequestFeedback,
  type FeedbackInput,
} from "../feedback";

const endpoint = "https://router.requesty.ai/v1";
export const DEFAULT_FEEDBACK_MODEL = "novita/ling-3.1-flash";
export class FeedbackUnavailable extends Error {
  constructor(public reason: "unavailable" | "limited" | "configuration" = "unavailable") {
    super(reason);
  }
}
export class FeedbackNotNeeded extends Error {
  constructor() {
    super("Feedback is not needed for an accepted or empty answer.");
  }
}
// Cost is controlled per key in Requesty (fallback policy, Access List, budget), not here.
type Config = { apiKey: string; model: string; timeoutMs?: number };
type Fetcher = typeof fetch;

export async function readRequestyJSON(response: Response, max: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new FeedbackUnavailable(response.status === 429 ? "limited" : "unavailable");
  }
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw new FeedbackUnavailable();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new FeedbackUnavailable();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new FeedbackUnavailable();
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new FeedbackUnavailable();
  }
}

export async function requestLanguageComment(
  input: FeedbackInput,
  config: Config,
  transport: Fetcher = fetch,
) {
  if (!shouldRequestFeedback(input)) throw new FeedbackNotNeeded();
  const policy = config.model.startsWith("policy/");
  const timeoutMs = config.timeoutMs ?? FEEDBACK_TIMEOUT_MS;
  if (
    !config.apiKey ||
    !config.model ||
    config.model.length > 200 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 180_000 ||
    (policy && !/^policy\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(config.model))
  )
    throw new FeedbackUnavailable("configuration");
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  try {
    const result = (await readRequestyJSON(
      await transport(`${endpoint}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        redirect: "error",
        cache: "no-store",
        // Some free providers still spend tokens on reasoning at "none". The
        // visible comment has its own independent 240-character hard cap.
        body: JSON.stringify({
          model: config.model,
          messages: feedbackMessages(input),
          max_tokens: 768,
          reasoning_effort: "none",
          temperature: 0.2,
          stream: false,
        }),
      }),
      16_000,
    )) as { choices?: { message?: { content?: unknown } }[] };
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new FeedbackUnavailable();
    const text = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    // Plain text avoids spending model effort on a display-only envelope.
    // Retain strict parsing when a provider returns a structured comment.
    if (/^[{[]/.test(text)) {
      const parsed = JSON.parse(text);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.keys(parsed).some((k) => k !== "comment")
      )
        throw new FeedbackUnavailable();
      return boundedComment(parsed.comment);
    }
    return boundedComment(text);
  } catch (error) {
    if (error instanceof FeedbackUnavailable) throw error;
    // No raw upstream bodies, credentials, stack traces or answers in errors.
    throw new FeedbackUnavailable();
  }
}

// Per-account guards only: a cooldown between requests and a cap on requests in
// flight. There are deliberately no server-wide quotas: each tier's Requesty key
// policy decides what happens when it runs out, and load shows up as load.
export class FeedbackLimiter {
  constructor(
    private readonly userCooldownMs = 3_000,
    private readonly maxInFlight = 1,
  ) {}
  private next = new Map<string, number>();
  private inFlight = new Map<string, number>();
  acquire(user: string, now = Date.now()): () => void {
    const running = this.inFlight.get(user) ?? 0;
    if (running >= this.maxInFlight || now < (this.next.get(user) ?? 0))
      throw new FeedbackUnavailable("limited");
    // Forget expired cooldowns so the map only holds recently active accounts.
    if (this.next.size > 1_000)
      for (const [id, until] of this.next) if (until <= now) this.next.delete(id);
    this.next.set(user, now + this.userCooldownMs);
    this.inFlight.set(user, running + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.inFlight.get(user) ?? 1) - 1;
      if (left) this.inFlight.set(user, left);
      else this.inFlight.delete(user);
    };
  }
}
