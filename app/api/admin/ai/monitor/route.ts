import { monitorUpdateSchema } from "@/lib/admin/ai-settings";
import { adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import { checkMonitorKey, invalidateUsage } from "@/lib/server/requesty-manage";
import { readAiSettingsView, saveMonitor } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The read-only Requesty management key (#121). A new key is stored only after Requesty
// reports it as manage: read, completions: none. The response is the AI settings view, which
// shows only whether the key is set and its last four characters.
export const PUT = adminWrite({ maxBytes: 4096, schema: monitorUpdateSchema }, async ({ data }) => {
  if (data.apiKey) await checkMonitorKey(data.apiKey);
  await saveMonitor(data);
  invalidateUsage();
  return json(await readAiSettingsView());
});
