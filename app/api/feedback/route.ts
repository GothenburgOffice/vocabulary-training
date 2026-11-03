import { letterCount, noteInput } from "../../../lib/ai-words";
import { shouldRequestFeedback } from "../../../lib/feedback";
import { requireUser } from "../../../lib/server/auth";
import { aiConfig } from "../../../lib/server/ai-config";
import { chargeLetters, readLimits } from "../../../lib/server/ai-limits";
import { feedbackRequestSchema } from "../../../lib/server/feedback-input";
import { body, fail, HttpError, json, requireOrigin } from "../../../lib/server/http";
import { loadAiSettings } from "../../../lib/server/site-settings";
import {
  checkFeedbackConfig,
  FeedbackLimiter,
  FeedbackNotNeeded,
  FeedbackUnavailable,
  languageCommentRequest,
  requestLanguageComment,
} from "../../../lib/server/requesty-client";
import { readWordForAi } from "../../../lib/server/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limits = new FeedbackLimiter();

// A language note on a wrong answer to one of the account's words. The word, its answers and
// the grade come from the database; only the typed answer comes from the client (#82).
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = feedbackRequestSchema.safeParse(await body(request, 4_000));
    if (!parsed.success) throw new HttpError(400, "This language-note request is invalid.");
    const word = await readWordForAi(user.id, parsed.data.wordId);
    if (!word) throw new HttpError(404, "Word not found.");
    const input = noteInput(word, parsed.data);
    if (!shouldRequestFeedback(input)) return json({ status: "not-needed" });
    const config = aiConfig(user.ai_tier, await loadAiSettings(), user.ai_enabled);
    if (!config.languageNotes)
      return json({
        status: "disabled",
        message: user.ai_enabled
          ? "AI comments are not enabled on this server."
          : "AI features are turned off in your profile.",
      });
    const provider = { apiKey: config.apiKey, model: config.languageNoteModel };
    // Before the charge: letters count only for a call that can reach the provider.
    checkFeedbackConfig(provider);
    const siteLimits = await readLimits();
    release = limits.acquire(user.id, Date.now(), siteLimits.note.cooldownMs);
    await chargeLetters(
      user,
      "note",
      letterCount(input.source, input.reference, ...(input.accepted ?? []), input.answer),
      siteLimits,
    );
    const comment = await requestLanguageComment(input, provider);
    // The learner's client keeps this for reporting (#95); it is the request that was sent.
    const activity = { model: provider.model, prompt: languageCommentRequest(input, provider) };
    return json({ status: "ready", comment, activity });
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
