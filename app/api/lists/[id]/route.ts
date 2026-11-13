import { z } from "zod";
import { HttpError, json } from "@/lib/server/http";
import { userWrite } from "@/lib/server/route";
import { listDeleteSchema, listSaveSchema } from "@/lib/validation";
import { deleteList, saveList } from "@/lib/server/workspace-store";
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
export const PUT = userWrite(
  {
    maxBytes: 2_000_000,
    schema: listSaveSchema,
    invalid:
      "This list contains invalid or excessive data. Check word lengths, the list size and the language pair.",
  },
  async ({ user, data }, context: Params) =>
    json(await saveList(user.id, await listId(context), data)),
);
// Deletes a list for good, if it is still the revision the client last saw.
export const DELETE = userWrite(
  { maxBytes: 2_000_000, schema: listDeleteSchema, invalid: "A list revision is required." },
  async ({ user, data }, context: Params) => {
    await deleteList(user.id, await listId(context), data.revision);
    return json({ deleted: true });
  },
);
