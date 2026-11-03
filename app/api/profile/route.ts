import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { profileSchema, themeSaveSchema } from "../../../lib/validation";
import { saveProfile, saveTheme } from "../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The native (base) and learning language the dashboard shows (never changes lists), or the
// Appearance setting on its own.
export async function PATCH(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const data = await body(request, 1_000);
    if (data && typeof data === "object" && "theme" in data) {
      const theme = themeSaveSchema.safeParse(data);
      if (!theme.success) throw new HttpError(400, "Choose system default, light or dark.");
      await saveTheme(user.id, theme.data.theme);
      return json({ saved: true });
    }
    const parsed = profileSchema.safeParse(data);
    if (!parsed.success) throw new HttpError(400, "Choose two different languages.");
    await saveProfile(user.id, parsed.data);
    return json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
