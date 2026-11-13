import { DEFAULT_TIMING, timingSettingsSchema } from "@/lib/timing";
import { requireAdmin } from "@/lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "@/lib/server/http";
import {
  readTimingSettings,
  readTimingSummary,
  saveTimingSettings,
} from "@/lib/server/timing-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function view() {
  return {
    settings: await readTimingSettings(),
    defaults: DEFAULT_TIMING,
    summary: await readTimingSummary(),
  };
}
// Answer timing (#2): the settings, their defaults, and the site-wide counts to calibrate with.
export async function GET() {
  try {
    await requireAdmin();
    return json(await view());
  } catch (e) {
    return fail(e);
  }
}
// Saves every setting at once. The cutoffs apply to answers measured from the next page load.
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = timingSettingsSchema.safeParse(await body(request, 1_000));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    await saveTimingSettings(parsed.data);
    return json(await view());
  } catch (e) {
    return fail(e);
  }
}
