import { z } from "zod";
import { requireUser } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { listSaveSchema } from "../../../../lib/validation";
import { saveList } from "../../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Creates (revision null) or replaces a list with its words.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const id = z
      .string()
      .uuid()
      .safeParse((await params).id);
    if (!id.success) throw new HttpError(404, "List not found.");
    const parsed = listSaveSchema.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "This list contains invalid or excessive data. Check word lengths, the list size and the language pair.",
      );
    return json(await saveList(user.id, id.data, parsed.data));
  } catch (e) {
    return fail(e);
  }
}
