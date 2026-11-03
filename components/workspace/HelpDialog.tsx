import { ArrowRight } from "lucide-react";
import Button from "./Button";

// How practice works: what each mode asks, and how every answer schedules the next review.
export default function HelpDialog({ speech, onClose }: { speech: boolean; onClose: () => void }) {
  return (
    <>
      <p>
        Each practice mode only decides which words a session asks, and in what order. Every answer,
        in any mode, is graded the same way and schedules the word&apos;s next review. Each
        direction has its own history.
      </p>
      <h3>Weighted mix</h3>
      <p>
        A weighted sample without replacement: each word appears at most once per round, and weaker
        and due words are more likely to appear.
      </p>
      <div className="formula">Weight = 1 + 3 × smoothed error rate + due bonus</div>
      <p>
        The error rate is (mistakes + 1) / (attempts + 2). The due bonus is 2 when a word is new or
        its review date has arrived.
      </p>
      <h3>Spaced review</h3>
      <p>
        Due words first, starting with the ones you are likeliest to have forgotten, then new words,
        then the rest, likeliest forgotten first, until the session has as many words as you chose.
      </p>
      <h3>Random order</h3>
      <p>Every word gets the same chance to appear.</p>
      <h3>Review dates</h3>
      <p>
        Review dates come from FSRS, an open spaced-repetition model. For each word it estimates how
        well you remember it and how hard it is for you, and schedules the next review for when you
        are likely to recall it 9 times out of 10. A right answer pushes the date further out, more
        so the longer you had gone without it; a wrong or skipped one brings the word back within 10
        minutes. A new word you get right comes back after 10 minutes, then after days.
      </p>
      <p>
        Grading only knows right or wrong; it never uses AI, and neither does scheduling. Review
        dates use the server&apos;s clock.
      </p>
      {speech && (
        <p>
          Speaker buttons play only when clicked. Generated voices can mispronounce some languages.
          Answer audio appears after grading or skipping. Audio never changes your grade.
        </p>
      )}
      <Button primary onClick={onClose}>
        Back to my words <ArrowRight size={16} />
      </Button>
    </>
  );
}
