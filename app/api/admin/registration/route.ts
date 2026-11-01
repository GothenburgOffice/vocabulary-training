import { registrationBlockers, registrationUpdateSchema } from "../../../../lib/admin/registration";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { readRegistration, saveRegistration } from "../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return json(await readRegistration());
  } catch (e) {
    return fail(e);
  }
}
// Registration can only be switched on once its checklist is complete for the values saved.
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = registrationUpdateSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const blockers = registrationBlockers(parsed.data, process.env.APP_ORIGIN ?? "");
    if (parsed.data.open && blockers.length)
      throw new HttpError(400, `Registration can't open yet. ${blockers.join(" ")}`);
    await saveRegistration(parsed.data);
    return json(await readRegistration());
  } catch (e) {
    return fail(e);
  }
}
