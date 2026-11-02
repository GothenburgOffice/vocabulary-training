import { z } from "zod";
import { requireUser } from "../../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../../lib/server/http";
import { listDeleteSchema, listSaveSchema } from "../../../../lib/validation";
import { deleteList, saveList } from "../../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
async function listId({ params }: Params) {
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!id.success) throw new HttpError(404, "List not found.");
  return id.data;
}
// Creates (revision null) or replaces a list with its words.
export async function PUT(request: Request, context: Params) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const id = await listId(context);
    const parsed = listSaveSchema.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "This list contains invalid or excessive data. Check word lengths, the list size and the language pair.",
      );
    return json(await saveList(user.id, id, parsed.data));
  } catch (e) {
    return fail(e);
  }
}
// Deletes a list for good, if it is still the revision the client last saw.
export async function DELETE(request: Request, context: Params) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const id = await listId(context);
    const parsed = listDeleteSchema.safeParse(await body(request));
    if (!parsed.success) throw new HttpError(400, "A list revision is required.");
    await deleteList(user.id, id, parsed.data.revision);
    return json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
