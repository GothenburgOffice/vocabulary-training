// Requesty settings per account tier (users.ai_tier), from the admin area. Each tier has
// its own key, so budgets and fallback routing are set on that key in Requesty. Plus
// settings left blank use the basic value. A feature without a key and a model is off, and
// so is every feature for an account that turned AI features off (users.ai_enabled, #113).
import { NO_AI, type AiFeatures, type Language } from "@/lib/languages";

type TierSettings = { apiKey: string; model: string };
export type SpeechSettings = { model: string; voice: string; instructions: string };
export type LanguageSettings = Language & { speech: SpeechSettings; plusSpeech: SpeechSettings };
export type AiSettings = { basic: TierSettings; plus: TierSettings; languages: LanguageSettings[] };

export const NO_SPEECH: SpeechSettings = { model: "", voice: "", instructions: "" };
export const EMPTY_AI_SETTINGS: AiSettings = {
  basic: { apiKey: "", model: "" },
  plus: { apiKey: "", model: "" },
  languages: [],
};

// `enabled` is the account's AI features switch. Every route that calls a provider goes
// through here, so none can skip it.
export function aiConfig(tier: string | undefined, settings: AiSettings, enabled: boolean) {
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
  // What the site offers this tier, whatever the account's switch says: the profile shows the
  // switch only when there is something to turn off.
  const offered: AiFeatures = {
    languageNotes,
    speech: settings.languages.filter((l) => speech(l.name)).map((l) => l.name),
  };
  if (!enabled)
    return {
      tier: plus ? "plus" : "basic",
      apiKey: "",
      languageNoteModel: "",
      languageNotes: false,
      speech: (): SpeechSettings | null => null,
      features: NO_AI,
      offered,
    };
  return {
    tier: plus ? "plus" : "basic",
    apiKey,
    languageNoteModel,
    languageNotes,
    speech,
    features: offered,
    offered,
  };
}
