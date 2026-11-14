import { languageCreateSchema, languageUpdateSchema } from "@/lib/admin/ai-settings";
import { HttpError, json } from "@/lib/server/http";
import { adminRead, adminWrite } from "@/lib/server/route";
import { addLanguage, readLanguagesView, updateLanguage } from "@/lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Languages are added, edited and hidden, never deleted or renamed: saved lists refer to them
// by name. They are listed highlighted first, then by name.
const duplicateCode = (e: unknown) =>
  (e as { code?: string }).code === "23505"
    ? new HttpError(409, "Another language already uses that code.")
    : e;

export const GET = adminRead(async () => json({ languages: await readLanguagesView() }));
export const POST = adminWrite(
  { maxBytes: 32_768, schema: languageCreateSchema },
  async ({ data: { name, code } }) => {
    try {
      if (!(await addLanguage(name, code)))
        throw new HttpError(409, "That language or code already exists.");
      return json({ languages: await readLanguagesView() });
    } catch (e) {
      throw duplicateCode(e);
    }
  },
);
export const PUT = adminWrite(
  { maxBytes: 32_768, schema: languageUpdateSchema },
  async ({ data: language }) => {
    try {
      const result = await updateLanguage(language);
      if (result === "missing") throw new HttpError(404, "Language not found.");
      if (result === "stale")
        throw new HttpError(409, "This language changed in another tab. Reload to see it.");
      return json({ languages: await readLanguagesView() });
    } catch (e) {
      throw duplicateCode(e);
    }
  },
);
