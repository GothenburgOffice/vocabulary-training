import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { profileSchema } from "../../../lib/validation";
import { saveProfile } from "../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The native (base) and learning language the dashboard shows. Never changes lists.
export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = profileSchema.safeParse(await body(request, 1_000));
    if (!parsed.success) throw new HttpError(400, "Choose two different languages.");
    await saveProfile(user.id, parsed.data);
    return json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
