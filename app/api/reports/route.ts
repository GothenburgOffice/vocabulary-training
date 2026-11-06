import { ReportLimiter, reportSchema } from "../../../lib/reports";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { saveReport } from "../../../lib/server/reports-store";
import { limitWrites } from "../../../lib/server/write-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Per account, in this process (the app runs as one), like the other AI-related limits.
const limiter = new ReportLimiter();

// A one-way, anonymous report of one recent AI result (#95). Signing in is required to send
// one, but the account is not stored. Nothing is sent to an AI provider.
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    await limitWrites(user.id);
    const parsed = reportSchema.safeParse(await body(request, 24_000));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    if (!limiter.take(user.id, Date.now()))
      throw new HttpError(429, "That's a lot of reports in a short time. Try again later.");
    return json({ status: await saveReport(user.ai_tier, parsed.data) });
  } catch (error) {
    return fail(error);
  }
}
