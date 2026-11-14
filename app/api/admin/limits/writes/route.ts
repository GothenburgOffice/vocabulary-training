import { DEFAULT_WRITE_LIMITS, writeLimitsSchema } from "@/lib/write-limits";
import { adminRead, adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import { readWriteLimits, saveWriteLimits } from "@/lib/server/write-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The write limit per account: the current values, and the defaults to reset to.
export const GET = adminRead(async () => {
  return json({ limits: await readWriteLimits(), defaults: DEFAULT_WRITE_LIMITS });
});
export const PUT = adminWrite({ maxBytes: 1_000, schema: writeLimitsSchema }, async ({ data }) => {
  await saveWriteLimits(data);
  return json({ limits: await readWriteLimits(), defaults: DEFAULT_WRITE_LIMITS });
});
