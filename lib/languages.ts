// Languages come from the admin-edited `languages` table. Lists store the language name as
// text, so a language is never removed, only hidden from the pickers for new choices.
export type Language = { name: string; code: string; hidden: boolean; highlighted: boolean };
// Built in, always last, never in the table and never spoken.
export const OTHER_LANGUAGE = "Other";
// The seed list of migration 004, used until the server's list has loaded.
export const DEFAULT_LANGUAGES: Language[] = [
  { name: "English", code: "en" },
  { name: "French", code: "fr" },
  { name: "German", code: "de" },
  { name: "Italian", code: "it" },
  { name: "Japanese", code: "ja" },
  { name: "Mandarin", code: "zh" },
  { name: "Spanish", code: "es" },
  { name: "Swedish", code: "sv" },
].map((l) => ({ ...l, hidden: false, highlighted: false }));

// The order of languages everywhere: highlighted ones first, then the rest, each by name.
// Names the list doesn't know (only in saved lists) sort among the rest; Other comes last.
export function sortLanguageNames(names: string[], languages: Language[]) {
  const highlighted = new Set(languages.filter((l) => l.highlighted).map((l) => l.name));
  const rank = (name: string) => (name === OTHER_LANGUAGE ? 2 : highlighted.has(name) ? 0 : 1);
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// Which AI features this account can use: language notes, and speech per language name.
export type AiFeatures = { languageNotes: boolean; speech: string[] };
export const NO_AI: AiFeatures = { languageNotes: false, speech: [] };

// Picker options: visible languages, then Other, then any language the user already has
// (`keep`), so a hidden language stays selectable where it is already in use.
export function pickerLanguages(languages: Language[], keep: string[] = []) {
  const visible = languages.filter((l) => !l.hidden).map((l) => l.name);
  return [
    ...new Set([...sortLanguageNames(visible, languages), OTHER_LANGUAGE, ...keep.filter(Boolean)]),
  ];
}

// CSV headers may use codes such as "sv" instead of names.
export function languageCodes(languages: Language[]): Record<string, string> {
  return Object.fromEntries(
    languages.filter((l) => l.code).map((l) => [l.code.toLowerCase(), l.name]),
  );
}
