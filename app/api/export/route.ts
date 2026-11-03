import { requireUser } from "../../../lib/server/auth";
import { HttpError, fail } from "../../../lib/server/http";
import { loadAccountRecords, loadWorkspace } from "../../../lib/server/workspace-store";
import { exportDocument, exportFileName } from "../../../lib/export";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in account's full data as a JSON download (#10). A read, so no origin check;
// the session cookie is SameSite=strict.
export async function GET() {
  try {
    const user = await requireUser();
    const { data } = await loadWorkspace(user.id);
    const records = await loadAccountRecords(user.id);
    if (!records) throw new HttpError(404, "Account not found.");
    const now = new Date();
    const body = JSON.stringify(
      exportDocument(records.account, data, records.aiUsage, now),
      null,
      2,
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
