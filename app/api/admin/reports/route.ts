import { pruneReports, readReports } from "../../../../lib/server/activity-reports";
import { requireAdmin } from "../../../../lib/server/auth";
import { fail, json, requireOrigin } from "../../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return json({ reports: await readReports() });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    return json({ deleted: await pruneReports() });
  } catch (error) {
    return fail(error);
  }
}
