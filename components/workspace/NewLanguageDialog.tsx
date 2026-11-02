import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Button from "./Button";

export default function NewLanguageDialog({
  baseLanguage,
  choices,
  onOpen,
  onCancel,
}: {
  baseLanguage: string;
  // Languages without lists from this base yet.
  choices: string[];
  onOpen: (language: string) => void;
  onCancel: () => void;
}) {
  const [language, setLanguage] = useState(choices[0] || "German");
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
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {choices.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <p>No list is created yet, and your other language pairs stay unchanged.</p>
      <div className="inline-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button primary onClick={() => onOpen(language)}>
          Open language workspace <ArrowRight size={16} />
        </Button>
      </div>
    </>
  );
}
