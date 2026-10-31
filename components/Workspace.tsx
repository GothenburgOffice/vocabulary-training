"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FilePlus2,
  FolderOpen,
  History as HistoryIcon,
  ListChecks,
  Plus,
  Search,
  Settings2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { DEMO_NOW, sampleLists } from "../lib/sample";
import {
  encodeCSV,
  isCorrect,
  makeWord,
  parseCSV,
  randomOrder,
  reviewed,
  weightedOrder,
  type Direction,
  type List,
} from "../lib/learning";
import type { WorkspaceData, Result, Run } from "../lib/workspace";
import LanguageNote from "./LanguageNote";
import RequestyAttribution from "./RequestyAttribution";
import SpeechButton from "./SpeechButton";

type View = "library" | "editor" | "test" | "results" | "history";
const languages = [
  "Swedish",
  "French",
  "English",
  "Spanish",
  "German",
  "Italian",
  "Japanese",
  "Other",
];
const codes: Record<string, string> = {
  sv: "Swedish",
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
  ja: "Japanese",
};
function Button({
  children,
  onClick,
  primary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button className={primary ? "button primary" : "button"} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
export default function Workspace({
  demo = true,
  initial,
  onChange,
  previewFeedback,
}: {
  demo?: boolean;
  initial?: WorkspaceData;
  onChange?: (data: WorkspaceData) => void;
  previewFeedback?: { endpoint: string; timeoutMs: number };
}) {
  const now = demo ? DEMO_NOW : Date.now();
  const [lists, setLists] = useState<List[]>(() => initial?.lists ?? structuredClone(sampleLists));
  const [selected, setSelected] = useState("everyday-french");
  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [baseLanguage, setBaseLanguage] = useState(initial?.baseLanguage ?? "Swedish");
  const [profileBase, setProfileBase] = useState(initial?.baseLanguage ?? "Swedish");
  const [learningLanguage, setLearningLanguage] = useState(initial?.learningLanguage ?? "French");
  const [newLanguage, setNewLanguage] = useState("German");
  const [direction, setDirection] = useState<Direction>("forward");
  const [mode, setMode] = useState("adaptive");
  const [length, setLength] = useState(8);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [accents, setAccents] = useState(true);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<(Result & { skipped?: boolean }) | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [runs, setRuns] = useState<Run[]>(initial?.runs ?? []);
  const [draft, setDraft] = useState<List | null>(null);
  const [inputMode, setInputMode] = useState("pairs");
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"account" | "import" | "help" | "exit" | "language" | null>(
    null,
  );
  const [csv, setCsv] = useState("");
  const [nav, setNav] = useState(false);
  const [notice, setNotice] = useState("");
  const answerRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    onChange?.({ lists, runs, baseLanguage, learningLanguage });
  }, [lists, runs, baseLanguage, learningLanguage, onChange]);
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
  const stats = (l: List) => {
    const studied = l.words.filter((w) => w[direction].correct + w[direction].wrong > 0).length;
    const learned = l.words.filter((w) => w[direction].streak >= 3).length;
    const due = l.words.filter((w) => w[direction].due > 0 && w[direction].due <= now).length;
    return { studied, learned, due, fresh: l.words.length - studied };
  };
  const current = list?.words.find((w) => w.id === queue[index]);
  const totalWords = pairLists.reduce((sum, l) => sum + l.words.length, 0);
  const totalDue = pairLists.reduce((sum, l) => sum + stats(l).due, 0);
  const totalLearned = pairLists.reduce((sum, l) => sum + stats(l).learned, 0);
  const finished = results.filter((r) => r.correct).length;
  useEffect(() => {
    if (view === "test" && !feedback) answerRef.current?.focus();
    if (view === "test" && feedback)
      feedbackRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [view, index, feedback]);
  useEffect(() => {
    if (modal && !modalRef.current?.open) modalRef.current?.showModal();
    if (!modal && modalRef.current?.open) modalRef.current?.close();
  }, [modal]);
  function navigate(next: View) {
    if (view === "test" && next !== "test") {
      setModal("exit");
      return;
    }
    setView(next);
    setNav(false);
    setNotice("");
    setError("");
  }
  function changeLearningLanguage(value: string) {
    if (value === "__add__") {
      setNewLanguage(
        languages.find((l) => l !== baseLanguage && !savedLanguages.includes(l)) || "German",
      );
      setModal("language");
      return;
    }
    setLearningLanguage(value);
    setSelected("");
    setQuery("");
    setDirection("forward");
    setNotice("");
    setError("");
    setNav(false);
  }
  function openProfile() {
    setProfileBase(baseLanguage);
    setError("");
    setModal("account");
  }
  function saveProfile() {
    if (view === "test") {
      setError("End your practice session before changing your base language.");
      return;
    }
    if (profileBase !== baseLanguage) {
      const targets = [
        ...new Set(
          lists.filter((l) => l.from === profileBase && l.to !== profileBase).map((l) => l.to),
        ),
      ].sort();
      setBaseLanguage(profileBase);
      setLearningLanguage(
        targets.includes(learningLanguage)
          ? learningLanguage
          : targets[0] || languages.find((l) => l !== profileBase)!,
      );
      setSelected("");
      setQuery("");
      setDirection("forward");
      setView("library");
    }
    setModal(null);
    setNav(false);
    setNotice(
      demo
        ? "Profile updated for this preview session. Your existing lists have not been changed."
        : "Profile updated. Existing lists have not been changed. See the account bar for save status.",
    );
    setError("");
  }
  function edit(target?: List) {
    setDraft(
      target
        ? structuredClone(target)
        : {
            id: `list-${Date.now()}`,
            title: "",
            description: "",
            from: baseLanguage,
            to: learningLanguage,
            words: [makeWord(), makeWord(), makeWord(), makeWord(), makeWord()],
          },
    );
    setInputMode("pairs");
    setView("editor");
    setError("");
    setNotice("");
  }
  function changeWord(id: string, key: "front" | "back", value: string) {
    setDraft((d) =>
      d ? { ...d, words: d.words.map((w) => (w.id === id ? { ...w, [key]: value } : w)) } : d,
    );
  }
  function switchInput(next: string) {
    if (!draft) return;
    if (next === "bulk")
      setBulk(
        draft.words
          .filter((w) => w.front || w.back)
          .map((w) => `${w.front}\t${w.back}`)
          .join("\n"),
      );
    else {
      try {
        const words = readBulk();
        setDraft({ ...draft, words: words.length ? words : [makeWord()] });
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setInputMode(next);
    setError("");
  }
  function readBulk() {
    return bulk
      .split("\n")
      .filter((r) => r.trim())
      .map((row, i) => {
        const cells = row.includes("\t") ? row.split("\t") : row.split(";");
        if (cells.length !== 2 || !cells[0].trim() || !cells[1].trim())
          throw new Error(`Line ${i + 1}: separate a complete word pair with a tab or semicolon.`);
        const old = draft?.words.find(
          (w) => w.front === cells[0].trim() && w.back === cells[1].trim(),
        );
        return old || makeWord(cells[0].trim(), cells[1].trim());
      });
  }
  function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    try {
      const words =
        inputMode === "bulk"
          ? readBulk()
          : draft.words.filter((w) => w.front.trim() || w.back.trim());
      if (!draft.title.trim()) throw new Error("Give your list a name.");
      if (draft.from !== baseLanguage)
        throw new Error("This list's first language must match your profile's base language.");
      if (draft.to === baseLanguage)
        throw new Error("Choose a learning language different from your base language.");
      if (!words.length) throw new Error("Add at least one word pair.");
      if (words.length > 1000) throw new Error("Keep each list to 1,000 word pairs or fewer.");
      if (words.some((w) => w.front.trim().length > 200 || w.back.trim().length > 200))
        throw new Error("Keep each side of a word pair to 200 characters or fewer.");
      if (draft.title.trim().length > 200)
        throw new Error("Keep the list name to 200 characters or fewer.");
      if (draft.description.length > 1000)
        throw new Error("Keep the description to 1,000 characters or fewer.");
      if (lists.length >= 100 && !lists.some((l) => l.id === draft.id))
        throw new Error("This version supports up to 100 lists per account.");
      if (words.some((w) => !w.front.trim() || !w.back.trim()))
        throw new Error("Complete both sides of each word pair, or remove the row.");
      const clean = {
        ...draft,
        title: draft.title.trim(),
        words: words.map((w) => ({ ...w, front: w.front.trim(), back: w.back.trim() })),
      };
      setLists((ls) =>
        ls.some((l) => l.id === clean.id)
          ? ls.map((l) => (l.id === clean.id ? clean : l))
          : [...ls, clean],
      );
      setSelected(clean.id);
      setLearningLanguage(clean.to);
      setQuery("");
      setView("library");
      setNotice(
        demo
          ? "List saved in this preview session. Export CSV to keep a copy."
          : "List updated. See the account bar for save status.",
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function startTest(onlyMistakes = false) {
    if (!list?.words.length) {
      setView("library");
      setNav(false);
      return;
    }
    const wrongIds = new Set(results.filter((r) => !r.correct).map((r) => r.word.id));
    const pool = onlyMistakes ? list.words.filter((w) => wrongIds.has(w.id)) : list.words;
    const ordered = mode === "adaptive" ? weightedOrder(pool, direction, now) : randomOrder(pool);
    setQueue(ordered.slice(0, onlyMistakes ? pool.length : length));
    setIndex(0);
    setResults([]);
    setAnswer("");
    setFeedback(null);
    setView("test");
    setNotice("");
    setNav(false);
  }
  function submitAnswer(e: FormEvent, skip = false) {
    e.preventDefault();
    if (!list || !current || feedback || (!answer.trim() && !skip)) return;
    const expected = direction === "forward" ? current.back : current.front;
    const correct = !skip && isCorrect(answer, expected, caseSensitive, accents);
    const result = {
      word: structuredClone(current),
      answer: skip ? "Skipped" : answer.trim(),
      correct,
      direction,
    };
    setFeedback({ ...result, skipped: skip });
    setResults((r) => [...r, result]);
    setLists((ls) =>
      ls.map((l) =>
        l.id !== list.id
          ? l
          : {
              ...l,
              words: l.words.map((w) =>
                w.id !== current.id
                  ? w
                  : { ...w, [direction]: reviewed(w[direction], correct, now) },
              ),
            },
      ),
    );
  }
  function next() {
    if (!list) return;
    if (index + 1 >= queue.length) {
      setRuns((r) =>
        [
          {
            id: crypto.randomUUID(),
            completedAt: now,
            title: list.title,
            from: list.from,
            to: list.to,
            results,
          },
          ...r,
        ].slice(0, 200),
      );
      setView("results");
    } else {
      setIndex((i) => i + 1);
      setAnswer("");
      setFeedback(null);
    }
  }
  function exportList() {
    if (!list) return;
    const blob = new Blob(["\uFEFF" + encodeCSV(list)], { type: "text/csv;charset=utf-8" });
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
  function importList() {
    try {
      const rows = parseCSV(csv);
      if (rows.length < 2) throw new Error("Include a language header and at least one word pair.");
      const [from, to] = rows[0].map((x) => codes[x.trim().toLowerCase()] || x.trim());
      if (from !== baseLanguage)
        throw new Error(
          `This CSV uses ${from} as its base language. Your profile uses ${baseLanguage}. Change your profile first to import it; existing lists will not be changed.`,
        );
      if (from === to) throw new Error("The CSV must contain two different languages.");
      const words = rows.slice(1).map(([a, b]) => makeWord(a.trim(), b.trim()));
      if (!from || !to || words.some((w) => !w.front || !w.back))
        throw new Error("Language names and both sides of every pair are required.");
      setDraft({
        id: `import-${Date.now()}`,
        title: "Imported word list",
        description: "",
        from,
        to,
        words,
      });
      setInputMode("pairs");
      setView("editor");
      setModal(null);
      setError("");
      setCsv("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const visibleLists = pairLists.filter((l) =>
    (l.title + " " + l.from + " " + l.to).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className={`sidebar ${nav ? "open" : ""}`}>
        <div className="brand">
          <BookOpen size={23} aria-hidden="true" />
          <span className="wordmark">
            vocabulary<strong>.training</strong>
          </span>
          <button
            className="mobile-close icon-button"
            aria-label="Close menu"
            onClick={() => setNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <section className="sidebar-languages" aria-label="Active language pair">
          <label className="field">
            I’m learning
            <select
              aria-label="Learning language"
              value={learningLanguage}
              disabled={view !== "library" && view !== "history"}
              onChange={(e) => changeLearningLanguage(e.target.value)}
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
              onClick={openProfile}
              aria-label={`Change base language (currently ${baseLanguage}) in profile`}
            >
              Change
            </button>
          </p>
          {view !== "library" && view !== "history" && (
            <small className="scope-lock">Return to your lists to switch language.</small>
          )}
        </section>
        <nav aria-label="Main navigation">
          <button
            className={view === "library" || view === "editor" ? "active" : ""}
            onClick={() => navigate("library")}
          >
            <FolderOpen size={18} /> My word lists{" "}
            <span className="nav-count">{pairLists.length}</span>
          </button>
          <button
            className={view === "test" || view === "results" ? "active" : ""}
            onClick={() => (view === "test" ? setNav(false) : startTest())}
          >
            <ListChecks size={18} /> Practice
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => navigate("history")}
          >
            <HistoryIcon size={18} /> Session history{" "}
            <span className="nav-count">{pairRuns.length || ""}</span>
          </button>
        </nav>
        <div className="side-bottom">
          <button onClick={() => setModal("help")}>
            <CircleHelp size={18} /> How practice works
          </button>
          <a
            href={
              demo ? "./original/index.html" : "https://github.com/hkarn/vocabulary-tester-site"
            }
            target="_blank"
            rel="noreferrer"
          >
            <ArrowLeft size={18} /> Original design
          </a>
          <button className="account-row" onClick={openProfile} aria-label="Open profile">
            <span className="avatar">
              <UserRound size={16} />
            </span>
            <span>
              {demo ? "Preview account" : "Your account"}
              <small>Profile settings</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <header className="mobile-bar">
        <span className="mobile-wordmark">
          <BookOpen size={20} aria-hidden="true" />
          <strong>
            vocabulary<span>.training</span>
          </strong>
        </span>
        <button className="button" onClick={() => setNav(!nav)} aria-expanded={nav}>
          Menu <ChevronDown size={16} />
        </button>
      </header>
      <main id="content">
        {demo && (
          <div className="preview-strip">
            <span>
              <span className="tiny-dot" />{" "}
              {previewFeedback
                ? "Live AI preview · answers sent to Requesty"
                : "Interactive design preview"}
            </span>
            <span>Sample data · changes reset when you reload</span>
          </div>
        )}
        {view === "library" && (
          <>
            <header className="page-heading">
              <div>
                <h1>Your {learningLanguage} workspace.</h1>
                <p>Make room for a few new words.</p>
              </div>
              <Button primary onClick={() => edit()}>
                <Plus size={17} /> New word list
              </Button>
            </header>
            <div className="summary-grid">
              <div>
                <span>Word lists</span>
                <strong>{pairLists.length}</strong>
                <small>From {baseLanguage}</small>
              </div>
              <div>
                <span>Words in this pair</span>
                <strong>{totalWords}</strong>
                <small>Across your {learningLanguage} lists</small>
              </div>
              <div>
                <span>Ready to review</span>
                <strong className="blue-number">{totalDue}</strong>
                <small>Previously studied words due</small>
              </div>
              <div>
                <span>Established words</span>
                <strong>{totalLearned}</strong>
                <small>3+ consecutive correct answers</small>
              </div>
            </div>
            <div className="library-layout">
              <div className="library-main">
                <section className="list-panel">
                  <div className="section-top">
                    <h2>
                      Your {learningLanguage} lists <span>{pairLists.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => {
                        setError("");
                        setModal("import");
                      }}
                    >
                      <Upload size={15} /> Import CSV
                    </button>
                  </div>
                  <div className="list-filters">
                    <label className="search">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Find a ${learningLanguage} list`}
                        aria-label="Find a word list"
                      />
                    </label>
                  </div>
                  <div className="list-labels">
                    <span>List</span>
                    <span>Progress</span>
                  </div>
                  {visibleLists.map((l) => {
                    const s = stats(l);
                    return (
                      <button
                        key={l.id}
                        className={`list-row ${list?.id === l.id ? "selected" : ""}`}
                        onClick={() => setSelected(l.id)}
                        aria-pressed={list?.id === l.id}
                      >
                        <div className="list-name">
                          <div>
                            <strong>{l.title}</strong>
                            <small>
                              {l.words.length} words
                              {l.description ? (
                                <>
                                  {" "}
                                  <span>·</span> {l.description}
                                </>
                              ) : null}
                            </small>
                          </div>
                        </div>
                        <div className="mini-progress">
                          <span>
                            {s.learned}/{l.words.length} established
                          </span>
                          <div>
                            <i style={{ width: `${(s.learned / l.words.length) * 100}%` }} />
                          </div>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                  {!visibleLists.length && (
                    <div className="empty">
                      {query ? (
                        <>
                          <Search size={24} />
                          <h3>No matching lists</h3>
                          <p>Try a different name within your {learningLanguage} lists.</p>
                          <Button onClick={() => setQuery("")}>Clear search</Button>
                        </>
                      ) : (
                        <>
                          <BookOpen size={26} />
                          <h3>Your first {learningLanguage} words start here.</h3>
                          <p>
                            Create a {baseLanguage} → {learningLanguage} list. This language joins
                            your menu when you save it.
                          </p>
                          <Button primary onClick={() => edit()}>
                            <Plus size={16} /> Create your first list
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  <button className="add-list" onClick={() => edit()}>
                    <Plus size={16} /> Create another word list
                  </button>
                </section>
                {list && (
                  <section className="word-preview">
                    <div className="section-top">
                      <div>
                        <h2>Inside {list.title}</h2>
                        <p>{list.description}</p>
                      </div>
                      <div className="inline-actions">
                        <button className="text-button" onClick={exportList}>
                          <Download size={15} /> Export
                        </button>
                        <button className="text-button" onClick={() => edit(list)}>
                          Edit list <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="word-head">
                      <span>{list.from}</span>
                      <span>{list.to}</span>
                      <span>Practice state</span>
                    </div>
                    {list.words.slice(0, 5).map((w) => (
                      <div className="word-row" key={w.id}>
                        <span className="word-with-audio">
                          <span>{w.front}</span>
                          <SpeechButton
                            text={w.front}
                            language={list.from}
                            demo={demo}
                            previewEndpoint={previewFeedback?.endpoint}
                          />
                        </span>
                        <span className="word-with-audio">
                          <span>{w.back.split("|")[0].trim()}</span>
                          <SpeechButton
                            text={w.back}
                            language={list.to}
                            demo={demo}
                            previewEndpoint={previewFeedback?.endpoint}
                          />
                        </span>
                        <span className={`state ${w[direction].streak >= 3 ? "established" : ""}`}>
                          {w[direction].streak >= 3
                            ? "Established"
                            : w[direction].correct + w[direction].wrong === 0
                              ? "New word"
                              : "Learning"}
                        </span>
                      </div>
                    ))}
                    {list.words.length > 5 && (
                      <button className="text-button all-words" onClick={() => edit(list)}>
                        View all {list.words.length} words <ChevronRight size={14} />
                      </button>
                    )}
                  </section>
                )}
              </div>
              <aside className="practice-panel">
                <div className="section-top">
                  <h2>Practise this list</h2>
                  <ListChecks size={18} />
                </div>
                {list ? (
                  <>
                    <h3>{list.title}</h3>
                    <p>{list.description || "A fresh set of words to make your own."}</p>
                    <div className="direction-card">
                      <span>{direction === "forward" ? list.from : list.to}</span>
                      <button
                        aria-label="Reverse test direction"
                        title="Reverse test direction"
                        onClick={() =>
                          setDirection((d) => (d === "forward" ? "reverse" : "forward"))
                        }
                      >
                        <ArrowLeftRight size={17} />
                      </button>
                      <span>{direction === "forward" ? list.to : list.from}</span>
                    </div>
                    <label className="field">
                      Practice mode
                      <select
                        aria-label="Practice mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                      >
                        <option value="adaptive">Smart mix</option>
                        <option value="random">Random order</option>
                      </select>
                    </label>
                    <p className="field-help">
                      {mode === "adaptive"
                        ? "A weighted sample: weaker and due words are more likely to appear."
                        : "Every word gets the same chance to appear."}
                    </p>
                    <label className="field">
                      Session size
                      <select
                        aria-label="Session size"
                        value={length}
                        onChange={(e) => setLength(Number(e.target.value))}
                      >
                        <option value={5}>5 words · a quick round</option>
                        <option value={8}>8 words · a little practice</option>
                        <option value={1000}>All {list.words.length} words</option>
                      </select>
                    </label>
                    <details className="answer-settings">
                      <summary>
                        <Settings2 size={15} /> Answer settings <ChevronDown size={14} />
                      </summary>
                      <label>
                        <input
                          type="checkbox"
                          checked={caseSensitive}
                          onChange={(e) => setCaseSensitive(e.target.checked)}
                        />{" "}
                        Case-sensitive answers
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={accents}
                          onChange={(e) => setAccents(e.target.checked)}
                        />{" "}
                        Require accents
                      </label>
                      <small>
                        Spaces and apostrophe styles are normalized. Accents are required by
                        default. Separate accepted answers with | in your list.
                      </small>
                    </details>
                    <Button primary onClick={() => startTest()}>
                      Start practice <ArrowRight size={17} />
                    </Button>
                    <small className="no-timer">No timer. Just you and the words.</small>
                  </>
                ) : (
                  <div className="practice-empty">
                    <BookOpen size={28} />
                    <h3>A new language, a clean page.</h3>
                    <p>
                      Add a {learningLanguage} list to start practising. Words from your other
                      language pairs stay separate.
                    </p>
                    <Button primary onClick={() => edit()}>
                      Add your first words <Plus size={16} />
                    </Button>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
        {view === "editor" && draft && (
          <form onSubmit={saveDraft}>
            <header className="page-heading">
              <div>
                <button
                  type="button"
                  className="text-button back"
                  onClick={() => navigate("library")}
                >
                  <ArrowLeft size={15} /> My word lists
                </button>
                <h1>
                  {lists.some((l) => l.id === draft.id)
                    ? "A few words, well chosen."
                    : "Start with a few words."}
                </h1>
                <p>Add word pairs, or paste a whole list at once.</p>
              </div>
              <Button primary type="submit">
                <Check size={17} /> Save word list
              </Button>
            </header>
            <section className="editor-meta">
              <label className="field">
                List name
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Everyday French"
                />
              </label>
              <label className="field">
                A short description
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What are you learning?"
                />
              </label>
            </section>
            <section className="editor-panel">
              <div className="section-top">
                <div className="segmented">
                  <button
                    type="button"
                    aria-pressed={inputMode === "pairs"}
                    className={inputMode === "pairs" ? "chosen" : ""}
                    onClick={() => switchInput("pairs")}
                  >
                    Word by word
                  </button>
                  <button
                    type="button"
                    aria-pressed={inputMode === "bulk"}
                    className={inputMode === "bulk" ? "chosen" : ""}
                    onClick={() => switchInput("bulk")}
                  >
                    Paste a list
                  </button>
                </div>
                <span className="muted">
                  {inputMode === "pairs"
                    ? draft.words.filter((w) => w.front && w.back).length
                    : bulk.split("\n").filter(Boolean).length}{" "}
                  word pairs
                </span>
              </div>
              <div className="language-fields">
                <label className="field">
                  Base language
                  <input aria-label="Base language from profile" value={draft.from} readOnly />
                  <small>From your profile</small>
                </label>
                <ArrowLeftRight size={18} />
                <label className="field">
                  Learning language
                  <select
                    aria-label="List learning language"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  >
                    {[...new Set([...languages, draft.to])]
                      .filter((l) => l !== baseLanguage)
                      .map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                  </select>
                </label>
              </div>
              {inputMode === "pairs" ? (
                <div className="pair-rows">
                  {draft.words.map((w, i) => (
                    <div className="pair-row" key={w.id}>
                      <span>{i + 1}</span>
                      <input
                        aria-label={`First language word ${i + 1}`}
                        value={w.front}
                        onChange={(e) => changeWord(w.id, "front", e.target.value)}
                        placeholder="Word or phrase"
                      />
                      <input
                        aria-label={`Translation ${i + 1}`}
                        value={w.back}
                        onChange={(e) => changeWord(w.id, "back", e.target.value)}
                        placeholder="Translation"
                      />
                      <button
                        type="button"
                        aria-label={`Remove word ${i + 1}`}
                        className="icon-button"
                        onClick={() =>
                          setDraft({ ...draft, words: draft.words.filter((x) => x.id !== w.id) })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="add-list"
                    onClick={() => setDraft({ ...draft, words: [...draft.words, makeWord()] })}
                  >
                    <Plus size={16} /> Add a word pair
                  </button>
                </div>
              ) : (
                <label className="field bulk-label">
                  One word pair per line, separated by a tab or semicolon
                  <textarea
                    rows={10}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    placeholder={"hej;bonjour\ntack;merci\nhej då;au revoir"}
                  />
                  <small>
                    Paste two columns from a spreadsheet, or use word;translation. Use CSV import
                    for quoted fields.
                  </small>
                </label>
              )}
              <p className="editor-hint">
                More than one right answer? Separate alternatives with <strong>|</strong>, for
                example <strong>hi | hello</strong>.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="editor-bottom">
                <Button type="button" onClick={() => navigate("library")}>
                  Cancel
                </Button>
                <Button primary type="submit">
                  Save word list <Check size={16} />
                </Button>
              </div>
            </section>
          </form>
        )}
        {view === "test" && list && current && (
          <>
            <header className="page-heading">
              <div>
                <h1>{list.title}</h1>
                <p>
                  {direction === "forward"
                    ? `${list.from} → ${list.to}`
                    : `${list.to} → ${list.from}`}{" "}
                  · {mode === "adaptive" ? "Smart mix" : "Random order"}
                </p>
              </div>
              <Button onClick={() => setModal("exit")}>
                <X size={16} /> End session
              </Button>
            </header>
            <section className="test-panel">
              <div className="test-meta">
                <span>
                  Word {index + 1} of {queue.length}
                </span>
                <span>{results.filter((r) => r.correct).length} correct</span>
              </div>
              <div className="session-track">
                <i style={{ width: `${(index / queue.length) * 100}%` }} />
              </div>
              <div className="prompt">
                <span>Translate into {direction === "forward" ? list.to : list.from}</span>
                <h2 className="prompt-word">
                  <span>
                    {direction === "forward" ? current.front : current.back.split("|")[0].trim()}
                  </span>
                  <SpeechButton
                    key={`${current.id}-${direction}`}
                    text={direction === "forward" ? current.front : current.back}
                    language={direction === "forward" ? list.from : list.to}
                    label="Play question word"
                    demo={demo}
                    previewEndpoint={previewFeedback?.endpoint}
                  />
                </h2>
              </div>
              <form onSubmit={(e) => (feedback ? (e.preventDefault(), next()) : submitAnswer(e))}>
                <label className="field">
                  Your answer
                  <input
                    maxLength={500}
                    ref={answerRef}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={answer}
                    disabled={!!feedback}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type the translation"
                  />
                </label>
                {feedback ? (
                  <div
                    ref={feedbackRef}
                    role="status"
                    className={`feedback ${feedback.correct ? "correct" : "incorrect"}`}
                  >
                    <strong>
                      {feedback.correct
                        ? "That's right."
                        : "Not quite. Let's keep this one in practice."}
                    </strong>
                    <p className="answer-pronunciation">
                      <span>
                        {feedback.correct ? "Answer: " : "Correct answer: "}
                        {(direction === "forward" ? current.back : current.front)
                          .split("|")
                          .map((s) => s.trim())
                          .join(" / ")}
                      </span>
                      <SpeechButton
                        key={`${current.id}-${direction}-answer`}
                        text={direction === "forward" ? current.back : current.front}
                        language={direction === "forward" ? list.to : list.from}
                        label="Play answer word"
                        demo={demo}
                        previewEndpoint={previewFeedback?.endpoint}
                      />
                    </p>
                    {feedback.correct && (
                      <p>
                        Next review: {Math.min(30, 2 ** (current[direction].streak - 1))} day(s).
                      </p>
                    )}
                    <Button primary type="submit">
                      {index + 1 === queue.length ? "See results" : "Next word"}{" "}
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                ) : (
                  <div className="test-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={(e) => submitAnswer(e, true)}
                    >
                      I don’t know yet
                    </button>
                    <Button primary type="submit" disabled={!answer.trim()}>
                      Check answer <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
              </form>
              {feedback && (
                <LanguageNote
                  demo={demo}
                  previewFeedback={previewFeedback}
                  skipped={!!feedback.skipped}
                  input={{
                    sourceLanguage: direction === "forward" ? list.from : list.to,
                    targetLanguage: direction === "forward" ? list.to : list.from,
                    explanationLanguage: baseLanguage,
                    source:
                      direction === "forward" ? current.front : current.back.split("|")[0].trim(),
                    reference: direction === "forward" ? current.back : current.front,
                    answer: feedback.answer,
                    correct: feedback.correct,
                    requireAccents: accents,
                    caseSensitive,
                  }}
                />
              )}
              <p className="test-tip">Press Enter to check, then Enter again for the next word.</p>
            </section>
          </>
        )}
        {view === "results" && list && (
          <>
            <header className="page-heading">
              <div>
                <h1>A little practice, a little progress.</h1>
                <p>{list.title} · session complete</p>
              </div>
              <Button onClick={() => navigate("library")}>
                <ArrowLeft size={16} /> Back to lists
              </Button>
            </header>
            <section className="results-overview">
              <div>
                <strong>
                  {finished}
                  <span> / {results.length}</span>
                </strong>
                <p>answered correctly</p>
              </div>
              <div>
                <h2>
                  {finished === results.length
                    ? "A good round. Keep it going."
                    : "You know what to work on next."}
                </h2>
                <p>
                  {results.length - finished} word{results.length - finished === 1 ? "" : "s"} to
                  revisit. Review history is tracked separately in each direction.
                </p>
                <div className="inline-actions">
                  {finished < results.length && (
                    <Button primary onClick={() => startTest(true)}>
                      Practise mistakes <ArrowRight size={16} />
                    </Button>
                  )}
                  <Button onClick={() => startTest()}>Try another round</Button>
                </div>
              </div>
            </section>
            <section className="results-list">
              <h2>Your answers</h2>
              {results.map((r, i) => (
                <div className="result-row" key={i}>
                  <span className={r.correct ? "result-ok" : "result-wrong"}>
                    {r.correct ? <Check size={17} /> : <X size={17} />}
                  </span>
                  <strong>
                    {r.direction === "forward" ? r.word.front : r.word.back.split("|")[0]}
                  </strong>
                  <div>
                    <span>{r.answer}</span>
                    {!r.correct && (
                      <small>
                        Expected: {r.direction === "forward" ? r.word.back : r.word.front}
                      </small>
                    )}
                  </div>
                  <span>{r.correct ? "Correct" : "Review again"}</span>
                </div>
              ))}
            </section>
          </>
        )}
        {view === "history" && (
          <>
            <header className="page-heading">
              <div>
                <h1>Your {learningLanguage} practice history.</h1>
                <p>
                  {baseLanguage} ↔ {learningLanguage}.{" "}
                  {demo
                    ? "Sessions in this preview clear when you reload."
                    : "Your most recent completed sessions, saved to your account."}
                </p>
              </div>
              {list && (
                <Button primary onClick={() => startTest()}>
                  Start practice <ArrowRight size={16} />
                </Button>
              )}
            </header>
            <section className="history-panel">
              {pairRuns.length ? (
                pairRuns.map((r, i) => (
                  <article className="history-row" key={r.id ?? i}>
                    <HistoryIcon size={20} />
                    <div>
                      <h2>{r.title}</h2>
                      <p>
                        {r.results.length} questions ·{" "}
                        {r.results[0]?.direction === "forward" ? "Forward" : "Reverse"} direction
                        {r.completedAt && (
                          <>
                            {" "}
                            ·{" "}
                            <time dateTime={new Date(r.completedAt).toISOString()}>
                              {new Date(r.completedAt).toLocaleDateString()}
                            </time>
                          </>
                        )}
                      </p>
                    </div>
                    <strong>
                      {r.results.filter((x) => x.correct).length}/{r.results.length} correct
                    </strong>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <HistoryIcon size={30} />
                  <h2>A fresh start.</h2>
                  <p>
                    Finish a {learningLanguage} practice session and your results will appear here.
                  </p>
                  <Button onClick={() => navigate("library")}>
                    Choose a word list <ArrowRight size={16} />
                  </Button>
                </div>
              )}
            </section>
          </>
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
          <RequestyAttribution />
        </footer>
      </main>
      <dialog
        ref={modalRef}
        onCancel={() => {
          setModal(null);
          setError("");
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModal(null);
            setError("");
          }
        }}
      >
        <div className="dialog-head">
          <h2>
            {modal === "account"
              ? "Your profile"
              : modal === "language"
                ? "Make room for another language."
                : modal === "import"
                  ? "Bring your words along."
                  : modal === "exit"
                    ? "Leave this practice session?"
                    : "A smarter mix, not a black box."}
          </h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => {
              setModal(null);
              setError("");
            }}
          >
            <X size={20} />
          </button>
        </div>
        {modal === "account" && (
          <>
            <p>Set the native or base language you use for your word lists.</p>
            <label className="field">
              Native / base language
              <select
                aria-label="Native / base language"
                value={profileBase}
                disabled={view === "test"}
                onChange={(e) => setProfileBase(e.target.value)}
              >
                {languages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <p>
              Your dashboard shows lists and progress for this base language and the learning
              language you select. Changing your base language does not translate, relabel or delete
              existing lists.
            </p>
            <div className="account-future">
              <UserRound size={24} />
              <div>
                <strong>
                  {demo ? "Preview account · session-only" : "Your personal workspace"}
                </strong>
                <p>
                  {demo
                    ? "There is no sign-in or server storage in this preview. Profile settings, lists and progress reset on reload. Export CSV to keep your words."
                    : "Lists, profile settings, review progress and completed sessions are saved to your account. Check the account bar for save status. CSV exports contain words, not your review history."}
                </p>
              </div>
            </div>
            {view === "test" && (
              <p className="error">End your practice session before changing your base language.</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button primary onClick={saveProfile} disabled={view === "test"}>
              Save profile <Check size={16} />
            </Button>
          </>
        )}
        {modal === "language" && (
          <>
            <p>
              Choose a language to learn from {baseLanguage}. It stays in your menu once you save
              your first list for this pair.
            </p>
            <label className="field">
              New learning language
              <select
                aria-label="New learning language"
                value={newLanguage}
                onChange={(e) => setNewLanguage(e.target.value)}
              >
                {languages
                  .filter((l) => l !== baseLanguage && !savedLanguages.includes(l))
                  .map((l) => (
                    <option key={l}>{l}</option>
                  ))}
              </select>
            </label>
            <p>No list is created yet, and your other language pairs stay unchanged.</p>
            <div className="inline-actions">
              <Button onClick={() => setModal(null)}>Cancel</Button>
              <Button
                primary
                onClick={() => {
                  changeLearningLanguage(newLanguage);
                  setModal(null);
                }}
              >
                Open language workspace <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}
        {modal === "import" && (
          <>
            <p>
              Paste a two-column CSV. The first row contains language names or old-style codes such
              as sv,fr. Following rows contain word pairs.
            </p>
            <label className="field">
              CSV contents
              <textarea
                rows={7}
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"sv,fr\nhej,bonjour\ntack,merci"}
              />
            </label>
            <label className="file-input">
              Or choose a .csv file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCsv(await f.text());
                    setError("");
                  }
                }}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button primary onClick={importList} disabled={!csv.trim()}>
              <FilePlus2 size={16} /> Preview imported words
            </Button>
          </>
        )}
        {modal === "help" && (
          <>
            <p>
              Smart mix samples without replacement. Each word appears at most once per round.
              Weaker and due words receive a larger sampling weight.
            </p>
            <div className="formula">Weight = 1 + 3 × smoothed error rate + due bonus</div>
            <p>
              The error rate is (mistakes + 1) / (attempts + 2). The due bonus is 2 when a word is
              new or its review date has arrived.
            </p>
            <p>
              A correct answer schedules review in 1, 2, 4, 8, 16, then at most 30 days, based on
              the current correct streak. A wrong answer resets the streak and schedules a review in
              10 minutes.
            </p>
            <p>
              These are tunable rules, not validated memory estimates.{" "}
              {demo
                ? "Sample dates use a fixed 30 October 2026 clock."
                : "Review dates use your current device time."}{" "}
              Each direction has its own history.
            </p>
            <p>
              Speaker buttons play only when clicked. The demo voice is best for English and can
              mispronounce other languages. The first saved alternative is spoken; answer audio
              appears after grading or skipping. Audio never changes your grade.
            </p>
            <Button primary onClick={() => setModal(null)}>
              Back to my words <ArrowRight size={16} />
            </Button>
          </>
        )}
        {modal === "exit" && (
          <>
            <p>
              Answers already checked remain in your word statistics, but this unfinished session
              will not appear in session history.
            </p>
            <div className="inline-actions">
              <Button onClick={() => setModal(null)}>Keep practising</Button>
              <Button
                primary
                onClick={() => {
                  setModal(null);
                  setView("library");
                  setNav(false);
                }}
              >
                End session
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
