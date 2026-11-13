import { DEFAULT_LIMITS, limitsSchema } from "@/lib/ai-limits";
import { readLimits, saveLimits } from "@/lib/server/ai-limits";
import { requireAdmin } from "@/lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The AI abuse limits (#82): the current values, and the defaults to reset to.
export async function GET() {
  try {
    await requireAdmin();
    return json({ limits: await readLimits(), defaults: DEFAULT_LIMITS });
  } catch (e) {
    return fail(e);
  }
}
// Saves every limit at once. They apply to the next AI call.
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = limitsSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    await saveLimits(parsed.data);
    return json({ limits: await readLimits(), defaults: DEFAULT_LIMITS });
  } catch (e) {
    return fail(e);
  }
}
