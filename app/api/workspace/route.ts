import { db } from "../../../lib/server/db";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { saveSchema } from "../../../lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireUser();
    const result = await db.query("SELECT data,revision FROM workspaces WHERE user_id=$1", [
      user.id,
    ]);
    if (!result.rowCount) throw new HttpError(404, "Workspace not found.");
    return json({ user, ...result.rows[0] });
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = saveSchema.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "This workspace contains invalid or excessive data. Check word lengths, list sizes and language pairs.",
      );
    const { data, revision } = parsed.data;
    const result = await db.query(
      "UPDATE workspaces SET data=$1,revision=revision+1,updated_at=now() WHERE user_id=$2 AND revision=$3 RETURNING revision",
      [data, user.id, revision],
    );
    if (!result.rowCount)
      throw new HttpError(
        409,
        "Another tab saved changes. Export any unsaved words, then reload this tab before editing again.",
      );
    return json({ revision: result.rows[0].revision });
  } catch (e) {
    return fail(e);
  }
}
