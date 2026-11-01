// Requesty settings per account tier (users.ai_tier), from the admin area. Each tier has
// its own key, so budgets and fallback routing are set on that key in Requesty. Plus
// settings left blank use the basic value. A feature without a key and a model is off.
import type { AiFeatures, Language } from "../languages";

export const AI_TIERS = ["basic", "plus"] as const;
export type AiTier = (typeof AI_TIERS)[number];
export type TierSettings = { apiKey: string; model: string };
export type SpeechSettings = { model: string; voice: string; instructions: string };
export type LanguageSettings = Language & { speech: SpeechSettings; plusSpeech: SpeechSettings };
export type AiSettings = { basic: TierSettings; plus: TierSettings; languages: LanguageSettings[] };

export const NO_SPEECH: SpeechSettings = { model: "", voice: "", instructions: "" };
export const EMPTY_AI_SETTINGS: AiSettings = {
  basic: { apiKey: "", model: "" },
  plus: { apiKey: "", model: "" },
  languages: [],
};

export function aiConfig(tier: string | undefined, settings: AiSettings) {
  const plus = tier === "plus";
  const apiKey = (plus && settings.plus.apiKey) || settings.basic.apiKey;
  const languageNoteModel = (plus && settings.plus.model) || settings.basic.model;
  // Plus accounts get the plus model with its voice and instructions; without a plus model,
  // the three basic settings. No model at all means no speech for that language.
  const speech = (language: string): SpeechSettings | null => {
    const entry = settings.languages.find((l) => l.name === language);
    if (!entry || !apiKey) return null;
    const chosen = plus && entry.plusSpeech.model ? entry.plusSpeech : entry.speech;
    return chosen.model ? chosen : null;
  };
  const languageNotes = Boolean(apiKey && languageNoteModel);
  const features: AiFeatures = {
    languageNotes,
    speech: settings.languages.filter((l) => speech(l.name)).map((l) => l.name),
  };
  return {
    tier: plus ? "plus" : "basic",
    apiKey,
    languageNoteModel,
    languageNotes,
    speech,
    features,
  };
}
