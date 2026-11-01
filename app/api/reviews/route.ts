import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { reviewSchema } from "../../../lib/validation";
import { recordReview } from "../../../lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One checked answer. Grading happens in the client; scheduling happens here, in
// deterministic code with the server's clock.
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = reviewSchema.safeParse(await body(request, 1_000));
    if (!parsed.success) throw new HttpError(400, "Invalid review.");
    return json({ history: await recordReview(user.id, parsed.data) });
  } catch (e) {
    return fail(e);
  }
}
