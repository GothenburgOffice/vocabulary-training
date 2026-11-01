// Languages come from the admin-edited `languages` table. Lists store the language name as
// text, so a language is never removed, only hidden from the pickers for new choices.
export type Language = { name: string; code: string; hidden: boolean };
// Built in, always last, never in the table and never spoken.
export const OTHER_LANGUAGE = "Other";
// The seed list of migration 004, used until the server's list has loaded.
export const DEFAULT_LANGUAGES: Language[] = [
  { name: "Swedish", code: "sv", hidden: false },
  { name: "French", code: "fr", hidden: false },
  { name: "English", code: "en", hidden: false },
  { name: "Spanish", code: "es", hidden: false },
  { name: "German", code: "de", hidden: false },
  { name: "Italian", code: "it", hidden: false },
  { name: "Japanese", code: "ja", hidden: false },
];

// Which AI features this account can use: language notes, and speech per language name.
export type AiFeatures = { languageNotes: boolean; speech: string[] };
export const NO_AI: AiFeatures = { languageNotes: false, speech: [] };

// Picker options: visible languages, then Other, then any language the user already has
// (`keep`), so a hidden language stays selectable where it is already in use.
export function pickerLanguages(languages: Language[], keep: string[] = []) {
  const visible = languages.filter((l) => !l.hidden).map((l) => l.name);
  return [...new Set([...visible, OTHER_LANGUAGE, ...keep.filter(Boolean)])];
}

// CSV headers may use codes such as "sv" instead of names.
export function languageCodes(languages: Language[]): Record<string, string> {
  return Object.fromEntries(
    languages.filter((l) => l.code).map((l) => [l.code.toLowerCase(), l.name]),
  );
}
