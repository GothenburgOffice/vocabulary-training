"use client";
import Link from "next/link";
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, X } from "lucide-react";
import { BookMark } from "../lib/brand";
import { encodeCSV, listTitle, reviewed, type List } from "../lib/learning";
import {
  DEFAULT_SETTINGS,
  NO_PRACTICE,
  grade,
  isLastWord,
  practiceQueue,
  practiceReducer,
  readSettings,
  SETTINGS_KEY,
  type PracticeSettings,
} from "../lib/practice";
import type { WorkspaceAccount, WorkspaceData, Run, WorkspaceSync } from "../lib/workspace";
import {
  DEFAULT_LANGUAGES,
  NO_AI,
  languageCodes,
  pickerLanguages,
  sortLanguageNames,
  type Language,
} from "../lib/languages";
import { AiFeaturesContext } from "./AiFeatures";
import DeleteDialog from "./workspace/DeleteDialog";
import { useAiActionLog } from "./AiActionLog";
import Dialog from "./workspace/Dialog";
import ExitDialog from "./workspace/ExitDialog";
import HelpDialog from "./workspace/HelpDialog";
import HistoryView from "./workspace/HistoryView";
import LeaveDialog from "./workspace/LeaveDialog";
import ImportDialog from "./workspace/ImportDialog";
import LibraryView from "./workspace/LibraryView";
import ListEditor from "./workspace/ListEditor";
import NewLanguageDialog from "./workspace/NewLanguageDialog";
import PracticeSession from "./workspace/PracticeSession";
import ProfileDialog from "./workspace/ProfileDialog";
import ReportDialog from "./workspace/ReportDialog";
import ResultsView from "./workspace/ResultsView";
import SaveStatus from "./workspace/SaveStatus";
import Sidebar from "./workspace/Sidebar";
import { useNow } from "./workspace/useNow";
import type { Modal, View } from "./workspace/views";
import { applyTheme, type Theme } from "../lib/theme";

const DIALOG_TITLES: Record<Modal, string> = {
  account: "Your account",
  language: "Make room for another language.",
  import: "Bring your words along.",
  exit: "Leave this practice session?",
  delete: "Delete this word list?",
  leave: "Leave with unfinished edits?",
  help: "How practice works",
  report: "Report an AI result",
};

// The signed-in app: holds the workspace state shared between views and reports each change
// to `sync`. The views and dialogs in ./workspace/ only render and report back.
export default function Workspace({
  initial,
  sync,
  account,
  languageList = DEFAULT_LANGUAGES,
}: {
  initial: WorkspaceData;
  // Receives each change to save. Without it (tests, previews), nothing is saved.
  sync?: WorkspaceSync;
  account?: WorkspaceAccount;
  languageList?: Language[];
}) {
  // For the library's due counts; handlers read the clock when they run.
  const now = useNow();
  // What the site offers this account; while the account's AI switch is off (#113), the
  // workspace's views see no AI features at all.
  const offeredAi = useContext(AiFeaturesContext);
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled ?? true);
  const ai = aiEnabled ? offeredAi : NO_AI;
  const aiOffered = offeredAi.languageNotes || offeredAi.speech.length > 0;
  function chooseAiEnabled(next: boolean) {
    setAiEnabled(next);
    sync?.saveAiEnabled(next);
  }
  // Visible languages and Other; hidden ones only where already in use (added below).
  const languages = pickerLanguages(languageList);
  const codes = languageCodes(languageList);
  const [lists, setLists] = useState<List[]>(initial.lists);
  const [runs, setRuns] = useState<Run[]>(initial.runs ?? []);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  // Per list: how many 100-word pages of the library preview are open (0 = collapsed).
  const [previewPages, setPreviewPages] = useState<Record<string, number>>({});
  const [baseLanguage, setBaseLanguage] = useState(initial.baseLanguage ?? "Swedish");
  const [learningLanguage, setLearningLanguage] = useState(initial.learningLanguage ?? "French");
  // The Appearance setting: shown at once, saved with the account.
  const [theme, setTheme] = useState<Theme>(initial.theme ?? "system");
  // Before paint, so a change never shows a frame in the old scheme.
  useLayoutEffect(() => applyTheme(theme), [theme]);
  function chooseTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
    sync?.saveTheme(next);
  }
  // Remembered in this browser only (#67); private windows or blocked storage use the defaults.
  const [settings, setSettings] = useState<PracticeSettings>(() => {
    try {
      return readSettings(localStorage.getItem(SETTINGS_KEY));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);
  const [practice, dispatch] = useReducer(practiceReducer, NO_PRACTICE);
  // The list open in the editor, as it was when opened.
  const [editing, setEditing] = useState<List | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const { actions: aiActions } = useAiActionLog();
  // Whether leaving the list editor would lose edits, and where leaving it was headed.
  const [editorLost, setEditorLost] = useState<string[]>([]);
  // The editor's latest draft, so every way out of it (Done, the sidebar, the logo) shows it.
  const editorDraft = useRef<List | null>(null);
  // Lists being deleted: a save the editor still had waiting must not recreate them.
  const deletedIds = useRef(new Set<string>());
  const [leaving, setLeaving] = useState<{ to: View | "practice"; list?: List } | null>(null);
  // The list the delete dialog asks about.
  const [deleting, setDeleting] = useState<List | null>(null);
  const [nav, setNav] = useState(false);
  // A short message under the page; a warning when something didn't happen as asked.
  const [notice, setNotice] = useState<{ text: string; warning?: boolean } | null>(null);
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
  const savedLanguages = sortLanguageNames(
    [
      ...new Set(
        lists.filter((l) => l.from === baseLanguage && l.to !== baseLanguage).map((l) => l.to),
      ),
    ],
    languageList,
  );
  const pairLists = lists.filter((l) => l.from === baseLanguage && l.to === learningLanguage);
  const pairRuns = runs.filter((r) => r.from === baseLanguage && r.to === learningLanguage);
  const list = pairLists.find((l) => l.id === selected) || pairLists[0];
  const current = list?.words.find((w) => w.id === practice.queue[practice.index]);

  function navigate(next: View) {
    if (view === "test" && next !== "test") {
      setModal("exit");
      return;
    }
    if (view === "editor" && next !== "editor") {
      leaveEditor(next);
      return;
    }
    setView(next);
    setNav(false);
    setNotice(null);
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
    setNotice(null);
    setNav(false);
  }
  function saveProfile(profileBase: string) {
    if (view === "test")
      throw new Error("End your practice session before changing your base language.");
    if (view === "editor")
      throw new Error("Leave the list editor before changing your base language.");
    if (profileBase !== baseLanguage) {
      const targets = sortLanguageNames(
        [
          ...new Set(
            lists.filter((l) => l.from === profileBase && l.to !== profileBase).map((l) => l.to),
          ),
        ],
        languageList,
      );
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
    setNotice({ text: "Profile updated. Existing lists have not been changed." });
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
            words: [],
          },
    );
    setView("editor");
    setNotice(null);
  }
  // The editor autosaves through this; it never leaves the editor.
  function saveList(saved: List) {
    if (deletedIds.current.has(saved.id)) return;
    setLists((ls) =>
      ls.some((l) => l.id === saved.id)
        ? ls.map((l) => (l.id === saved.id ? saved : l))
        : [...ls, saved],
    );
    sync?.saveList(saved);
  }
  // Leaving the editor saves what's waiting (ListEditor does that as it closes), but would drop
  // unfinished rows or pasted text, so it asks first when there are any.
  function leaveEditor(to: View | "practice", edited = editorDraft.current ?? undefined) {
    if (editorLost.length) {
      setLeaving({ to, list: edited });
      setModal("leave");
      return;
    }
    goFromEditor(to, edited);
  }
  function goFromEditor(to: View | "practice", edited?: List) {
    // Show the edited list in the library, under its (possibly changed) language.
    if (edited && lists.some((l) => l.id === edited.id)) {
      setSelected(edited.id);
      setLearningLanguage(edited.to);
      setQuery("");
    }
    if (to === "practice") startTest(false, edited);
    else {
      setView(to);
      setNav(false);
      setNotice(null);
    }
  }
  function changePending(pending: boolean, lost: string[]) {
    setEditorLost(lost);
    sync?.pending(pending);
  }
  function askDelete(target: List) {
    setDeleting(target);
    setModal("delete");
  }
  function deleteList(target: List) {
    deletedIds.current.add(target.id);
    setLists((ls) => ls.filter((l) => l.id !== target.id));
    void sync?.deleteList(target.id).then((deleted) => {
      if (deleted) return;
      deletedIds.current.delete(target.id);
      // This tab's copy is stale, so saving it would get 409 too; a reload shows the newer one.
      setLists((ls) => (ls.some((l) => l.id === target.id) ? ls : [...ls, target]));
      setNotice({
        text: `Another tab changed “${listTitle(target)}”, so it wasn't deleted. Reload this tab to see the latest version.`,
        warning: true,
      });
    });
    setSelected("");
    setView("library");
    setModal(null);
    setNotice({ text: "List deleted." });
  }
  // Practises the selected list, or `target` (the list just edited, not selected yet).
  function startTest(onlyMistakes = false, target = list) {
    if (!target?.words.length) {
      setView("library");
      setNav(false);
      return;
    }
    const mistakes = onlyMistakes ? practice.results : undefined;
    dispatch({
      type: "start",
      queue: practiceQueue(target.words, settings, Date.now(), mistakes),
    });
    setView("test");
    setNotice(null);
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
      title: listTitle(list),
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
    a.download = `${listTitle(list).toLowerCase().replace(/\s+/g, "-")}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({
      text: "CSV exported. It includes language names and word pairs, not review history.",
    });
  }
  const shell = (
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
        save={account?.save}
        onClose={() => setNav(false)}
        onHome={() => navigate("library")}
        onLanguage={changeLearningLanguage}
        onProfile={() => setModal("account")}
        onNavigate={navigate}
        onPractice={() =>
          view === "test"
            ? setNav(false)
            : view === "editor"
              ? leaveEditor("practice")
              : startTest()
        }
        onHelp={() => setModal("help")}
        reportable={aiEnabled ? aiActions.length : 0}
        onReport={() => setModal("report")}
      />
      <header className="mobile-bar">
        <Link
          className="mobile-wordmark"
          href="/"
          prefetch={false}
          onClick={(e) => {
            e.preventDefault();
            navigate("library");
          }}
        >
          <BookMark size={20} aria-hidden="true" />
          <strong>
            vocabulary<span>.training</span>
          </strong>
        </Link>
        {account && <SaveStatus state={account.save} compact />}
        <button className="button" onClick={() => setNav(!nav)} aria-expanded={nav}>
          Menu <ChevronDown size={16} />
        </button>
      </header>
      <main id="content">
        {account?.saveError && (
          <div className="save-error" role="alert">
            <span>{account.saveError} Your current words remain in this tab.</span>
            <button className="button" onClick={account.onRetry}>
              Retry save
            </button>
          </div>
        )}
        {view === "library" && (
          <LibraryView
            baseLanguage={baseLanguage}
            learningLanguage={learningLanguage}
            lists={pairLists}
            list={list}
            query={query}
            now={now}
            settings={settings}
            previewPages={list ? (previewPages[list.id] ?? 0) : 0}
            onPreviewPages={(pages) => {
              if (list) setPreviewPages((all) => ({ ...all, [list.id]: pages }));
            }}
            onQuery={setQuery}
            onSelect={setSelected}
            onEdit={edit}
            onImport={() => setModal("import")}
            onExport={exportList}
            onDelete={askDelete}
            onSettings={(change) => setSettings((s) => ({ ...s, ...change }))}
            onStart={() => startTest()}
            onHelp={() => setModal("help")}
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
            onDone={(edited) => leaveEditor("library", edited)}
            onPending={changePending}
            onDraft={(draft) => {
              editorDraft.current = draft;
            }}
            onDelete={() => {
              const saved = lists.find((l) => l.id === editing.id);
              if (saved) askDelete(saved);
            }}
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
            title={listTitle(list)}
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
          <div
            role={notice.warning ? "alert" : "status"}
            className={notice.warning ? "notice warning" : "notice"}
          >
            {notice.warning ? <CircleAlert size={16} /> : <Check size={16} />}
            <span>{notice.text}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      <Dialog title={modal && DIALOG_TITLES[modal]} onClose={() => setModal(null)}>
        {modal === "account" && (
          <ProfileDialog
            account={account}
            baseLanguage={baseLanguage}
            languageList={languageList}
            locked={
              view === "test"
                ? "End your practice session before changing your base language."
                : view === "editor"
                  ? "Leave the list editor before changing your base language."
                  : ""
            }
            onSave={saveProfile}
            theme={theme}
            onTheme={chooseTheme}
            aiEnabled={aiEnabled}
            onAiEnabled={aiOffered ? chooseAiEnabled : undefined}
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
        {modal === "delete" && deleting && (
          <DeleteDialog
            list={deleting}
            onCancel={() => setModal(null)}
            onDelete={() => deleteList(deleting)}
          />
        )}
        {modal === "help" && (
          <HelpDialog speech={ai.speech.length > 0} onClose={() => setModal(null)} />
        )}
        {modal === "report" && (
          <ReportDialog actions={[...aiActions].reverse()} onClose={() => setModal(null)} />
        )}
        {modal === "leave" && (
          <LeaveDialog
            lost={editorLost}
            onStay={() => {
              setModal(null);
              setLeaving(null);
            }}
            onLeave={() => {
              setModal(null);
              setLeaving(null);
              if (leaving) goFromEditor(leaving.to, leaving.list);
            }}
          />
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
  return <AiFeaturesContext.Provider value={ai}>{shell}</AiFeaturesContext.Provider>;
}
