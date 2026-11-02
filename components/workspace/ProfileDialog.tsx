import { useState } from "react";
import { Check, UserRound } from "lucide-react";
import { pickerLanguages, type Language } from "../../lib/languages";
import Button from "./Button";

export default function ProfileDialog({
  baseLanguage,
  languageList,
  practising,
  onSave,
}: {
  baseLanguage: string;
  languageList: Language[];
  practising: boolean;
  // Throws an Error to show when the base language can't change.
  onSave: (baseLanguage: string) => void;
}) {
  const [profileBase, setProfileBase] = useState(baseLanguage);
  const [error, setError] = useState("");
  function save() {
    try {
      onSave(profileBase);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <p>Set the native or base language you use for your word lists.</p>
      <label className="field">
        Native / base language
        <select
          aria-label="Native / base language"
          value={profileBase}
          disabled={practising}
          onChange={(e) => setProfileBase(e.target.value)}
        >
          {pickerLanguages(languageList, [baseLanguage, profileBase]).map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <p>
        Your dashboard shows lists and progress for this base language and the learning language you
        select. Changing your base language does not translate, relabel or delete existing lists.
      </p>
      <div className="account-future">
        <UserRound size={24} />
        <div>
          <strong>Your personal workspace</strong>
          <p>
            Lists, profile settings, review progress and completed sessions are saved to your
            account. Check the account bar for save status. CSV exports contain words, not your
            review history.
          </p>
        </div>
      </div>
      {practising && (
        <p className="error">End your practice session before changing your base language.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button primary onClick={save} disabled={practising}>
        Save profile <Check size={16} />
      </Button>
    </>
  );
}
