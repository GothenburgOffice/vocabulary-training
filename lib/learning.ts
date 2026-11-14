import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";

export type Direction = "forward" | "reverse";
// FSRS's card states (#2): a new word, its first short steps, day-long reviews, and the short
// steps again after a lapse.
const FSRS_STATES = ["new", "learning", "review", "relearning"] as const;
type FsrsState = (typeof FSRS_STATES)[number];
// One direction of a word: answer counts, the correct streak (for the library's labels), the
// next review, and the FSRS memory state that sets it.
export type History = {
  correct: number;
  wrong: number;
  streak: number;
  due: number;
  // Days until the chance of recall falls to 90%; 1 (easy) to 10 (hard).
  stability: number;
  difficulty: number;
  state: FsrsState;
  // Which short (re)learning step the word is on.
  steps: number;
  // Wrong answers once the word had reached day-long reviews.
  lapses: number;
  scheduledDays: number;
  lastReview: number | null;
};
// front is the native prompt and back the primary answer. accepted holds any further answers
// accepted in the learning language (from CSV import for now); reverse practice shows back
// and accepts only front.
export type Word = {
  id: string;
  front: string;
  back: string;
  accepted?: string[];
  forward: History;
  reverse: History;
};
export type List = {
  id: string;
  title: string;
  description: string;
  from: string;
  to: string;
  words: Word[];
};
export const freshHistory = (): History => ({
  correct: 0,
  wrong: 0,
  streak: 0,
  due: 0,
  stability: 0,
  difficulty: 0,
  state: "new",
  steps: 0,
  lapses: 0,
  scheduledDays: 0,
  lastReview: null,
});
export function makeWord(front = "", back = "", id = "", accepted: string[] = []): Word {
  return {
    id: id || crypto.randomUUID(),
    front,
    back,
    ...(accepted.length ? { accepted } : {}),
    forward: freshHistory(),
    reverse: freshHistory(),
  };
}
// Stored as which side was shown: "forward" shows the native side (front) and asks for the
// learning side (back).
export const promptOf = (direction: Direction) => (direction === "forward" ? "native" : "learning");
export const directionOf = (prompt: string): Direction =>
  prompt === "native" ? "forward" : "reverse";
export function normalize(text: string, caseSensitive = false, accents = true) {
  // Compare common keyboard/typographic apostrophes equally, without changing
  // stored text, accents on letters, or distinct letter-like marks (e.g. ʻ). With the
  // defaults this matches vocabulary_key() in db/migrations/005; keep the two in step.
  let value = text
    .trim()
    .normalize("NFC")
    .replace(/[\u0060\u00B4\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
  if (!accents) value = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return caseSensitive ? value : value.toLocaleLowerCase();
}
export function isCorrect(
  answer: string,
  expected: string | readonly string[],
  caseSensitive = false,
  accents = true,
) {
  const typed = normalize(answer, caseSensitive, accents);
  return (typeof expected === "string" ? [expected] : expected).some(
    (a) => normalize(a, caseSensitive, accents) === typed,
  );
}
// What counts as correct for a prompt: forward (native shown) accepts the primary answer or
// any further accepted one; reverse (primary answer shown) accepts only the native text.
export function answersFor(word: Pick<Word, "front" | "back" | "accepted">, direction: Direction) {
  return direction === "forward" ? [word.back, ...(word.accepted ?? [])] : [word.front];
}
export function weight(history: History, now: number) {
  const errorRate = (history.wrong + 1) / (history.correct + history.wrong + 2);
  const dueBonus = history.due <= now ? 2 : 0;
  return 1 + 3 * errorRate + dueBonus;
}
export function weightedOrder(
  words: Word[],
  direction: Direction,
  now: number,
  random = Math.random,
) {
  return words
    .map((word) => ({
      word,
      key: -Math.log(Math.max(random(), Number.EPSILON)) / weight(word[direction], now),
    }))
    .sort((a, b) => a.key - b.key)
    .map((item) => item.word.id);
}
export function randomOrder(words: Word[], random = Math.random) {
  const ids = words.map((w) => w.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
// A list may have no name while it is being written (#67).
export const listTitle = (list: Pick<List, "title">) => list.title.trim() || "Untitled list";
// Per list and direction: words established (3+ correct in a row) and words studied before
// that are due for review now.
export function listStats(list: Pick<List, "words">, direction: Direction, now: number) {
  const histories = list.words.map((w) => w[direction]);
  return {
    learned: histories.filter((h) => h.streak >= 3).length,
    due: histories.filter((h) => h.due > 0 && h.due <= now).length,
  };
}
// FSRS with its default model weights and settings: 90% target retention, short steps of 1
// and 10 minutes for new words and 10 minutes after a lapse, then day-long intervals. No
// fuzz, so the same answers always give the same schedule.
const scheduler = fsrs({ enable_fuzz: false });
const STATE_OF: Record<FsrsState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
function card(h: History, now: number): Card {
  if (h.state === "new") return createEmptyCard(new Date(now));
  const last = h.lastReview ?? h.due;
  return {
    due: new Date(h.due),
    stability: h.stability,
    difficulty: h.difficulty,
    elapsed_days: Math.max(0, Math.floor((now - last) / 86400000)),
    scheduled_days: h.scheduledDays,
    learning_steps: h.steps,
    reps: h.correct + h.wrong,
    lapses: h.lapses,
    state: STATE_OF[h.state],
    last_review: new Date(last),
  };
}
// One typed answer, graded right or wrong (#2): right is FSRS's Good and wrong its Again. The
// answer counts in every practice mode, so the one due date stays current.
export function reviewed(previous: History, correct: boolean, now: number): History {
  const next = scheduler.next(
    card(previous, now),
    new Date(now),
    correct ? Rating.Good : Rating.Again,
  ).card;
  return {
    correct: previous.correct + Number(correct),
    wrong: previous.wrong + Number(!correct),
    streak: correct ? previous.streak + 1 : 0,
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    state: FSRS_STATES[next.state],
    steps: next.learning_steps,
    lapses: next.lapses,
    scheduledDays: next.scheduled_days,
    lastReview: now,
  };
}
// The chance of recalling a word now (0 to 1), or null for a word never answered that way.
export function retrievability(h: History, now: number) {
  if (h.state === "new") return null;
  return scheduler.get_retrievability(card(h, now), new Date(now), false);
}
// Spaced review: due words first, the most forgotten first; then new words in list order;
// then the rest, the most forgotten first, so a session is as long as the learner chose.
export function spacedOrder(words: Word[], direction: Direction, now: number) {
  const rank = (w: Word) => {
    const h = w[direction];
    const r = retrievability(h, now);
    if (r === null) return [1, 0];
    return [h.due <= now ? 0 : 2, r];
  };
  return words
    .map((word, index) => ({ word, index, rank: rank(word) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map((item) => item.word.id);
}
// In CSV files only, "|" separates the accepted answers in the learning column: the first is
// the primary answer. Stored words keep them apart (Word.accepted). "\|" is a literal "|"
// (some languages write click consonants with it) and "\\" a literal "\"; a backslash before
// anything else stays as written.
export const csvAnswers = (word: Pick<Word, "back" | "accepted">) =>
  [word.back, ...(word.accepted ?? [])].map((a) => a.replace(/[\\|]/g, "\\$&")).join("|");
export function splitCSVAnswers(cell: string): string[] {
  const answers: string[] = [];
  let current = "";
  for (let i = 0; i < cell.length; i++) {
    const c = cell[i];
    if (c === "\\" && (cell[i + 1] === "|" || cell[i + 1] === "\\")) current += cell[++i];
    else if (c === "|") {
      answers.push(current);
      current = "";
    } else current += c;
  }
  answers.push(current);
  return answers.map((a) => a.trim());
}
export function wordFromCSV(front: string, answers: string) {
  const [back = "", ...accepted] = splitCSVAnswers(answers);
  return makeWord(front.trim(), back, "", accepted.filter(Boolean));
}
export function encodeCSV(list: List) {
  const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [[list.from, list.to], ...list.words.map((w) => [w.front, csvAnswers(w)])]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("A quoted field is not closed. Check the quotation marks.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.some((r) => r.length !== 2)) throw new Error("Each CSV row needs exactly two columns.");
  return rows;
}
