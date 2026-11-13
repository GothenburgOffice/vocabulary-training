import { monitorCreateSchema } from "@/lib/admin/ai-settings";
import { adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import type { MonitorCreated } from "@/lib/admin/ai-settings";
import { createMonitorKey, invalidateUsage, labelTierKeys } from "@/lib/server/requesty-manage";
import { readMonitor, storedTierKeys } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step one of setting up the monitor key (#121): create a read-only key (manage: read,
// completions: none) in Requesty with an admin key typed on the page. The admin key is used
// for this one request and never stored or logged. The new key comes back once, for the admin
// to copy and then save with PUT /api/admin/ai/monitor, which checks its permissions.
// With labelTiers, the same admin key then labels the saved tier keys (app and tier), so usage
// can be told apart; a labelling problem is reported without losing the new key.
export const POST = adminWrite(
  { maxBytes: 4096, schema: monitorCreateSchema },
  async ({ data }) => {
    const { adminKey, name, labelTiers } = data;
    const apiKey = await createMonitorKey(adminKey, name);
    const created: MonitorCreated = { apiKey, labelled: [], problems: [] };
    if (labelTiers) {
      const { appLabel } = await readMonitor();
      Object.assign(created, await labelTierKeys(adminKey, await storedTierKeys(), appLabel));
      invalidateUsage();
    }
    return json(created);
  },
);
