import { feedbackSchema } from "../../../lib/server/feedback-input";
import { shouldRequestFeedback } from "../../../lib/feedback";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { DEFAULT_FEEDBACK_MODEL, FeedbackLimiter, FeedbackNotNeeded, FeedbackUnavailable, requestLanguageComment } from "../../../lib/server/requesty-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limits = new FeedbackLimiter();

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = feedbackSchema.safeParse(await body(request, 5_000));
    if (!parsed.success) throw new HttpError(400, "This language-note request is invalid.");
    if (!shouldRequestFeedback(parsed.data)) return json({ status: "not-needed" });
    const apiKey = process.env.REQUESTY_API_KEY;
    if (!apiKey) return json({ status: "disabled", message: "AI comments are not enabled on this server." });
    const configured = Number(process.env.REQUESTY_DAILY_LIMIT || "200");
    const dailyLimit = Number.isInteger(configured) && configured >= 1 && configured <= 10_000 ? configured : 200;
    release = limits.acquire(user.id, dailyLimit);
    const comment = await requestLanguageComment(parsed.data, {
      apiKey,
      model: process.env.REQUESTY_MODEL || DEFAULT_FEEDBACK_MODEL,
      allowPaid: process.env.REQUESTY_ALLOW_PAID_MODELS === "true",
    });
    return json({ status: "ready", comment });
  } catch (error) {
    if (error instanceof FeedbackNotNeeded) return json({ status: "not-needed" });
    if (error instanceof FeedbackUnavailable) {
      return json({
        status: error.reason === "limited" ? "limited" : "unavailable",
        message: error.reason === "limited"
          ? "AI comments have reached a usage limit. Keep practising as usual."
          : "AI comment unavailable. Your practice score is unchanged.",
      });
    }
    return fail(error);
  } finally { release?.(); }
}
