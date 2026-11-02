import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { Result } from "../../lib/workspace";
import Button from "./Button";

export default function ResultsView({
  title,
  results,
  onBack,
  onPractise,
}: {
  title: string;
  results: Result[];
  onBack: () => void;
  onPractise: (mistakesOnly: boolean) => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const wrong = results.length - correct;
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>A little practice, a little progress.</h1>
          <p>{title} · session complete</p>
        </div>
        <Button onClick={onBack}>
          <ArrowLeft size={16} /> Back to lists
        </Button>
      </header>
      <section className="results-overview">
        <div>
          <strong>
            {correct}
            <span> / {results.length}</span>
          </strong>
          <p>answered correctly</p>
        </div>
        <div>
          <h2>{wrong ? "You know what to work on next." : "A good round. Keep it going."}</h2>
          <p>
            {wrong} word{wrong === 1 ? "" : "s"} to revisit. Review history is tracked separately in
            each direction.
          </p>
          <div className="inline-actions">
            {wrong > 0 && (
              <Button primary onClick={() => onPractise(true)}>
                Practise mistakes <ArrowRight size={16} />
              </Button>
            )}
            <Button onClick={() => onPractise(false)}>Try another round</Button>
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
            <strong>{r.direction === "forward" ? r.word.front : r.word.back}</strong>
            <div>
              <span>{r.answer}</span>
              {!r.correct && (
                <small>Expected: {r.direction === "forward" ? r.word.back : r.word.front}</small>
              )}
            </div>
            <span>{r.correct ? "Correct" : "Review again"}</span>
          </div>
        ))}
      </section>
    </>
  );
}
