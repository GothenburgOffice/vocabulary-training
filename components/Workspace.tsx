"use client";
import { useContext, useEffect, useReducer, useRef, useState } from "react";
import { Check, ChevronDown, CircleHelp, X } from "lucide-react";
import { BookMark } from "../lib/brand";
import { encodeCSV, makeWord, reviewed, type List } from "../lib/learning";
import {
  DEFAULT_SETTINGS,
  NO_PRACTICE,
  grade,
  isLastWord,
  practiceQueue,
  practiceReducer,
  type PracticeSettings,
} from "../lib/practice";
import type { WorkspaceData, Run, WorkspaceSync } from "../lib/workspace";
import { DEFAULT_LANGUAGES, languageCodes, pickerLanguages, type Language } from "../lib/languages";
import { AiFeaturesContext } from "./AiFeatures";
import RequestyAttribution from "./RequestyAttribution";
import Dialog from "./workspace/Dialog";
import ExitDialog from "./workspace/ExitDialog";
import HelpDialog from "./workspace/HelpDialog";
import HistoryView from "./workspace/HistoryView";
import ImportDialog from "./workspace/ImportDialog";
import LibraryView from "./workspace/LibraryView";
import ListEditor from "./workspace/ListEditor";
import NewLanguageDialog from "./workspace/NewLanguageDialog";
import PracticeSession from "./workspace/PracticeSession";
import ProfileDialog from "./workspace/ProfileDialog";
import ResultsView from "./workspace/ResultsView";
import Sidebar from "./workspace/Sidebar";
import { useNow } from "./workspace/useNow";
import type { Modal, View } from "./workspace/views";

const DIALOG_TITLES: Record<Modal, string> = {
  account: "Your profile",
  language: "Make room for another language.",
  import: "Bring your words along.",
  exit: "Leave this practice session?",
  help: "A smarter mix, not a black box.",
};

// The signed-in app: holds the workspace state shared between views and reports each change
// to `sync`. The views and dialogs in ./workspace/ only render and report back.
export default function Workspace({
  initial,
  sync,
  languageList = DEFAULT_LANGUAGES,
}: {
  initial: WorkspaceData;
  // Receives each change to save. Without it (tests, previews), nothing is saved.
  sync?: WorkspaceSync;
  languageList?: Language[];
}) {
  // For the library's due counts; handlers read the clock when they run.
  const now = useNow();
  const ai = useContext(AiFeaturesContext);
  // Visible languages and Other; hidden ones only where already in use (added below).
  const languages = pickerLanguages(languageList);
  const codes = languageCodes(languageList);
  const [lists, setLists] = useState<List[]>(initial.lists);
  const [runs, setRuns] = useState<Run[]>(initial.runs ?? []);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [baseLanguage, setBaseLanguage] = useState(initial.baseLanguage ?? "Swedish");
  const [learningLanguage, setLearningLanguage] = useState(initial.learningLanguage ?? "French");
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [practice, dispatch] = useReducer(practiceReducer, NO_PRACTICE);
  // The list open in the editor, as it was when opened.
  const [editing, setEditing] = useState<List | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [nav, setNav] = useState(false);
  const [notice, setNotice] = useState("");
  // The id of the newest answer per word and direction (see check).
  const latestReview = useRef(new Map<string, string>());
  // The profile languages change in several places; save whenever the pair changes.
  const savedProfile = useRef(`${initial.baseLanguage}
${initial.learningLanguage}`);
  useEffect(() => {
    const profile = `${baseLanguage}
${learningLanguage}`;
    if (profile === savedProfile.current) return;
    savedProfile.current = profile;
    sync?.saveProfile(baseLanguage, learningLanguage);
  }, [baseLanguage, learningLanguage, sync]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 681px)");
    const close = () => setNav(false);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const savedLanguages = [
    ...new Set(
      lists.filter((l) => l.from === baseLanguage && l.to !== baseLanguage).map((l) => l.to),
    ),
  ].sort();
  const pairLists = lists.filter((l) => l.from === baseLanguage && l.to === learningLanguage);
  const pairRuns = runs.filter((r) => r.from === baseLanguage && r.to === learningLanguage);
  const list = pairLists.find((l) => l.id === selected) || pairLists[0];
  const current = list?.words.find((w) => w.id === practice.queue[practice.index]);

  function navigate(next: View) {
    if (view === "test" && next !== "test") {
      setModal("exit");
      return;
    }
    setView(next);
    setNav(false);
    setNotice("");
  }
  function changeLearningLanguage(value: string) {
    if (value === "__add__") {
      setModal("language");
      return;
    }
    setLearningLanguage(value);
    setSelected("");
    setQuery("");
    setSettings((s) => ({ ...s, direction: "forward" }));
    setNotice("");
    setNav(false);
  }
  function saveProfile(profileBase: string) {
    if (view === "test")
      throw new Error("End your practice session before changing your base language.");
    if (profileBase !== baseLanguage) {
      const targets = [
        ...new Set(
          lists.filter((l) => l.from === profileBase && l.to !== profileBase).map((l) => l.to),
        ),
      ].sort();
      // With every language hidden only "Other" is offered, so fall back to hidden ones too.
      const nextLearning = targets.includes(learningLanguage)
        ? learningLanguage
        : targets[0] ||
          languages.find((l) => l !== profileBase) ||
          languageList.map((l) => l.name).find((l) => l !== profileBase);
      if (!nextLearning)
        throw new Error("There is no other language to learn with this base language yet.");
      setBaseLanguage(profileBase);
      setLearningLanguage(nextLearning);
      setSelected("");
      setQuery("");
      setSettings((s) => ({ ...s, direction: "forward" }));
      setView("library");
    }
    setModal(null);
    setNav(false);
    setNotice(
      "Profile updated. Existing lists have not been changed. See the account bar for save status.",
    );
  }
  function edit(target?: List) {
    setEditing(
      target
        ? structuredClone(target)
        : {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            from: baseLanguage,
            to: learningLanguage,
            words: [makeWord(), makeWord(), makeWord(), makeWord(), makeWord()],
          },
    );
    setView("editor");
    setNotice("");
  }
  function saveList(saved: List) {
    setLists((ls) =>
      ls.some((l) => l.id === saved.id)
        ? ls.map((l) => (l.id === saved.id ? saved : l))
        : [...ls, saved],
    );
    sync?.saveList(saved);
    setSelected(saved.id);
    setLearningLanguage(saved.to);
    setQuery("");
    setView("library");
    setNotice("List updated. See the account bar for save status.");
  }
  function startTest(onlyMistakes = false) {
    if (!list?.words.length) {
      setView("library");
      setNav(false);
      return;
    }
    const mistakes = onlyMistakes ? practice.results : undefined;
    dispatch({ type: "start", queue: practiceQueue(list.words, settings, Date.now(), mistakes) });
    setView("test");
    setNotice("");
    setNav(false);
  }
  function check(skipped: boolean) {
    if (!list || !current || practice.feedback || (!practice.answer.trim() && !skipped)) return;
    const { direction } = settings;
    const answeredAt = Date.now();
    const result = grade(current, practice.answer, skipped, settings, answeredAt);
    dispatch({ type: "check", result, skipped });
    setLists((ls) =>
      ls.map((l) =>
        l.id !== list.id
          ? l
          : {
              ...l,
              words: l.words.map((w) =>
                w.id !== current.id
                  ? w
                  : { ...w, [direction]: reviewed(w[direction], result.correct, answeredAt) },
              ),
            },
      ),
    );
    // Take the server's state once saved, so answers from other tabs show here too, unless a
    // later answer for the same word and direction is still on its way.
    const review = {
      id: crypto.randomUUID(),
      wordId: current.id,
      direction,
      correct: result.correct,
    };
    const key = `${review.wordId}:${direction}`;
    latestReview.current.set(key, review.id);
    void sync?.review(review).then((history) => {
      if (!history || latestReview.current.get(key) !== review.id) return;
      setLists((ls) =>
        ls.map((l) => ({
          ...l,
          words: l.words.map((w) => (w.id === review.wordId ? { ...w, [direction]: history } : w)),
        })),
      );
    });
  }
  function next() {
    if (!list) return;
    if (!isLastWord(practice)) {
      dispatch({ type: "next" });
      return;
    }
    const run: Run = {
      id: crypto.randomUUID(),
      completedAt: Date.now(),
      listId: list.id,
      mode: settings.mode,
      title: list.title,
      from: list.from,
      to: list.to,
      results: practice.results,
    };
    setRuns((r) => [run, ...r].slice(0, 200));
    sync?.completeRun(run);
    setView("results");
  }
  function exportList() {
    if (!list) return;
    const blob = new Blob(["﻿" + encodeCSV(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${list.title.toLowerCase().replace(/\s+/g, "-")}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("CSV exported. It includes language names and word pairs, not review history.");
  }
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Sidebar
        open={nav}
        view={view}
        baseLanguage={baseLanguage}
        learningLanguage={learningLanguage}
        savedLanguages={savedLanguages}
        listCount={pairLists.length}
        runCount={pairRuns.length}
        onClose={() => setNav(false)}
        onLanguage={changeLearningLanguage}
        onProfile={() => setModal("account")}
        onNavigate={navigate}
        onPractice={() => (view === "test" ? setNav(false) : startTest())}
        onHelp={() => setModal("help")}
      />
      <header className="mobile-bar">
        <span className="mobile-wordmark">
          <BookMark size={20} aria-hidden="true" />
          <strong>
            vocabulary<span>.training</span>
          </strong>
        </span>
        <button className="button" onClick={() => setNav(!nav)} aria-expanded={nav}>
          Menu <ChevronDown size={16} />
        </button>
      </header>
      <main id="content">
        {view === "library" && (
          <LibraryView
            baseLanguage={baseLanguage}
            learningLanguage={learningLanguage}
            lists={pairLists}
            list={list}
            query={query}
            now={now}
            settings={settings}
            onQuery={setQuery}
            onSelect={setSelected}
            onEdit={edit}
            onImport={() => setModal("import")}
            onExport={exportList}
            onSettings={(change) => setSettings((s) => ({ ...s, ...change }))}
            onStart={() => startTest()}
          />
        )}
        {view === "editor" && editing && (
          <ListEditor
            key={editing.id}
            initial={editing}
            isNew={!lists.some((l) => l.id === editing.id)}
            listCount={lists.length}
            baseLanguage={baseLanguage}
            languages={languages}
            onSave={saveList}
            onCancel={() => navigate("library")}
          />
        )}
        {view === "test" && list && current && (
          <PracticeSession
            list={list}
            word={current}
            practice={practice}
            settings={settings}
            baseLanguage={baseLanguage}
            onAnswer={(answer) => dispatch({ type: "type", answer })}
            onCheck={check}
            onNext={next}
            onEnd={() => setModal("exit")}
          />
        )}
        {view === "results" && list && (
          <ResultsView
            title={list.title}
            results={practice.results}
            onBack={() => navigate("library")}
            onPractise={startTest}
          />
        )}
        {view === "history" && (
          <HistoryView
            baseLanguage={baseLanguage}
            learningLanguage={learningLanguage}
            runs={pairRuns}
            onStart={list ? () => startTest() : undefined}
            onBrowse={() => navigate("library")}
          />
        )}
        {notice && (
          <div role="status" className="notice">
            <Check size={16} />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="workspace-footer">
          <div className="footer-overview">
            <span>Built around your words.</span>
            <button onClick={() => setModal("help")}>
              Simple review statistics. <CircleHelp size={13} />
            </button>
          </div>
          {(ai.languageNotes || ai.speech.length > 0) && <RequestyAttribution />}
        </footer>
      </main>
      <Dialog title={modal && DIALOG_TITLES[modal]} onClose={() => setModal(null)}>
        {modal === "account" && (
          <ProfileDialog
            baseLanguage={baseLanguage}
            languageList={languageList}
            practising={view === "test"}
            onSave={saveProfile}
          />
        )}
        {modal === "language" && (
          <NewLanguageDialog
            baseLanguage={baseLanguage}
            choices={languages.filter((l) => l !== baseLanguage && !savedLanguages.includes(l))}
            onOpen={(language) => {
              changeLearningLanguage(language);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
        {modal === "import" && (
          <ImportDialog
            baseLanguage={baseLanguage}
            codes={codes}
            onImport={(draft) => {
              setEditing(draft);
              setView("editor");
              setModal(null);
            }}
          />
        )}
        {modal === "help" && (
          <HelpDialog speech={ai.speech.length > 0} onClose={() => setModal(null)} />
        )}
        {modal === "exit" && (
          <ExitDialog
            onStay={() => setModal(null)}
            onLeave={() => {
              setModal(null);
              setView("library");
              setNav(false);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
