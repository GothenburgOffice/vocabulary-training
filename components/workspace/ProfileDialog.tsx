import { useState } from "react";
import { Download, LogOut, Settings, Shield, UserRound } from "lucide-react";
import { pickerLanguages, type Language } from "../../lib/languages";
import type { WorkspaceAccount } from "../../lib/workspace";

// The account popup: who is signed in, links out, and the profile's base language.
export default function ProfileDialog({
  account,
  baseLanguage,
  languageList,
  locked,
  onSave,
}: {
  account?: WorkspaceAccount;
  baseLanguage: string;
  languageList: Language[];
  // Why the base language can't change right now, or "".
  locked: string;
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
            <a
              className="text-button"
              href="/api/export"
              aria-disabled={account.busy || account.save !== "saved"}
              tabIndex={account.busy || account.save !== "saved" ? -1 : undefined}
              onClick={(event) => {
                if (account.busy || account.save !== "saved") event.preventDefault();
              }}
            >
              <Download size={15} /> Download all data
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
          disabled={!!locked}
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
            Download a JSON copy of your saved lists, review progress and completed sessions. Save
            all changes first. CSV exports are still available for individual lists.
          </p>
        </div>
      </div>
      {locked && <p className="error">{locked}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
