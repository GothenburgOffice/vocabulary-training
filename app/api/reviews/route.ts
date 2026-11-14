import { userWrite } from "@/lib/server/route";
import { json } from "@/lib/server/http";
import { reviewSchema } from "@/lib/validation";
import { recordReview } from "@/lib/server/workspace-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One checked answer. Grading happens in the client; scheduling happens here, in
// deterministic code with the server's clock.
export const POST = userWrite(
  { maxBytes: 1_000, schema: reviewSchema, invalid: "Invalid review." },
  async ({ user, data }) => json({ history: await recordReview(user.id, data) }),
);
