import { useEffect, useEffectEvent, useState } from "react";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, Plus, Trash2, Undo2, X } from "lucide-react";
import { makeWord, type List, type Word } from "../../lib/learning";
import Button from "./Button";

// How long the editor waits after the last change before saving.
const AUTOSAVE_MS = 1000;
const MAX_WORDS = 1000;

const complete = (w: Word) => !!w.front.trim() && !!w.back.trim();
// What gets saved: the trimmed name and the rows with both words. A half-filled row isn't a
// word yet, so it stays in the editor.
function saveable(draft: List): List {
  return {
    ...draft,
    title: draft.title.trim(),
    words: draft.words
      .filter(complete)
      .map((w) => ({ ...w, front: w.front.trim(), back: w.back.trim() })),
  };
}
const same = (a: List, b: List) => JSON.stringify(a) === JSON.stringify(b);

export default function ListEditor({
  initial,
  isNew,
  listCount,
  baseLanguage,
  languages,
  onSave,
  onDone,
  onDelete,
  onPending,
}: {
  // A copy of the list as opened, or a new one (possibly with imported words).
  initial: List;
  isNew: boolean;
  listCount: number;
  baseLanguage: string;
  languages: string[];
  // Receives the list to save, as the user edits it.
  onSave: (list: List) => void;
  // Back to the library, showing this list.
  onDone: (list: List) => void;
  onDelete: () => void;
  // Edits not saved yet (unfinished rows, pasted text, a change waiting to save), and whether
  // leaving would lose some: everything waiting is saved as the editor closes, the rest isn't.
  onPending: (pending: boolean, losable: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  // A new list is only created once it has a name ("Add words").
  const [created, setCreated] = useState(!isNew);
  // The list as it was when editing began, for Undo; kept in memory only.
  const [snapshot, setSnapshot] = useState(() => saveable(initial));
  // The last version handed to onSave.
  const [saved, setSaved] = useState(() => saveable(initial));
  const [pasting, setPasting] = useState(false);
  const [bulk, setBulk] = useState("");
  const [bulkStart, setBulkStart] = useState("");
  const [error, setError] = useState("");

  const next = saveable(draft);
  const tooMany = next.words.length > MAX_WORDS;
  const unfinished = draft.words.filter((w) => !complete(w) && (w.front || w.back)).length;
  const waiting = created ? !tooMany && !same(next, saved) : !!draft.title.trim();
  const losable = unfinished > 0 || tooMany || (pasting && bulk !== bulkStart) || !created;
  const pending = waiting || (losable && (created || !!draft.title.trim()));

  function save(list: List) {
    setSaved(list);
    onSave(list);
  }
  // Saves the latest edits once typing pauses, and at once when the editor closes.
  const saveWaiting = useEffectEvent(() => {
    if (created && !tooMany && !same(next, saved)) save(next);
  });
  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(saveWaiting, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, created]);
  useEffect(() => () => saveWaiting(), []);
  const reportPending = useEffectEvent((value: boolean, lost: boolean) => onPending(value, lost));
  useEffect(() => {
    reportPending(pending, pending && losable);
  }, [pending, losable]);
  useEffect(() => () => reportPending(false, false), []);

  function changeWord(id: string, key: "front" | "back", value: string) {
    setDraft((d) => ({
      ...d,
      words: d.words.map((w) => (w.id === id ? { ...w, [key]: value } : w)),
    }));
  }
  function create() {
    if (listCount >= 100) {
      setError("This version supports up to 100 lists per account.");
      return;
    }
    const first = saveable(draft);
    setCreated(true);
    setSnapshot(first);
    // Imported words are saved now; a new list gets empty rows to fill in.
    if (!first.words.length) setDraft({ ...draft, words: [1, 2, 3, 4, 5].map(() => makeWord()) });
    setError("");
    save(first);
  }
  function startPaste() {
    const text = next.words.map((w) => `${w.front}\t${w.back}`).join("\n");
    setBulk(text);
    setBulkStart(text);
    setPasting(true);
    setError("");
  }
  // Pasted rows keep a word's id and history when its pair is unchanged.
  function importPaste() {
    try {
      const words = bulk
        .split("\n")
        .filter((r) => r.trim())
        .map((row, i) => {
          const cells = row.includes("\t") ? row.split("\t") : row.split(";");
          if (cells.length !== 2 || !cells[0].trim() || !cells[1].trim())
            throw new Error(
              `Line ${i + 1}: separate a complete word pair with a tab or semicolon.`,
            );
          const [front, back] = [cells[0].trim(), cells[1].trim()];
          return (
            draft.words.find((w) => w.front === front && w.back === back) || makeWord(front, back)
          );
        });
      if (words.length > MAX_WORDS) throw new Error("Keep each list to 1,000 word pairs or fewer.");
      const imported = { ...draft, words: words.length ? words : [makeWord()] };
      setDraft(imported);
      setPasting(false);
      setError("");
      save(saveable(imported));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function undo() {
    setDraft({ ...snapshot, words: snapshot.words.length ? snapshot.words : [makeWord()] });
    setPasting(false);
    setError("");
    save(snapshot);
  }

  const changed = !same(saved, snapshot) || pending;
  return (
    <>
      <header className="page-heading">
        <div>
          <button type="button" className="text-button back" onClick={() => onDone(next)}>
            <ArrowLeft size={15} /> My word lists
          </button>
          <h1>{created ? "A few words, well chosen." : "Start with a name."}</h1>
          <p>
            {created
              ? "Changes save as you type. A word pair is saved once both words are filled in."
              : "Name the list and pick the language you're learning. Then add the words."}
          </p>
        </div>
        {created && (
          <Button primary onClick={() => onDone(next)}>
            <Check size={17} /> Done
          </Button>
        )}
      </header>
      <section className="editor-meta">
        <label className="field">
          List name
          <input
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. Everyday French"
            autoFocus={!created}
          />
        </label>
        <label className="field">
          A short description
          <input
            value={draft.description}
            maxLength={1000}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="What are you learning?"
          />
        </label>
      </section>
      <section className="editor-panel">
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
        {!created ? (
          <div className="editor-start">
            {next.words.length > 0 && (
              <p>
                {next.words.length} word pair{next.words.length === 1 ? "" : "s"} from your CSV will
                be added.
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button primary onClick={create} disabled={!draft.title.trim()}>
              Add words <ArrowRight size={16} />
            </Button>
          </div>
        ) : (
          <>
            <div className="section-top">
              {pasting ? (
                <strong>Paste a list</strong>
              ) : (
                <button type="button" className="text-button" onClick={startPaste}>
                  Paste a list instead
                </button>
              )}
              <span className="muted">
                {next.words.length} word pair{next.words.length === 1 ? "" : "s"}
                {unfinished > 0 && ` · ${unfinished} unfinished, not saved`}
              </span>
            </div>
            {pasting ? (
              <>
                <label className="field bulk-label">
                  One word pair per line, separated by a tab or semicolon
                  <textarea
                    rows={10}
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    placeholder={"hej;bonjour\ntack;merci\nhej då;au revoir"}
                  />
                  <small>
                    Paste two columns from a spreadsheet, or use word;translation. Import replaces
                    the list&apos;s word pairs; unchanged pairs keep their progress.
                  </small>
                </label>
                <div className="inline-actions">
                  <Button
                    onClick={() => {
                      setPasting(false);
                      setError("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button primary onClick={importPaste} disabled={bulk === bulkStart}>
                    Import <Check size={16} />
                  </Button>
                </div>
              </>
            ) : (
              <div className="pair-rows">
                {draft.words.map((w, i) => (
                  <div className="pair-row" key={w.id}>
                    <span>{i + 1}</span>
                    <input
                      aria-label={`First language word ${i + 1}`}
                      value={w.front}
                      maxLength={200}
                      onChange={(e) => changeWord(w.id, "front", e.target.value)}
                      placeholder="Word or phrase"
                    />
                    <input
                      aria-label={`Translation ${i + 1}`}
                      value={w.back}
                      maxLength={200}
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
            )}
            {(error || tooMany) && (
              <p role="alert" className="error">
                {error || "Keep each list to 1,000 word pairs or fewer. Changes aren't saved."}
              </p>
            )}
            <div className="editor-bottom">
              <button type="button" className="text-button delete-list" onClick={onDelete}>
                <Trash2 size={15} /> Delete list
              </button>
              <Button onClick={undo} disabled={!changed}>
                <Undo2 size={16} /> Undo changes
              </Button>
              <Button primary onClick={() => onDone(next)}>
                Done <Check size={16} />
              </Button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
