import { tierUpdateSchema } from "@/lib/admin/ai-settings";
import { adminRead, adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import { readAiSettingsView, saveTier } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keys are write-only here: GET reports whether one is set and its last four characters.
export const GET = adminRead(async () => {
  return json(await readAiSettingsView());
});
export const PUT = adminWrite({ maxBytes: 4096, schema: tierUpdateSchema }, async ({ data }) => {
  const { tier, ...update } = data;
  await saveTier(tier, update);
  return json(await readAiSettingsView());
});
