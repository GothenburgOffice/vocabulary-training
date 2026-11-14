import { ReportLimiter, reportSchema } from "@/lib/reports";
import { HttpError, json } from "@/lib/server/http";
import { saveReport } from "@/lib/server/reports-store";
import { userWrite } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Per account, in this process (the app runs as one), like the other AI-related limits.
const limiter = new ReportLimiter();

// A one-way, anonymous report of one recent AI result (#95). Signing in is required to send
// one, but the account is not stored. Nothing is sent to an AI provider.
export const POST = userWrite(
  { maxBytes: 24_000, schema: reportSchema },
  async ({ user, data }) => {
    if (!limiter.take(user.id, Date.now()))
      throw new HttpError(429, "That's a lot of reports in a short time. Try again later.");
    return json({ status: await saveReport(user.ai_tier, data) });
  },
);
