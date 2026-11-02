import { reportSchema } from "../../../lib/reports";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { saveReport } from "../../../lib/server/reports-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A learner reports one of their recent AI results. Nothing is sent to an AI provider (#95).
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = reportSchema.safeParse(await body(request, 24_000));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    return json({ status: await saveReport(user, parsed.data) });
  } catch (error) {
    return fail(error);
  }
}
