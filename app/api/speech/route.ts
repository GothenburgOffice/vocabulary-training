import { speechHeaders } from "../../../lib/ai-actions";
import { speechText } from "../../../lib/ai-words";
import { requireUser } from "../../../lib/server/auth";
import { aiConfig } from "../../../lib/server/ai-config";
import { chargeLetters, readLimits } from "../../../lib/server/ai-limits";
import { loadAiSettings } from "../../../lib/server/site-settings";
import { body, fail, json, requireOrigin } from "../../../lib/server/http";
import { FeedbackUnavailable } from "../../../lib/server/requesty-client";
import { SpeechService } from "../../../lib/server/speech-client";
import { speechRequestSchema } from "../../../lib/server/speech-input";
import { readWordForAi } from "../../../lib/server/workspace-store";
import { limitWrites } from "../../../lib/server/write-limits";

export const runtime = "nodejs";
const speech = new SpeechService();

// Reads one of the account's words aloud. The client names the word and which text of it;
// the text comes from the database (#82).
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    await limitWrites(user.id);
    const parsed = speechRequestSchema.safeParse(await body(request, 2_000));
    if (!parsed.success) return json({ status: "invalid" }, 400);
    const word = await readWordForAi(user.id, parsed.data.wordId);
    if (!word) return json({ status: "not-found" }, 404);
    const input = speechText(word, parsed.data.part);
    const config = aiConfig(user.ai_tier, await loadAiSettings(), user.ai_enabled);
    const settings = config.speech(input.language);
    if (!settings) return json({ status: "disabled" }, 503);
    const limits = await readLimits();
    const result = await speech.get(user.id, input, { apiKey: config.apiKey, ...settings }, fetch, {
      blockMs: limits.speechBlockMs,
      cooldownMs: limits.speech.cooldownMs,
      // Only a request that reaches the provider counts; cached clips are free.
      charge: () => chargeLetters(user, "speech", Array.from(input.text).length, limits),
    });
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Audio-Cache": result.cache,
        // Which model and voice read it, for the learner's own activity log (#95).
        ...speechHeaders(settings),
      },
    });
  } catch (error) {
    if (error instanceof FeedbackUnavailable) {
      const status = error.reason === "configuration" ? "unavailable" : error.reason;
      return json({ status }, status === "unavailable" ? 503 : 429);
    }
    return fail(error);
  }
}
