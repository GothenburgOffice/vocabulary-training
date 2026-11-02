import { z } from "zod";

export const REPORT_REASONS = {
  pronunciation: "Incorrect pronunciation",
  "language-accent": "Wrong language or accent",
  "garbled-audio": "Garbled or unclear audio",
  "incorrect-note": "Incorrect language note",
  other: "Other issue",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;
export type Activity = {
  id: string;
  kind: "speech" | "note";
  word: string;
  language: string;
  model: string;
  voice: string | null;
  tier: string;
  createdAt: string;
};
export type IssueReport = {
  id: string;
  reason: ReportReason;
  activity: Activity;
  createdAt: string;
};

export const reportRequestSchema = z
  .object({
    activityId: z.uuid(),
    reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  })
  .strict();
