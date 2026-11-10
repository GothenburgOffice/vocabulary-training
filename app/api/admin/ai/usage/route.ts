import { requireAdmin } from "../../../../../lib/server/auth";
import { fail, json } from "../../../../../lib/server/http";
import { cachedUsage } from "../../../../../lib/server/requesty-manage";
import { readMonitor } from "../../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Requesty balance, this app's keys and its usage (#121), read with the monitor key and
// cached for a minute. Without a readable monitor key: { configured: false }.
export async function GET() {
  try {
    await requireAdmin();
    const { apiKey, appLabel } = await readMonitor();
    if (!apiKey) return json({ configured: false });
    return json(await cachedUsage(apiKey, appLabel));
  } catch (e) {
    return fail(e);
  }
}
