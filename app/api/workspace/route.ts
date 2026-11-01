import { requireUser } from "../../../lib/server/auth";
import { aiConfig } from "../../../lib/server/ai-config";
import { loadAiSettings } from "../../../lib/server/site-settings";
import { fail, json } from "../../../lib/server/http";
import { loadWorkspace } from "../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The full user data dump. Changes are saved through the small endpoints: lists/[id],
// reviews, runs and profile.
export async function GET() {
  try {
    const user = await requireUser();
    const { data, listRevisions } = await loadWorkspace(user.id);
    const settings = await loadAiSettings();
    // The language list (names, CSV codes, hidden flags) and which AI features this
    // account can use. Never keys or model settings.
    const languages = settings.languages.map(({ name, code, hidden }) => ({ name, code, hidden }));
    return json({
      user,
      data,
      listRevisions,
      languages,
      ai: aiConfig(user.ai_tier, settings).features,
    });
  } catch (e) {
    return fail(e);
  }
}
