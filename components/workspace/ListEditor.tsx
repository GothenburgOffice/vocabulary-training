import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowLeftRight, Check, Plus, Trash2, X } from "lucide-react";
import { makeWord, type List } from "../../lib/learning";
import Button from "./Button";

export default function ListEditor({
  initial,
  isNew,
  listCount,
  baseLanguage,
  languages,
  onSave,
  onCancel,
  onDelete,
}: {
  // A copy of the list to edit, or a new one.
  initial: List;
  isNew: boolean;
  listCount: number;
  baseLanguage: string;
  languages: string[];
  // Receives the checked, trimmed list.
  onSave: (list: List) => void;
  onCancel: () => void;
  // Asks to delete the saved list; only offered for one.
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [inputMode, setInputMode] = useState<"pairs" | "bulk">("pairs");
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");

  function changeWord(id: string, key: "front" | "back", value: string) {
    setDraft((d) => ({
      ...d,
      words: d.words.map((w) => (w.id === id ? { ...w, [key]: value } : w)),
    }));
  }
  // Pasted rows keep a word's id and history when its pair is unchanged.
  function readBulk() {
    return bulk
      .split("\n")
      .filter((r) => r.trim())
      .map((row, i) => {
        const cells = row.includes("\t") ? row.split("\t") : row.split(";");
        if (cells.length !== 2 || !cells[0].trim() || !cells[1].trim())
          throw new Error(`Line ${i + 1}: separate a complete word pair with a tab or semicolon.`);
        const old = draft.words.find(
          (w) => w.front === cells[0].trim() && w.back === cells[1].trim(),
        );
        return old || makeWord(cells[0].trim(), cells[1].trim());
      });
  }
  function switchInput(next: "pairs" | "bulk") {
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
  function save(e: FormEvent) {
    e.preventDefault();
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
      if (listCount >= 100 && isNew)
        throw new Error("This version supports up to 100 lists per account.");
      if (words.some((w) => !w.front.trim() || !w.back.trim()))
        throw new Error("Complete both sides of each word pair, or remove the row.");
      onSave({
        ...draft,
        title: draft.title.trim(),
        words: words.map((w) => ({ ...w, front: w.front.trim(), back: w.back.trim() })),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={save}>
      <header className="page-heading">
        <div>
          <button type="button" className="text-button back" onClick={onCancel}>
            <ArrowLeft size={15} /> My word lists
          </button>
          <h1>{isNew ? "Start with a few words." : "A few words, well chosen."}</h1>
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
              Paste two columns from a spreadsheet, or use word;translation. Use CSV import for
              quoted fields.
            </small>
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="editor-bottom">
          {!isNew && (
            <button type="button" className="text-button delete-list" onClick={onDelete}>
              <Trash2 size={15} /> Delete list
            </button>
          )}
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button primary type="submit">
            Save word list <Check size={16} />
          </Button>
        </div>
      </section>
    </form>
  );
}
