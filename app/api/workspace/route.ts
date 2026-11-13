import { aiConfig } from "@/lib/server/ai-config";
import { loadAiSettings } from "@/lib/server/site-settings";
import { json } from "@/lib/server/http";
import { userRead } from "@/lib/server/route";
import { loadWorkspace } from "@/lib/server/workspace-store";
import { readTimingSettings } from "@/lib/server/timing-settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The full user data dump. Changes are saved through the small endpoints: lists/[id],
// reviews, runs and profile.
export const GET = userRead(async ({ user }) => {
  const { data, listRevisions } = await loadWorkspace(user.id);
  const settings = await loadAiSettings();
  // The language list (names, CSV codes, hidden and highlighted flags) and which AI
  // features the site offers this account. Never keys or model settings. The account's own
  // switch is data.aiEnabled; the workspace hides the features while it is off.
  const languages = settings.languages.map(({ name, code, hidden, highlighted }) => ({
    name,
    code,
    hidden,
    highlighted,
  }));
  return json({
    user,
    data,
    listRevisions,
    languages,
    ai: aiConfig(user.ai_tier, settings, user.ai_enabled).offered,
    // The pause cutoffs answer timing measures with (#2).
    timingCutoffs: (await readTimingSettings()).cutoffMs,
  });
});
