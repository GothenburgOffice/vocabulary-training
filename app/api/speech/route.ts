import { requireUser } from "../../../lib/server/auth";
import { aiConfig } from "../../../lib/server/ai-config";
import { body, fail, json, requireOrigin } from "../../../lib/server/http";
import { FeedbackUnavailable } from "../../../lib/server/requesty-client";
import { SpeechService } from "../../../lib/server/speech-client";
import { speechSchema } from "../../../lib/server/speech-input";

export const runtime = "nodejs";
const speech = new SpeechService();

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = speechSchema.safeParse(await body(request, 2_000));
    if (!parsed.success) return json({ status: "invalid" }, 400);
    const config = aiConfig(user.ai_tier);
    if (!config.apiKey) return json({ status: "disabled" }, 503);
    const result = await speech.get(user.id, parsed.data, {
      apiKey: config.apiKey,
      model: config.speechModel,
      voice: config.speechVoice,
    });
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Audio-Cache": result.cache,
      },
    });
  } catch (error) {
    if (error instanceof FeedbackUnavailable)
      return json(
        { status: error.reason === "limited" ? "limited" : "unavailable" },
        error.reason === "limited" ? 429 : 503,
      );
    return fail(error);
  }
}
