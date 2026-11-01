// Requesty settings per account tier (users.ai_tier). Each tier has its own key, so
// budgets and fallback routing are set on that key in Requesty. Plus settings left blank use
// the basic value; without REQUESTY_PLUS_API_KEY, plus accounts use the basic tier.
import { DEFAULT_FEEDBACK_MODEL } from "./requesty-client";
import { DEFAULT_SPEECH_MODEL, DEFAULT_SPEECH_VOICE } from "./speech-client";

export const AI_TIERS = ["basic", "plus"] as const;
export type AiTier = (typeof AI_TIERS)[number];
export type AiConfig = {
  tier: AiTier;
  apiKey: string;
  model: string;
  speechModel: string;
  speechVoice: string;
};

export function aiConfig(
  tier: string | undefined,
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  const basic: AiConfig = {
    tier: "basic",
    apiKey: env.REQUESTY_API_KEY || "",
    model: env.REQUESTY_MODEL || DEFAULT_FEEDBACK_MODEL,
    speechModel: env.REQUESTY_SPEECH_MODEL || DEFAULT_SPEECH_MODEL,
    speechVoice: env.REQUESTY_SPEECH_VOICE || DEFAULT_SPEECH_VOICE,
  };
  if (tier !== "plus" || !env.REQUESTY_PLUS_API_KEY) return basic;
  return {
    tier: "plus",
    apiKey: env.REQUESTY_PLUS_API_KEY,
    model: env.REQUESTY_PLUS_MODEL || basic.model,
    speechModel: env.REQUESTY_PLUS_SPEECH_MODEL || basic.speechModel,
    speechVoice: env.REQUESTY_PLUS_SPEECH_VOICE || basic.speechVoice,
  };
}
