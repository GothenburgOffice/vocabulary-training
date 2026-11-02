import { requireUser } from "../../../lib/server/auth";
import { fail, json } from "../../../lib/server/http";
import { loadWorkspace } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const { data } = await loadWorkspace(user.id);
    const response = json(data);
    response.headers.set(
      "Content-Disposition",
      'attachment; filename="vocabulary-training-export.json"',
    );
    return response;
  } catch (e) {
    return fail(e);
  }
}
