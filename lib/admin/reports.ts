import { z } from "zod";

// Reports older than this are what an admin can prune (#81, #95).
export const REPORT_RETENTION_DAYS = 15;
export const REPORTS_PAGE_SIZE = 50;

export const reportListQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

// The prune names its cutoff explicitly, and only the retention period is accepted, so a
// request can never delete newer reports.
export const reportPruneSchema = z
  .object({ olderThanDays: z.literal(REPORT_RETENTION_DAYS) })
  .strict();
