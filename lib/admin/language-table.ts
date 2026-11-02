// The admin language table's editing rules (#73): which fields can be set on many languages at
// once, and which edited rows differ from what the server has.
import type { LanguageView, Speech } from "./ai-settings";

export const BULK_FIELDS = [
  { key: "speech.model", label: "Speech model" },
  { key: "speech.voice", label: "Speech voice" },
  { key: "speech.instructions", label: "Speech instructions" },
  { key: "plusSpeech.model", label: "Plus speech model" },
  { key: "plusSpeech.voice", label: "Plus speech voice" },
  { key: "plusSpeech.instructions", label: "Plus speech instructions" },
  { key: "highlighted", label: "Highlighted" },
  { key: "hidden", label: "Hidden" },
] as const;
export type BulkField = (typeof BULK_FIELDS)[number]["key"];

// The yes/no fields; their value is "yes" or "no".
export const isFlag = (field: BulkField) => field === "highlighted" || field === "hidden";

// The language with one field set.
export function withField(language: LanguageView, field: BulkField, value: string): LanguageView {
  if (field === "highlighted" || field === "hidden")
    return { ...language, [field]: value === "yes" };
  const [tier, key] = field.split(".") as ["speech" | "plusSpeech", keyof Speech];
  return { ...language, [tier]: { ...language[tier], [key]: value } };
}

// Edits are compared without the revision, which only says which version they were made from.
export const sameLanguage = (a: LanguageView, b: LanguageView) =>
  JSON.stringify({ ...a, revision: "" }) === JSON.stringify({ ...b, revision: "" });

// The edited rows that differ from the server's. Each keeps the revision it was edited from,
// so a row changed elsewhere since then gets 409 instead of overwriting that change.
export function changedLanguages(
  languages: LanguageView[],
  drafts: Record<string, LanguageView>,
): LanguageView[] {
  return languages.flatMap((language) => {
    const draft = drafts[language.name];
    return draft && !sameLanguage(draft, language) ? [draft] : [];
  });
}
