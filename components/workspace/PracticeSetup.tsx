import { ArrowLeftRight, ArrowRight, ChevronDown, ListChecks, Plus, Settings2 } from "lucide-react";
import { BookMark } from "../../lib/brand";
import { listTitle, type List } from "../../lib/learning";
import type { Mode, PracticeSettings } from "../../lib/practice";
import Button from "./Button";

// The library's side panel: how to practise the selected list.
export default function PracticeSetup({
  list,
  learningLanguage,
  settings,
  onSettings,
  onStart,
  onNewList,
}: {
  list: List | undefined;
  learningLanguage: string;
  settings: PracticeSettings;
  onSettings: (change: Partial<PracticeSettings>) => void;
  onStart: () => void;
  onNewList: () => void;
}) {
  const { direction, mode, length, caseSensitive, accents } = settings;
  return (
    <aside className="practice-panel">
      <div className="section-top">
        <h2>Practise this list</h2>
        <ListChecks size={18} />
      </div>
      {list ? (
        <>
          <h3>{listTitle(list)}</h3>
          <p>{list.description || "A fresh set of words to make your own."}</p>
          <div className="direction-card">
            <span>{direction === "forward" ? list.from : list.to}</span>
            <button
              aria-label="Reverse test direction"
              title="Reverse test direction"
              onClick={() =>
                onSettings({ direction: direction === "forward" ? "reverse" : "forward" })
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
              onChange={(e) => onSettings({ mode: e.target.value as Mode })}
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
              onChange={(e) => onSettings({ length: Number(e.target.value) })}
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
                onChange={(e) => onSettings({ caseSensitive: e.target.checked })}
              />{" "}
              Case-sensitive answers
            </label>
            <label>
              <input
                type="checkbox"
                checked={accents}
                onChange={(e) => onSettings({ accents: e.target.checked })}
              />{" "}
              Require accents
            </label>
            <small>
              Spaces and apostrophe styles are normalized. Accents are required by default. Separate
              accepted answers with | in your list.
            </small>
          </details>
          <Button primary onClick={onStart}>
            Start practice <ArrowRight size={17} />
          </Button>
          <small className="no-timer">No timer. Just you and the words.</small>
        </>
      ) : (
        <div className="practice-empty">
          <BookMark size={28} />
          <h3>A new language, a clean page.</h3>
          <p>
            Add a {learningLanguage} list to start practising. Words from your other language pairs
            stay separate.
          </p>
          <Button primary onClick={onNewList}>
            Add your first words <Plus size={16} />
          </Button>
        </div>
      )}
    </aside>
  );
}
