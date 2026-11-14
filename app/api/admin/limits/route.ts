import { DEFAULT_LIMITS, limitsSchema } from "@/lib/ai-limits";
import { readLimits, saveLimits } from "@/lib/server/ai-limits";
import { adminRead, adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The AI abuse limits (#82): the current values, and the defaults to reset to.
export const GET = adminRead(async () => {
  return json({ limits: await readLimits(), defaults: DEFAULT_LIMITS });
});
// Saves every limit at once. They apply to the next AI call.
export const PUT = adminWrite({ maxBytes: 4096, schema: limitsSchema }, async ({ data }) => {
  await saveLimits(data);
  return json({ limits: await readLimits(), defaults: DEFAULT_LIMITS });
});
