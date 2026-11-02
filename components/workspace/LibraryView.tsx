import { ArrowRight, ChevronRight, Download, Plus, Search, Trash2, Upload } from "lucide-react";
import { BookMark } from "../../lib/brand";
import { listStats, type List } from "../../lib/learning";
import type { PracticeSettings } from "../../lib/practice";
import SpeechButton from "../SpeechButton";
import Button from "./Button";
import PracticeSetup from "./PracticeSetup";

export default function LibraryView({
  baseLanguage,
  learningLanguage,
  lists,
  list,
  query,
  now,
  settings,
  onQuery,
  onSelect,
  onEdit,
  onImport,
  onExport,
  onDelete,
  onSettings,
  onStart,
}: {
  baseLanguage: string;
  learningLanguage: string;
  // The lists of the current language pair, and the selected one.
  lists: List[];
  list: List | undefined;
  query: string;
  now: number;
  settings: PracticeSettings;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  // Without a list, opens a new one.
  onEdit: (list?: List) => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: (list: List) => void;
  onSettings: (change: Partial<PracticeSettings>) => void;
  onStart: () => void;
}) {
  const { direction } = settings;
  const stats = lists.map((l) => listStats(l, direction, now));
  const totalWords = lists.reduce((sum, l) => sum + l.words.length, 0);
  const totalDue = stats.reduce((sum, s) => sum + s.due, 0);
  const totalLearned = stats.reduce((sum, s) => sum + s.learned, 0);
  const visible = lists.filter((l) =>
    (l.title + " " + l.from + " " + l.to).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Your {learningLanguage} workspace.</h1>
          <p>Make room for a few new words.</p>
        </div>
        <Button primary onClick={() => onEdit()}>
          <Plus size={17} /> New word list
        </Button>
      </header>
      <div className="summary-grid">
        <div>
          <span>Word lists</span>
          <strong>{lists.length}</strong>
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
                Your {learningLanguage} lists <span>{lists.length}</span>
              </h2>
              <button className="text-button" onClick={onImport}>
                <Upload size={15} /> Import CSV
              </button>
            </div>
            <div className="list-filters">
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder={`Find a ${learningLanguage} list`}
                  aria-label="Find a word list"
                />
              </label>
            </div>
            <div className="list-labels">
              <span>List</span>
              <span>Progress</span>
            </div>
            {visible.map((l) => {
              const { learned } = listStats(l, direction, now);
              return (
                <button
                  key={l.id}
                  className={`list-row ${list?.id === l.id ? "selected" : ""}`}
                  onClick={() => onSelect(l.id)}
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
                      {learned}/{l.words.length} established
                    </span>
                    <div>
                      <i style={{ width: `${(learned / l.words.length) * 100}%` }} />
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>
              );
            })}
            {!visible.length && (
              <div className="empty">
                {query ? (
                  <>
                    <Search size={24} />
                    <h3>No matching lists</h3>
                    <p>Try a different name within your {learningLanguage} lists.</p>
                    <Button onClick={() => onQuery("")}>Clear search</Button>
                  </>
                ) : (
                  <>
                    <BookMark size={26} />
                    <h3>Your first {learningLanguage} words start here.</h3>
                    <p>
                      Create a {baseLanguage} → {learningLanguage} list. This language joins your
                      menu when you save it.
                    </p>
                    <Button primary onClick={() => onEdit()}>
                      <Plus size={16} /> Create your first list
                    </Button>
                  </>
                )}
              </div>
            )}
            <button className="add-list" onClick={() => onEdit()}>
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
                  <button className="text-button" onClick={onExport}>
                    <Download size={15} /> Export
                  </button>
                  <button className="text-button" onClick={() => onDelete(list)}>
                    <Trash2 size={15} /> Delete
                  </button>
                  <button className="text-button" onClick={() => onEdit(list)}>
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
                    <SpeechButton text={w.front} language={list.from} />
                  </span>
                  <span className="word-with-audio">
                    <span>{w.back}</span>
                    <SpeechButton text={w.back} language={list.to} />
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
                <button className="text-button all-words" onClick={() => onEdit(list)}>
                  View all {list.words.length} words <ChevronRight size={14} />
                </button>
              )}
            </section>
          )}
        </div>
        <PracticeSetup
          list={list}
          learningLanguage={learningLanguage}
          settings={settings}
          onSettings={onSettings}
          onStart={onStart}
          onNewList={() => onEdit()}
        />
      </div>
    </>
  );
}
