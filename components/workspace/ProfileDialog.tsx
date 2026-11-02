import { useState } from "react";
import { LogOut, Settings, Shield, UserRound } from "lucide-react";
import { pickerLanguages, type Language } from "../../lib/languages";
import type { WorkspaceAccount } from "../../lib/workspace";

// The account popup: who is signed in, links out, and the profile's base language.
export default function ProfileDialog({
  account,
  baseLanguage,
  languageList,
  practising,
  onSave,
}: {
  account?: WorkspaceAccount;
  baseLanguage: string;
  languageList: Language[];
  practising: boolean;
  // Applies a picked base language (and closes); throws an Error to show when it can't.
  onSave: (baseLanguage: string) => void;
}) {
  const [error, setError] = useState("");
  function pick(language: string) {
    try {
      onSave(language);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {account && (
        <div className="account-links">
          <span className="account-email" title={account.email}>
            {account.email}
          </span>
          <div className="inline-actions">
            {account.isAdmin && (
              <a className="text-button" href="/admin">
                <Settings size={15} /> Admin
              </a>
            )}
            <a className="text-button" href="/privacy">
              <Shield size={15} /> Privacy
            </a>
            <button className="text-button" disabled={account.busy} onClick={account.onSignOut}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
          {account.saveError && (
            <p className="error" role="alert">
              {account.saveError}
            </p>
          )}
        </div>
      )}
      <p>Set the native or base language you use for your word lists.</p>
      <label className="field">
        Native / base language
        <select
          aria-label="Native / base language"
          value={baseLanguage}
          disabled={practising}
          onChange={(e) => pick(e.target.value)}
        >
          {pickerLanguages(languageList, [baseLanguage]).map((l) => (
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
            account as you go. The sidebar shows whether everything is saved. CSV exports contain
            words, not your review history.
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
    </>
  );
}
