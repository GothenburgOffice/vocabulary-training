import { monitorUpdateSchema } from "@/lib/admin/ai-settings";
import { requireAdmin } from "@/lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "@/lib/server/http";
import { checkMonitorKey, invalidateUsage } from "@/lib/server/requesty-manage";
import { readAiSettingsView, saveMonitor } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The read-only Requesty management key (#121). A new key is stored only after Requesty
// reports it as manage: read, completions: none. The response is the AI settings view, which
// shows only whether the key is set and its last four characters.
export async function PUT(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const parsed = monitorUpdateSchema.safeParse(await body(request, 4096));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    if (parsed.data.apiKey) await checkMonitorKey(parsed.data.apiKey);
    await saveMonitor(parsed.data);
    invalidateUsage();
    return json(await readAiSettingsView());
  } catch (e) {
    return fail(e);
  }
}
