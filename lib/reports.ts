// What a learner can report about a recent AI result (#95). Shared by the browser, which builds
// the report, and the server, which checks it. Pure: no server imports.
import { z } from "zod";
import type { AiAction, AiActionKind } from "./ai-actions";

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
    word: z.string().min(1).max(500),
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
    word: action.word,
    language: action.language,
    model: action.model,
    ...(action.voice !== undefined ? { voice: action.voice } : {}),
    prompt: action.prompt,
    at: action.at,
  };
}
