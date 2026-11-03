import {
  REPORT_RETENTION_DAYS,
  REPORTS_PAGE_SIZE,
  reportListQuerySchema,
  reportPruneSchema,
} from "../../../../lib/admin/reports";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { countReports, listReports, pruneReports } from "../../../../lib/server/reports-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI results learners reported (#95): newest first or by a column, a page at a time, and how
// many are old enough to prune. No grouping or analysis: the owner wants the plain list for now.
export async function GET(request: Request) {
  try {
    await requireAdmin();
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
  } catch (e) {
    return fail(e);
  }
}

// Deletes reports older than the retention period. Newer reports are never touched.
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = reportPruneSchema.safeParse(await body(request, 1024));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    return json({ deleted: await pruneReports(parsed.data.olderThanDays) });
  } catch (e) {
    return fail(e);
  }
}
