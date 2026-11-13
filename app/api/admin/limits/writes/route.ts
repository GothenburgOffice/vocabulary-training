import { DEFAULT_WRITE_LIMITS, writeLimitsSchema } from "@/lib/write-limits";
import { requireAdmin } from "@/lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "@/lib/server/http";
import { readWriteLimits, saveWriteLimits } from "@/lib/server/write-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The write limit per account: the current values, and the defaults to reset to.
export async function GET() {
  try {
    await requireAdmin();
    return json({ limits: await readWriteLimits(), defaults: DEFAULT_WRITE_LIMITS });
  } catch (e) {
    return fail(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = writeLimitsSchema.safeParse(await body(request, 1_000));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    await saveWriteLimits(parsed.data);
    return json({ limits: await readWriteLimits(), defaults: DEFAULT_WRITE_LIMITS });
  } catch (e) {
    return fail(e);
  }
}
