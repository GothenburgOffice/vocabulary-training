import { ArrowRight, History as HistoryIcon } from "lucide-react";
import type { Run } from "@/lib/workspace";
import Button from "./Button";

export default function HistoryView({
  baseLanguage,
  learningLanguage,
  runs,
  onStart,
  onBrowse,
}: {
  baseLanguage: string;
  learningLanguage: string;
  // Completed sessions of this language pair, newest first.
  runs: Run[];
  // Starts practising the selected list; absent without lists.
  onStart?: () => void;
  onBrowse: () => void;
}) {
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Your {learningLanguage} practice history.</h1>
          <p>
            {baseLanguage} ↔ {learningLanguage}. Your most recent completed sessions, saved to your
            account.
          </p>
        </div>
        {onStart && (
          <Button primary onClick={onStart}>
            Start practice <ArrowRight size={16} />
          </Button>
        )}
      </header>
      <section className="history-panel">
        {runs.length ? (
          runs.map((r, i) => (
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
            <p>Finish a {learningLanguage} practice session and your results will appear here.</p>
            <Button onClick={onBrowse}>
              Choose a word list <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
