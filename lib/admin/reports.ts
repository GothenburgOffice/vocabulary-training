import { z } from "zod";

// Reports older than this are what an admin can prune (#81, #95).
export const REPORT_RETENTION_DAYS = 15;
export const REPORTS_PAGE_SIZE = 50;

// The list's sortable columns. Ties fall back to newest first.
export const REPORT_SORTS = [
  "reported",
  "activity",
  "kind",
  "reason",
  "word",
  "language",
  "model",
  "voice",
  "tier",
] as const;
export type ReportSort = (typeof REPORT_SORTS)[number];

// A page of the list in one order (newest first unless a heading was clicked), starting after
// the last report shown, or at the top.
export const reportListQuerySchema = z.object({
  sort: z.enum(REPORT_SORTS).default("reported"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  after: z.string().uuid().optional(),
});
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

// The prune names its cutoff explicitly, and only the retention period is accepted, so a
// request can never delete newer reports.
export const reportPruneSchema = z
  .object({ olderThanDays: z.literal(REPORT_RETENTION_DAYS) })
  .strict();
