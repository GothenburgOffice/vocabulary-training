import type { z } from "zod";
import {
  languageCreateSchema,
  languageOrderSchema,
  languageUpdateSchema,
} from "../../../../lib/admin/ai-settings";
import { requireAdmin } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import {
  addLanguage,
  readLanguagesView,
  reorderLanguages,
  updateLanguage,
} from "../../../../lib/server/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Languages are added, edited, hidden and reordered, never deleted or renamed: saved lists
// refer to them by name.
async function parse<T>(request: Request, schema: z.ZodType<T>) {
  requireOrigin(request);
  await requireAdmin();
  const parsed = schema.safeParse(await body(request, 32_768));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  return parsed.data;
}
const duplicateCode = (e: unknown) =>
  (e as { code?: string }).code === "23505"
    ? new HttpError(409, "Another language already uses that code.")
    : e;

export async function GET() {
  try {
    await requireAdmin();
    return json({ languages: await readLanguagesView() });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const { name, code } = await parse(request, languageCreateSchema);
    if (!(await addLanguage(name, code)))
      throw new HttpError(409, "That language or code already exists.");
    return json({ languages: await readLanguagesView() });
  } catch (e) {
    return fail(duplicateCode(e));
  }
}
export async function PUT(request: Request) {
  try {
    const language = await parse(request, languageUpdateSchema);
    if (!(await updateLanguage(language))) throw new HttpError(404, "Language not found.");
    return json({ languages: await readLanguagesView() });
  } catch (e) {
    return fail(duplicateCode(e));
  }
}
export async function PATCH(request: Request) {
  try {
    const { order } = await parse(request, languageOrderSchema);
    await reorderLanguages(order);
    return json({ languages: await readLanguagesView() });
  } catch (e) {
    return fail(e);
  }
}
