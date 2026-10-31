import { requireUser } from "../../../lib/server/auth";
import { body, fail, json, requireOrigin } from "../../../lib/server/http";
import { FeedbackUnavailable } from "../../../lib/server/requesty-client";
import {
  DEFAULT_SPEECH_MODEL,
  DEFAULT_SPEECH_VOICE,
  SpeechService,
} from "../../../lib/server/speech-client";
import { speechSchema } from "../../../lib/server/speech-input";

export const runtime = "nodejs";
const speech = new SpeechService();

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser();
    const parsed = speechSchema.safeParse(await body(request, 2_000));
    if (!parsed.success) return json({ status: "invalid" }, 400);
    if (!process.env.REQUESTY_API_KEY) return json({ status: "disabled" }, 503);
    const dailyLimit = Math.min(
      5000,
      Math.max(1, Number(process.env.REQUESTY_SPEECH_DAILY_LIMIT) || 200),
    );
    const result = await speech.get(
      user.id,
      parsed.data,
      {
        apiKey: process.env.REQUESTY_API_KEY,
        model: process.env.REQUESTY_SPEECH_MODEL || DEFAULT_SPEECH_MODEL,
        voice: process.env.REQUESTY_SPEECH_VOICE || DEFAULT_SPEECH_VOICE,
        allowPaid: process.env.REQUESTY_ALLOW_PAID_MODELS === "true",
      },
      dailyLimit,
    );
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
