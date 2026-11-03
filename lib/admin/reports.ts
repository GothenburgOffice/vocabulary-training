import { z } from "zod";

// Reports older than this are what an admin can prune (#81, #95).
export const REPORT_RETENTION_DAYS = 15;
export const REPORTS_PAGE_SIZE = 50;

// Where the next page starts: the last report shown, by date and id (keyset paging). Without
// both, the list starts at the newest report.
export const reportListQuerySchema = z
  .object({
    beforeOn: z.iso.date().optional(),
    beforeId: z.string().uuid().optional(),
  })
  .refine((query) => (query.beforeOn === undefined) === (query.beforeId === undefined), {
    message: "A page needs both beforeOn and beforeId.",
  });
export type ReportCursor = { on: string; id: string };

export function reportCursor(query: z.infer<typeof reportListQuerySchema>) {
  return query.beforeOn && query.beforeId ? { on: query.beforeOn, id: query.beforeId } : undefined;
}

// The prune names its cutoff explicitly, and only the retention period is accepted, so a
// request can never delete newer reports.
export const reportPruneSchema = z
  .object({ olderThanDays: z.literal(REPORT_RETENTION_DAYS) })
  .strict();
