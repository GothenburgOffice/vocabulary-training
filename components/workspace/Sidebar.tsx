import Link from "next/link";
import { useContext } from "react";
import {
  ChevronRight,
  CircleHelp,
  FolderOpen,
  Flag,
  History as HistoryIcon,
  ListChecks,
  UserRound,
  X,
} from "lucide-react";
import { BookMark } from "../../lib/brand";
import type { SaveState } from "../../lib/workspace";
import { AiFeaturesContext } from "../AiFeatures";
import RequestyAttribution from "../RequestyAttribution";
import SaveStatus from "./SaveStatus";
import type { View } from "./views";

export default function Sidebar({
  open,
  view,
  baseLanguage,
  learningLanguage,
  savedLanguages,
  listCount,
  runCount,
  save,
  onClose,
  onHome,
  onLanguage,
  onProfile,
  onNavigate,
  onPractice,
  onHelp,
  onReport,
}: {
  open: boolean;
  view: View;
  baseLanguage: string;
  learningLanguage: string;
  // Learning languages with lists from this base language.
  savedLanguages: string[];
  listCount: number;
  runCount: number;
  // Absent without an account (tests, previews).
  save?: SaveState;
  onClose: () => void;
  onHome: () => void;
  // A language name, or "__add__" to add one.
  onLanguage: (value: string) => void;
  onProfile: () => void;
  onNavigate: (view: View) => void;
  onPractice: () => void;
  onHelp: () => void;
  onReport?: () => void;
}) {
  const ai = useContext(AiFeaturesContext);
  // The language pair only changes from the lists and history views.
  const locked = view !== "library" && view !== "history";
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <Link
          className="brand-home"
          href="/"
          prefetch={false}
          onClick={(e) => {
            e.preventDefault();
            onHome();
          }}
        >
          <BookMark size={23} aria-hidden="true" />
          <span className="wordmark">
            vocabulary<strong>.training</strong>
          </span>
        </Link>
        <button className="mobile-close icon-button" aria-label="Close menu" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <section className="sidebar-languages" aria-label="Active language pair">
        <label className="field">
          I’m learning
          <select
            aria-label="Learning language"
            value={learningLanguage}
            disabled={locked}
            onChange={(e) => onLanguage(e.target.value)}
          >
            {savedLanguages.map((l) => (
              <option key={l}>{l}</option>
            ))}
            {!savedLanguages.includes(learningLanguage) && (
              <option value={learningLanguage}>{learningLanguage} · no lists yet</option>
            )}
            <option value="__add__">＋ Add a language…</option>
          </select>
        </label>
        <p className="sidebar-base">
          from <strong>{baseLanguage}</strong>
          <button
            onClick={onProfile}
            aria-label={`Change base language (currently ${baseLanguage}) in profile`}
          >
            Change
          </button>
        </p>
        {locked && <small className="scope-lock">Return to your lists to switch language.</small>}
      </section>
      <nav aria-label="Main navigation">
        <button
          className={view === "library" || view === "editor" ? "active" : ""}
          onClick={() => onNavigate("library")}
        >
          <FolderOpen size={18} /> My word lists <span className="nav-count">{listCount}</span>
        </button>
        <button
          className={view === "test" || view === "results" ? "active" : ""}
          onClick={onPractice}
        >
          <ListChecks size={18} /> Practice
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => onNavigate("history")}
        >
          <HistoryIcon size={18} /> Session history{" "}
          <span className="nav-count">{runCount || ""}</span>
        </button>
      </nav>
      {save && <SaveStatus state={save} iconSize={18} />}
      <div className="side-bottom">
        {onReport && (
          <button onClick={onReport}>
            <Flag size={18} /> Report an issue
          </button>
        )}
        <button onClick={onHelp}>
          <CircleHelp size={18} /> How practice works
        </button>
        {(ai.languageNotes || ai.speech.length > 0) && <RequestyAttribution />}
        <button className="account-row" onClick={onProfile} aria-label="Open profile">
          <span className="avatar">
            <UserRound size={16} />
          </span>
          <span>
            Your account
            <small>Profile settings</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </div>
    </aside>
  );
}
