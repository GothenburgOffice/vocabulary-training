"use client";
import Link from "next/link";
import { useContext, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, X } from "lucide-react";
import { BookMark } from "@/lib/brand";
import { listTitle, type List } from "@/lib/learning";
import type { WorkspaceAccount, WorkspaceData, Run, WorkspaceSync } from "@/lib/workspace";
import {
  DEFAULT_LANGUAGES,
  NO_AI,
  languageCodes,
  pickerLanguages,
  sortLanguageNames,
  type Language,
} from "@/lib/languages";
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
import { DEFAULT_TIMING, type InputType } from "@/lib/timing";
import { useAccountSettings } from "./workspace/useAccountSettings";
import { useListActions } from "./workspace/useListActions";
import { usePracticeActions } from "./workspace/usePracticeActions";
import { usePracticeSettings } from "./workspace/usePracticeSettings";

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
  timingCutoffs = DEFAULT_TIMING.cutoffMs,
}: {
  initial: WorkspaceData;
  // Receives each change to save. Without it (tests, previews), nothing is saved.
  sync?: WorkspaceSync;
  account?: WorkspaceAccount;
  languageList?: Language[];
  // The pause cutoffs answer timing measures with (#2).
  timingCutoffs?: Record<InputType, number>;
}) {
  // For the library's due counts; handlers read the clock when they run.
  const now = useNow();
  // What the site offers this account; while the account's AI switch is off (#113), the
  // workspace's views see no AI features at all.
  const offeredAi = useContext(AiFeaturesContext);
  const { aiEnabled, chooseAiEnabled, theme, chooseTheme } = useAccountSettings(initial, sync);
  const ai = aiEnabled ? offeredAi : NO_AI;
  const aiOffered = offeredAi.languageNotes || offeredAi.speech.length > 0;
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
  const [settings, setSettings] = usePracticeSettings();
  const [modal, setModal] = useState<Modal | null>(null);
  const { actions: aiActions } = useAiActionLog();
  const [nav, setNav] = useState(false);
  // A short message under the page; a warning when something didn't happen as asked.
  const [notice, setNotice] = useState<{ text: string; warning?: boolean } | null>(null);
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
  const { practice, current, startTest, check, next, typeAnswer } = usePracticeActions({
    list,
    settings,
    setLists,
    setRuns,
    setView,
    setNav,
    setNotice,
    sync,
  });
  const {
    editing,
    editorLost,
    deleting,
    edit,
    editDraft,
    saveList,
    leaveEditor,
    stayInEditor,
    leaveAnyway,
    changePending,
    changeDraft,
    askDelete,
    deleteList,
    exportList,
  } = useListActions({
    lists,
    setLists,
    list,
    baseLanguage,
    learningLanguage,
    setSelected,
    setLearningLanguage,
    setQuery,
    setView,
    setNav,
    setNotice,
    setModal,
    startTest,
    sync,
  });

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
            onDraft={changeDraft}
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
            onAnswer={typeAnswer}
            onCheck={check}
            timingCutoffs={timingCutoffs}
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
              editDraft(draft);
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
          <LeaveDialog lost={editorLost} onStay={stayInEditor} onLeave={leaveAnyway} />
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
