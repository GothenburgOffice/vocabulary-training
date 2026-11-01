import { privacyReady, privacyUpdateSchema } from "../../../../lib/admin/privacy";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { readPrivacy, savePrivacy } from "../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function view() {
  const privacy = await readPrivacy();
  return { ...privacy, ready: privacyReady(privacy) };
}

export async function GET() {
  try {
    await requireAdmin();
    return json(await view());
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = privacyUpdateSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    await savePrivacy(parsed.data);
    return json(await view());
  } catch (e) {
    return fail(e);
  }
}
