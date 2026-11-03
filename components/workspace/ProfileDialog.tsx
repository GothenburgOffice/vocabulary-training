import { useState } from "react";
import { Download, LogOut, Settings, Shield, UserRound } from "lucide-react";
import { pickerLanguages, type Language } from "../../lib/languages";
import type { WorkspaceAccount } from "../../lib/workspace";
import { THEMES, THEME_LABELS, isTheme, type Theme } from "../../lib/theme";

// The account popup: who is signed in, links out, and the profile's base language.
export default function ProfileDialog({
  account,
  baseLanguage,
  languageList,
  locked,
  onSave,
  theme = "system",
  onTheme,
  aiEnabled = true,
  onAiEnabled,
}: {
  account?: WorkspaceAccount;
  baseLanguage: string;
  languageList: Language[];
  // Why the base language can't change right now, or "".
  locked: string;
  // Applies a picked base language (and closes); throws an Error to show when it can't.
  onSave: (baseLanguage: string) => void;
  // The Appearance setting, applied and saved as soon as it is picked.
  theme?: Theme;
  onTheme?: (theme: Theme) => void;
  // The AI features switch, saved as soon as it changes. Left out when the site offers no AI
  // features to this account.
  aiEnabled?: boolean;
  onAiEnabled?: (enabled: boolean) => void;
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
            <a className="text-button" href="/api/export" download>
              <Download size={15} /> Export my data
            </a>
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
      {onTheme && (
        <label className="field">
          Appearance
          <select
            aria-label="Appearance"
            value={theme}
            onChange={(e) => isTheme(e.target.value) && onTheme(e.target.value)}
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      {onAiEnabled && (
        <>
          <label className="profile-check">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => onAiEnabled(e.target.checked)}
            />
            Use AI features
          </label>
          <p>
            Language notes on wrong answers and word audio use an AI provider. Turned off, nothing
            of yours is sent to one, and that includes AI features added later.
          </p>
        </>
      )}
      <div className="account-future">
        <UserRound size={24} />
        <div>
          <strong>Your personal workspace</strong>
          <p>
            Lists, profile settings, review progress and completed sessions are saved to your
            account as you go. The sidebar shows whether everything is saved. A list&apos;s CSV
            export contains its words; Export my data downloads everything, review history and
            sessions included, as one JSON file.
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
