import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { runSaveSchema } from "../../../lib/validation";
import { addRun } from "../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A completed practice session.
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = runSaveSchema.safeParse(await body(request, 4_000_000));
    if (!parsed.success) throw new HttpError(400, "This session contains invalid data.");
    await addRun(user.id, parsed.data);
    return json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
