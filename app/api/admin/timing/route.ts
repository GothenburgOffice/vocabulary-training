import { DEFAULT_TIMING, timingSettingsSchema } from "@/lib/timing";
import { adminRead, adminWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
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
export const GET = adminRead(async () => {
  return json(await view());
});
// Saves every setting at once. The cutoffs apply to answers measured from the next page load.
export const PUT = adminWrite(
  { maxBytes: 1_000, schema: timingSettingsSchema },
  async ({ data }) => {
    await saveTimingSettings(data);
    return json(await view());
  },
);
