import { feedbackSchema } from "../../../lib/server/feedback-input";
import { shouldRequestFeedback } from "../../../lib/feedback";
import { requireUser } from "../../../lib/server/auth";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { aiConfig } from "../../../lib/server/ai-config";
import {
  FeedbackLimiter,
  FeedbackNotNeeded,
  FeedbackUnavailable,
  requestLanguageComment,
} from "../../../lib/server/requesty-client";

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
    const config = aiConfig(user.ai_tier);
    if (!config.apiKey)
      return json({ status: "disabled", message: "AI comments are not enabled on this server." });
    release = limits.acquire(user.id);
    const comment = await requestLanguageComment(parsed.data, {
      apiKey: config.apiKey,
      model: config.model,
    });
    return json({ status: "ready", comment });
  } catch (error) {
    if (error instanceof FeedbackNotNeeded) return json({ status: "not-needed" });
    if (error instanceof FeedbackUnavailable) {
      return json({
        status: error.reason === "limited" ? "limited" : "unavailable",
        message:
          error.reason === "limited"
            ? "AI comments have reached a usage limit. Keep practising as usual."
            : "AI comment unavailable. Your practice score is unchanged.",
      });
    }
    return fail(error);
  } finally {
    release?.();
  }
}
