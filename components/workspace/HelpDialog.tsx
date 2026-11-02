import { ArrowRight } from "lucide-react";
import Button from "./Button";

export default function HelpDialog({ speech, onClose }: { speech: boolean; onClose: () => void }) {
  return (
    <>
      <p>
        Smart mix samples without replacement. Each word appears at most once per round. Weaker and
        due words receive a larger sampling weight.
      </p>
      <div className="formula">Weight = 1 + 3 × smoothed error rate + due bonus</div>
      <p>
        The error rate is (mistakes + 1) / (attempts + 2). The due bonus is 2 when a word is new or
        its review date has arrived.
      </p>
      <p>
        A correct answer schedules review in 1, 2, 4, 8, 16, then at most 30 days, based on the
        current correct streak. A wrong answer resets the streak and schedules a review in 10
        minutes.
      </p>
      <p>
        These are tunable rules, not validated memory estimates. Review dates use your current
        device time. Each direction has its own history.
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
