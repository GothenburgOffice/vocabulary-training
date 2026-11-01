import { tierUpdateSchema } from "../../../../lib/admin/ai-settings";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { readAiSettingsView, saveTier } from "../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keys are write-only here: GET reports whether one is set and its last four characters.
export async function GET() {
  try {
    await requireAdmin();
    return json(await readAiSettingsView());
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = tierUpdateSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { tier, ...update } = parsed.data;
    await saveTier(tier, update);
    return json(await readAiSettingsView());
  } catch (e) {
    return fail(e);
  }
}
