import {
  answersFor,
  isCorrect,
  randomOrder,
  spacedOrder,
  weightedOrder,
  type Direction,
  type Word,
} from "./learning";
import type { Result } from "./workspace";

// "adaptive" is Weighted mix; the id predates the name (#2) and is kept in saved settings
// and sessions.
export const MODES = ["adaptive", "spaced", "random"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABELS: Record<Mode, string> = {
  adaptive: "Weighted mix",
  spaced: "Spaced review",
  random: "Random order",
};
export const isMode = (value: unknown): value is Mode =>
  typeof value === "string" && (MODES as readonly string[]).includes(value);
// "Next review in 10 minutes", from a word's due date just after an answer.
export function nextReviewText(due: number, now: number) {
  const minutes = Math.max(1, Math.round((due - now) / 60000));
  if (minutes < 60) return `Next review in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Next review in ${hours} hour${hours === 1 ? "" : "s"}.`;
  const days = Math.round(hours / 24);
  return `Next review in ${days} day${days === 1 ? "" : "s"}.`;
}
export type PracticeSettings = {
  direction: Direction;
  mode: Mode;
  length: number;
  caseSensitive: boolean;
  accents: boolean;
};
export const DEFAULT_SETTINGS: PracticeSettings = {
  direction: "forward",
  mode: "adaptive",
  length: 8,
  caseSensitive: false,
  accents: true,
};

// Practice settings are remembered in the browser (#67): an essential preference, not sent
// anywhere. What comes back is checked field by field; anything else is the default.
export const SETTINGS_KEY = "vocabulary.training:practice-settings";
export function readSettings(stored: string | null): PracticeSettings {
  let value: Partial<Record<keyof PracticeSettings, unknown>> = {};
  try {
    value = JSON.parse(stored ?? "{}") ?? {};
  } catch {}
  const d = DEFAULT_SETTINGS;
  return {
    direction: value.direction === "reverse" ? "reverse" : d.direction,
    mode: isMode(value.mode) ? value.mode : d.mode,
    length: [5, 8, 1000].includes(value.length as number) ? (value.length as number) : d.length,
    caseSensitive: typeof value.caseSensitive === "boolean" ? value.caseSensitive : d.caseSensitive,
    accents: typeof value.accents === "boolean" ? value.accents : d.accents,
  };
}

// One practice session: the words to ask (ids, in order), the current one, the answer being
// typed, the feedback once checked, and every checked answer so far.
export type Feedback = Result & { skipped?: boolean };
export type Practice = {
  queue: string[];
  index: number;
  answer: string;
  feedback: Feedback | null;
  results: Result[];
};
export type PracticeAction =
  | { type: "start"; queue: string[] }
  | { type: "type"; answer: string }
  | { type: "check"; result: Result; skipped: boolean }
  | { type: "next" };

export const NO_PRACTICE: Practice = {
  queue: [],
  index: 0,
  answer: "",
  feedback: null,
  results: [],
};

export const isLastWord = (p: Practice) => p.index + 1 >= p.queue.length;

export function practiceReducer(state: Practice, action: PracticeAction): Practice {
  switch (action.type) {
    case "start":
      return { ...NO_PRACTICE, queue: action.queue };
    case "type":
      return state.feedback ? state : { ...state, answer: action.answer };
    case "check":
      // One answer per word: a second check (a double Enter) changes nothing.
      if (state.feedback) return state;
      return {
        ...state,
        feedback: { ...action.result, skipped: action.skipped },
        results: [...state.results, action.result],
      };
    case "next":
      if (!state.feedback || isLastWord(state)) return state;
      return { ...state, index: state.index + 1, answer: "", feedback: null };
  }
}

// The words for a new session: a sample of the list, or every word answered wrong in the
// last session (`mistakes`), in the order the mode picks.
export function practiceQueue(
  words: Word[],
  settings: Pick<PracticeSettings, "direction" | "mode" | "length">,
  now: number,
  mistakes?: Result[],
) {
  const wrong = new Set(mistakes?.filter((r) => !r.correct).map((r) => r.word.id));
  const pool = mistakes ? words.filter((w) => wrong.has(w.id)) : words;
  const ordered =
    settings.mode === "adaptive"
      ? weightedOrder(pool, settings.direction, now)
      : settings.mode === "spaced"
        ? spacedOrder(pool, settings.direction, now)
        : randomOrder(pool);
  return ordered.slice(0, mistakes ? pool.length : settings.length);
}

export function grade(
  word: Word,
  answer: string,
  skipped: boolean,
  settings: Pick<PracticeSettings, "direction" | "caseSensitive" | "accents">,
  now: number,
): Result {
  const { direction, caseSensitive, accents } = settings;
  return {
    word: { id: word.id, front: word.front, back: word.back },
    answer: skipped ? "Skipped" : answer.trim(),
    correct: !skipped && isCorrect(answer, answersFor(word, direction), caseSensitive, accents),
    direction,
    answeredAt: now,
  };
}
