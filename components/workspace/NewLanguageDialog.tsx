// Picking a language opens its workspace at once.
export default function NewLanguageDialog({
  baseLanguage,
  choices,
  onOpen,
}: {
  baseLanguage: string;
  // Languages without lists from this base yet.
  choices: string[];
  onOpen: (language: string) => void;
}) {
  return (
    <>
      <p>
        Choose a language to learn from {baseLanguage}. It stays in your menu once you save your
        first list for this pair.
      </p>
      <label className="field">
        New learning language
        <select
          aria-label="New learning language"
          value=""
          onChange={(e) => e.target.value && onOpen(e.target.value)}
        >
          <option value="" disabled>
            Choose a language…
          </option>
          {choices.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <p>No list is created yet, and your other language pairs stay unchanged.</p>
    </>
  );
}
