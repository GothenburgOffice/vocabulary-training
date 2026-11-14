import {
  REPORT_RETENTION_DAYS,
  REPORTS_PAGE_SIZE,
  reportListQuerySchema,
  reportPruneSchema,
} from "@/lib/admin/reports";
import { adminRead, adminWrite } from "@/lib/server/route";
import { HttpError, json } from "@/lib/server/http";
import { countReports, listReports, pruneReports } from "@/lib/server/reports-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI results learners reported (#95): newest first or by a column, a page at a time, and how
// many are old enough to prune. No grouping or analysis: the owner wants the plain list for now.
export const GET = adminRead(async ({ request }) => {
  const parsed = reportListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const [reports, total, prunable] = await Promise.all([
    listReports(REPORTS_PAGE_SIZE, parsed.data),
    countReports(),
    countReports(REPORT_RETENTION_DAYS),
  ]);
  return json({
    reports,
    total,
    prunable,
    retentionDays: REPORT_RETENTION_DAYS,
    pageSize: REPORTS_PAGE_SIZE,
  });
});

// Deletes reports older than the retention period. Newer reports are never touched.
export const DELETE = adminWrite(
  { maxBytes: 1024, schema: reportPruneSchema },
  async ({ data }) => {
    return json({ deleted: await pruneReports(data.olderThanDays) });
  },
);
