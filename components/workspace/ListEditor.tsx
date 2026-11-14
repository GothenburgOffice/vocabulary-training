import { useEffect, useEffectEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Plus,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { csvAnswers, makeWord, splitCSVAnswers, type List, type Word } from "@/lib/learning";
import Button from "./Button";

// How long the editor waits after the last change before saving.
const AUTOSAVE_MS = 1000;
const MAX_WORDS = 1000;
// Further accepted answers per word, besides the primary one (as the API allows).
const MAX_ANSWERS = 20;

const complete = (w: Word) => !!w.front.trim() && !!w.back.trim();
// What gets saved: the trimmed name and the rows with both words. A half-filled row isn't a
// word yet, so it stays in the editor; an empty further answer is left out.
function saveable(draft: List): List {
  return {
    ...draft,
    title: draft.title.trim(),
    words: draft.words.filter(complete).map(({ accepted, ...w }) => {
      const more = (accepted ?? []).map((a) => a.trim()).filter(Boolean);
      return {
        ...w,
        front: w.front.trim(),
        back: w.back.trim(),
        // No field at all when there are none, as lists are loaded.
        ...(more.length ? { accepted: more } : {}),
      };
    }),
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
  onDraft,
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
  // Whether there are edits not saved yet, and what leaving now would lose: a change waiting to
  // save is saved as the editor closes, but these can't be.
  onPending: (pending: boolean, lost: string[]) => void;
  // The list as it would be saved now, so any way out of the editor can show it.
  onDraft: (list: List) => void;
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
  const pasteChanged = pasting && bulk !== bulkStart;
  const waiting = !same(next, saved) && (!created || !tooMany);
  const lost = [
    ...(!created && waiting
      ? ["this new list, which isn't created until you press Add words"]
      : []),
    ...(unfinished ? [`${unfinished} word pair${unfinished === 1 ? "" : "s"} missing a word`] : []),
    ...(pasteChanged ? ["the pasted text, which isn't imported"] : []),
    ...(created && tooMany
      ? ["your changes since the last save: over 1,000 word pairs can't be saved"]
      : []),
  ];
  const pending = waiting || lost.length > 0;

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
  const reportPending = useEffectEvent(() => onPending(pending, lost));
  const lostKey = lost.join("\n");
  useEffect(() => {
    reportPending();
  }, [pending, lostKey]);
  const clearPending = useEffectEvent(() => onPending(false, []));
  useEffect(() => () => clearPending(), []);
  const reportDraft = useEffectEvent(() => onDraft(next));
  useEffect(() => {
    reportDraft();
  }, [draft]);

  function changeWord(id: string, key: "front" | "back", value: string) {
    setDraft((d) => ({
      ...d,
      words: d.words.map((w) => (w.id === id ? { ...w, [key]: value } : w)),
    }));
  }
  // Further answers: add an empty one, edit, remove, or swap one with the primary answer (the
  // one shown when practising and the prompt in reverse).
  function changeAnswers(id: string, change: (word: Word) => Word) {
    setDraft((d) => ({ ...d, words: d.words.map((w) => (w.id === id ? change(w) : w)) }));
  }
  const setAnswer = (word: Word, index: number, value: string) => ({
    ...word,
    accepted: (word.accepted ?? []).map((a, i) => (i === index ? value : a)),
  });
  const removeAnswer = (word: Word, index: number) => ({
    ...word,
    accepted: (word.accepted ?? []).filter((_, i) => i !== index),
  });
  const makePrimary = (word: Word, index: number) => ({
    ...word,
    back: word.accepted![index],
    accepted: word.accepted!.map((a, i) => (i === index ? word.back : a)),
  });
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
    const text = next.words.map((w) => `${w.front}\t${csvAnswers(w)}`).join("\n");
    setBulk(text);
    setBulkStart(text);
    setPasting(true);
    setError("");
  }
  // Pasted rows keep a word's id and history when the word and its primary answer are
  // unchanged. Further answers follow the primary one after a |, as in CSV files.
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
          const front = cells[0].trim();
          const [back, ...more] = splitCSVAnswers(cells[1]);
          const accepted = more.filter(Boolean);
          if (!back) throw new Error(`Line ${i + 1}: put the primary answer before any |.`);
          if ([front, back, ...accepted].some((text) => text.length > 200))
            throw new Error(`Line ${i + 1}: keep each word to 200 characters or fewer.`);
          if (accepted.length > MAX_ANSWERS)
            throw new Error(`Line ${i + 1}: keep to ${MAX_ANSWERS} further answers per word.`);
          const old = draft.words.find((w) => w.front === front && w.back === back);
          return old
            ? { ...old, accepted: accepted.length ? accepted : undefined }
            : makeWord(front, back, "", accepted);
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
                    Paste two columns from a spreadsheet, or use word;translation. Further accepted
                    answers follow the first after a |, like katt;chat|minou (write \| for a | in an
                    answer). Import replaces the list&apos;s word pairs; unchanged pairs keep their
                    progress.
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
                    {/* A div: .pair-row > span styles the row number (and hides it on phones). */}
                    <div className="answer-field">
                      <input
                        aria-label={`Translation ${i + 1}`}
                        value={w.back}
                        maxLength={200}
                        onChange={(e) => changeWord(w.id, "back", e.target.value)}
                        placeholder="Translation"
                      />
                      {(w.accepted?.length ?? 0) < MAX_ANSWERS && (
                        <button
                          type="button"
                          className="add-answer"
                          aria-label={`Add another accepted answer for word ${i + 1}`}
                          title="Add another accepted answer"
                          onClick={() =>
                            changeAnswers(w.id, (x) => ({
                              ...x,
                              accepted: [...(x.accepted ?? []), ""],
                            }))
                          }
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
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
                    {w.accepted?.length ? (
                      <ul
                        className="more-answers"
                        aria-label={`Other accepted answers for word ${i + 1}`}
                      >
                        {w.accepted.map((answer, j) => (
                          <li key={j}>
                            <input
                              aria-label={`Word ${i + 1}, accepted answer ${j + 2}`}
                              value={answer}
                              maxLength={200}
                              placeholder="Also accepted"
                              autoFocus={!answer && j === w.accepted!.length - 1}
                              onChange={(e) =>
                                changeAnswers(w.id, (x) => setAnswer(x, j, e.target.value))
                              }
                            />
                            <button
                              type="button"
                              className="text-button"
                              disabled={!answer.trim()}
                              aria-label={`Make word ${i + 1}'s accepted answer ${j + 2} primary`}
                              title="The primary answer is shown when practising, and asked for in reverse"
                              onClick={() => changeAnswers(w.id, (x) => makePrimary(x, j))}
                            >
                              <Star size={13} />{" "}
                              <span className="make-primary-label">Make primary</span>
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Remove word ${i + 1}'s accepted answer ${j + 2}`}
                              onClick={() => changeAnswers(w.id, (x) => removeAnswer(x, j))}
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
