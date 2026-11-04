import { useContext, useEffect, useRef } from "react";
import { ArrowRight, X } from "lucide-react";
import { answersFor, listTitle, type List, type Word } from "../../lib/learning";
import { AnswerClock, type InputType, type TimingSample } from "../../lib/timing";
import {
  isLastWord,
  MODE_LABELS,
  nextReviewText,
  type Practice,
  type PracticeSettings,
} from "../../lib/practice";
import { AiFeaturesContext } from "../AiFeatures";
import LanguageNote from "../LanguageNote";
import SpeechButton from "../SpeechButton";
import Button from "./Button";

export default function PracticeSession({
  list,
  word,
  practice,
  settings,
  baseLanguage,
  onAnswer,
  onCheck,
  onNext,
  onEnd,
  timingCutoffs,
}: {
  list: List;
  // The word being asked.
  word: Word;
  practice: Practice;
  settings: PracticeSettings;
  baseLanguage: string;
  onAnswer: (answer: string) => void;
  // A typed answer comes with its timing (#2); a skipped one without.
  onCheck: (skipped: boolean, timing?: TimingSample | null) => void;
  timingCutoffs: Record<InputType, number>;
  onNext: () => void;
  onEnd: () => void;
}) {
  const ai = useContext(AiFeaturesContext);
  const { index, queue, answer, feedback, results } = practice;
  const { direction, mode, accents, caseSensitive } = settings;
  const forward = direction === "forward";
  const answerRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  // The clock for the word being asked (#2), with the cutoff for this device's input type.
  const clock = useRef<{ clock: AnswerClock; input: InputType } | null>(null);
  useEffect(() => {
    if (feedback) return;
    const input: InputType = matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
    const answerClock = new AnswerClock(timingCutoffs[input]);
    answerClock.start(performance.now(), document.hidden);
    clock.current = { clock: answerClock, input };
  }, [index, feedback, timingCutoffs]);
  useEffect(() => {
    const changed = () => clock.current?.clock.visibility(document.hidden, performance.now());
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  // Typing goes to the answer; once checked, Enter goes to the next-word button.
  useEffect(() => {
    if (!feedback) answerRef.current?.focus();
    else feedbackRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [index, feedback]);
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{listTitle(list)}</h1>
          <p>
            {forward ? `${list.from} → ${list.to}` : `${list.to} → ${list.from}`} ·{" "}
            {MODE_LABELS[mode]}
          </p>
        </div>
        <Button onClick={onEnd}>
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
          <span>Translate into {forward ? list.to : list.from}</span>
          <h2 className="prompt-word">
            <span>{forward ? word.front : word.back}</span>
            <SpeechButton
              key={`${word.id}-${direction}`}
              wordId={word.id}
              part={forward ? "native" : "learning"}
              text={forward ? word.front : word.back}
              language={forward ? list.from : list.to}
              label="Play question word"
            />
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (feedback) onNext();
            else {
              const timed = clock.current;
              onCheck(false, timed?.clock.finish(performance.now(), timed.input) ?? null);
            }
          }}
        >
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
              onChange={(e) => {
                clock.current?.clock.input(performance.now());
                onAnswer(e.target.value);
              }}
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
                {feedback.correct ? "That's right." : "Not quite. Let's keep this one in practice."}
              </strong>
              <p className="answer-pronunciation">
                <span>
                  {feedback.correct ? "Answer: " : "Correct answer: "}
                  {answersFor(word, direction).join(" / ")}
                </span>
                {/* Every accepted answer is read, as listed (#79). */}
                <SpeechButton
                  key={`${word.id}-${direction}-answer`}
                  wordId={word.id}
                  part={forward ? "answers" : "native"}
                  text={answersFor(word, direction).join("; ")}
                  language={forward ? list.to : list.from}
                  label="Play answer word"
                />
              </p>
              <p>
                {nextReviewText(
                  word[direction].due,
                  word[direction].lastReview ?? feedback.answeredAt ?? 0,
                )}
              </p>
              <Button primary type="submit">
                {isLastWord(practice) ? "See results" : "Next word"} <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <div className="test-actions">
              <button type="button" className="text-button" onClick={() => onCheck(true)}>
                I don’t know yet
              </button>
              <Button primary type="submit" disabled={!answer.trim()}>
                Check answer <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </form>
        {feedback && ai.languageNotes && (
          <LanguageNote
            skipped={!!feedback.skipped}
            wordId={word.id}
            direction={direction}
            input={{
              sourceLanguage: forward ? list.from : list.to,
              targetLanguage: forward ? list.to : list.from,
              explanationLanguage: baseLanguage,
              source: forward ? word.front : word.back,
              reference: forward ? word.back : word.front,
              accepted: forward ? word.accepted : undefined,
              answer: feedback.answer,
              correct: feedback.correct,
              requireAccents: accents,
              caseSensitive,
            }}
          />
        )}
        <p className="test-tip">Press Enter to check, then Enter again for the next word.</p>
        {(ai.languageNotes || ai.speech.includes(list.from) || ai.speech.includes(list.to)) && (
          <p className="test-tip ai-disclaimer">
            Audio and language notes are AI-generated and can make mistakes.
          </p>
        )}
      </section>
    </>
  );
}
