import { useReducer, useRef, type Dispatch, type SetStateAction } from "react";
import { listTitle, reviewed, type List } from "@/lib/learning";
import {
  grade,
  isLastWord,
  NO_PRACTICE,
  practiceQueue,
  practiceReducer,
  type PracticeSettings,
} from "@/lib/practice";
import type { TimingSample } from "@/lib/timing";
import type { Run, WorkspaceSync } from "@/lib/workspace";
import type { View } from "./views";

type Props = {
  // The selected list, practised by default.
  list: List | undefined;
  settings: PracticeSettings;
  setLists: Dispatch<SetStateAction<List[]>>;
  setRuns: Dispatch<SetStateAction<Run[]>>;
  setView: (view: View) => void;
  setNav: (open: boolean) => void;
  setNotice: (notice: null) => void;
  sync?: WorkspaceSync;
};

// A practice session: the queue and answers (lib/practice.ts), and the changes it makes to the
// workspace (a review per checked answer, a run when it ends). Workspace keeps the lists and
// runs; this reports to it and to `sync`.
export function usePracticeActions({
  list,
  settings,
  setLists,
  setRuns,
  setView,
  setNav,
  setNotice,
  sync,
}: Props) {
  const [practice, dispatch] = useReducer(practiceReducer, NO_PRACTICE);
  // The id of the newest answer per word and direction (see check).
  const latestReview = useRef(new Map<string, string>());
  const current = list?.words.find((w) => w.id === practice.queue[practice.index]);

  // Practises the selected list, or `target` (the list just edited, not selected yet).
  function startTest(onlyMistakes = false, target = list) {
    if (!target?.words.length) {
      setView("library");
      setNav(false);
      return;
    }
    const mistakes = onlyMistakes ? practice.results : undefined;
    dispatch({
      type: "start",
      queue: practiceQueue(target.words, settings, Date.now(), mistakes),
    });
    setView("test");
    setNotice(null);
    setNav(false);
  }
  function check(skipped: boolean, timing: TimingSample | null = null) {
    if (!list || !current || practice.feedback || (!practice.answer.trim() && !skipped)) return;
    const { direction } = settings;
    const answeredAt = Date.now();
    const result = grade(current, practice.answer, skipped, settings, answeredAt);
    dispatch({ type: "check", result, skipped });
    setLists((ls) =>
      ls.map((l) =>
        l.id !== list.id
          ? l
          : {
              ...l,
              words: l.words.map((w) =>
                w.id !== current.id
                  ? w
                  : { ...w, [direction]: reviewed(w[direction], result.correct, answeredAt) },
              ),
            },
      ),
    );
    // Take the server's state once saved, so answers from other tabs show here too, unless a
    // later answer for the same word and direction is still on its way.
    const review = {
      id: crypto.randomUUID(),
      wordId: current.id,
      direction,
      correct: result.correct,
      // Only a right, typed answer is timed.
      ...(result.correct && !skipped && timing ? { timing } : {}),
    };
    const key = `${review.wordId}:${direction}`;
    latestReview.current.set(key, review.id);
    void sync?.review(review).then((history) => {
      if (!history || latestReview.current.get(key) !== review.id) return;
      setLists((ls) =>
        ls.map((l) => ({
          ...l,
          words: l.words.map((w) => (w.id === review.wordId ? { ...w, [direction]: history } : w)),
        })),
      );
    });
  }
  function next() {
    if (!list) return;
    if (!isLastWord(practice)) {
      dispatch({ type: "next" });
      return;
    }
    const run: Run = {
      id: crypto.randomUUID(),
      completedAt: Date.now(),
      listId: list.id,
      mode: settings.mode,
      title: listTitle(list),
      from: list.from,
      to: list.to,
      results: practice.results,
    };
    setRuns((r) => [run, ...r].slice(0, 200));
    sync?.completeRun(run);
    setView("results");
  }
  function typeAnswer(answer: string) {
    dispatch({ type: "type", answer });
  }
  return { practice, current, startTest, check, next, typeAnswer };
}
