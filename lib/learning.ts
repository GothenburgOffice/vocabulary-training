export type Direction = "forward" | "reverse";
export type History = { correct: number; wrong: number; streak: number; due: number };
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
export const freshHistory = (): History => ({ correct: 0, wrong: 0, streak: 0, due: 0 });
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
export function reviewed(previous: History, correct: boolean, now: number): History {
  const streak = correct ? previous.streak + 1 : 0;
  const days = correct ? Math.min(30, 2 ** (streak - 1)) : 0;
  return {
    correct: previous.correct + Number(correct),
    wrong: previous.wrong + Number(!correct),
    streak,
    due: correct ? now + days * 86400000 : now + 600000,
  };
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
