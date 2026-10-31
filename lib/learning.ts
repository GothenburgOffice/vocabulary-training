export type Direction = "forward" | "reverse";
export type History = { correct: number; wrong: number; streak: number; due: number };
export type Word = { id: string; front: string; back: string; forward: History; reverse: History };
export type List = { id: string; title: string; description: string; from: string; to: string; words: Word[] };
export const freshHistory = (): History => ({ correct: 0, wrong: 0, streak: 0, due: 0 });
export function makeWord(front = "", back = "", id = ""): Word {
  return { id: id || `w-${Math.random().toString(36).slice(2)}`, front, back, forward: freshHistory(), reverse: freshHistory() };
}
export function normalize(text: string, caseSensitive = false, accents = true) {
  // Compare common keyboard/typographic apostrophes equally, without changing
  // stored text, accents on letters, or distinct letter-like marks (e.g. ʻ).
  let value = text.trim().normalize("NFC").replace(/[\u0060\u00B4\u2018\u2019]/g, "'").replace(/\s+/g, " ");
  if (!accents) value = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return caseSensitive ? value : value.toLocaleLowerCase();
}
export function isCorrect(answer: string, expected: string, caseSensitive = false, accents = true) {
  return expected.split("|").some(a => normalize(a, caseSensitive, accents) === normalize(answer, caseSensitive, accents));
}
export function weight(history: History, now: number) {
  const errorRate = (history.wrong + 1) / (history.correct + history.wrong + 2);
  const dueBonus = history.due <= now ? 2 : 0;
  return 1 + 3 * errorRate + dueBonus;
}
export function weightedOrder(words: Word[], direction: Direction, now: number, random = Math.random) {
  return words.map(word => ({ word, key: -Math.log(Math.max(random(), Number.EPSILON)) / weight(word[direction], now) }))
    .sort((a, b) => a.key - b.key).map(item => item.word.id);
}
export function randomOrder(words: Word[], random = Math.random) {
  const ids = words.map(w => w.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
export function reviewed(previous: History, correct: boolean, now: number): History {
  const streak = correct ? previous.streak + 1 : 0;
  const days = correct ? Math.min(30, 2 ** (streak - 1)) : 0;
  return { correct: previous.correct + Number(correct), wrong: previous.wrong + Number(!correct), streak,
    due: correct ? now + days * 86400000 : now + 600000 };
}
export function encodeCSV(list: List) {
  const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return [[list.from, list.to], ...list.words.map(w => [w.front, w.back])].map(row => row.map(quote).join(",")).join("\r\n");
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("A quoted field is not closed. Check the quotation marks.");
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  if (rows.some(r => r.length !== 2)) throw new Error("Each CSV row needs exactly two columns.");
  return rows;
}
