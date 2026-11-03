// What a learner can report about a recent AI result (#95). Shared by the browser, which builds
// the report, and the server, which checks it. Pure: no server imports.
import { z } from "zod";
import type { AiAction, AiActionKind } from "./ai-actions";
import { MAX_SPEECH_TEXT } from "./ai-words";

export const REPORT_REASON_LABELS = {
  pronunciation: "Wrong pronunciation",
  "language-accent": "Wrong language or accent",
  "garbled-audio": "Garbled or cut-off audio",
  "incorrect-note": "Wrong or misleading note",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASON_LABELS;

// Only the reasons that make sense for each kind of result.
export const REASONS_FOR_KIND: Record<AiActionKind, readonly ReportReason[]> = {
  speech: ["pronunciation", "language-accent", "garbled-audio", "other"],
  note: ["incorrect-note", "other"],
};

// The stored request is bounded; a longer one is refused rather than truncated.
export const MAX_REPORT_PROMPT_CHARS = 16_000;

export const reportSchema = z
  .object({
    activityId: z.string().min(1).max(64),
    kind: z.enum(["speech", "note"]),
    reason: z.enum(Object.keys(REPORT_REASON_LABELS) as [ReportReason, ...ReportReason[]]),
    // An audio result can read every accepted answer, up to MAX_SPEECH_TEXT.
    word: z.string().min(1).max(MAX_SPEECH_TEXT),
    language: z.string().min(1).max(60),
    model: z.string().min(1).max(200),
    voice: z.string().max(60).optional(),
    prompt: z
      .record(z.string(), z.unknown())
      .refine((prompt) => JSON.stringify(prompt).length <= MAX_REPORT_PROMPT_CHARS, {
        message: "The AI request is too large to report.",
      }),
    at: z.iso.datetime(),
  })
  .strict()
  .refine((report) => REASONS_FOR_KIND[report.kind].includes(report.reason), {
    message: "That reason does not apply to this result.",
    path: ["reason"],
  });

export type ReportInput = z.infer<typeof reportSchema>;

// The report the browser sends for one of its recent results. Only the fields the server keeps.
export function reportFromAction(action: AiAction, reason: ReportReason) {
  return {
    activityId: action.id,
    kind: action.kind,
    reason,
    // The text on screen can be longer than what was read aloud; keep what fits.
    word: action.word.slice(0, MAX_SPEECH_TEXT),
    language: action.language,
    model: action.model,
    ...(action.voice !== undefined ? { voice: action.voice } : {}),
    prompt: action.prompt,
    at: action.at,
  };
}

// How many reports one account may send per hour. The account is only counted, in the server
// process, never stored with a report.
export const REPORTS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

export class ReportLimiter {
  private sent = new Map<string, number[]>();
  constructor(
    private readonly max = REPORTS_PER_HOUR,
    private readonly windowMs = HOUR_MS,
  ) {}

  // Counts one report for the account, or returns false when the hour's allowance is used up.
  take(account: string, now: number) {
    const recent = (this.sent.get(account) ?? []).filter((at) => at > now - this.windowMs);
    if (recent.length >= this.max) {
      this.sent.set(account, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(account, recent);
    // Forget accounts whose reports have all left the window, so the map stays small.
    if (this.sent.size > 1000)
      for (const [key, times] of this.sent)
        if (times.every((at) => at <= now - this.windowMs)) this.sent.delete(key);
    return true;
  }
}
