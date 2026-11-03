import { test } from "node:test";
import assert from "node:assert/strict";
import {
  directionOf,
  answersFor,
  splitCSVAnswers,
  wordFromCSV,
  promptOf,
  normalize,
  isCorrect,
  makeWord,
  weightedOrder,
  randomOrder,
  weight,
  reviewed,
  retrievability,
  spacedOrder,
  freshHistory,
  listStats,
  listTitle,
  parseCSV,
  encodeCSV,
} from "../lib/learning.ts";
test("answer policies and alternatives", () => {
  assert.equal(normalize("  Hello   world  "), "hello world");
  assert.ok(isCorrect("  HELLO ", ["hi", "hello"]));
  // "|" is plain text outside CSV files.
  assert.ok(!isCorrect("hello", "hi | hello"));
  assert.ok(isCorrect("hi | hello", "hi | hello"));
  assert.ok(!isCorrect("CAFE", "café", false, true));
  assert.ok(isCorrect("CAFE", "café", false, false));
  assert.ok(!isCorrect("Hello", "hello", true));
  assert.ok(isCorrect("e\u0301", "é"));
});
test("apostrophe styles compare equally in answers and saved alternatives", () => {
  const styles = ["'", "`", "´", "‘", "’"];
  for (const answer of styles)
    for (const expected of styles) {
      for (const [prefix, suffix] of [
        ["s", "il vous plaît"],
        ["don", "t"],
        ["п", "ять"],
      ]) {
        assert.ok(isCorrect(`${prefix}${answer}${suffix}`, `${prefix}${expected}${suffix}`));
        assert.ok(
          isCorrect(
            `${prefix}${answer}${suffix}`,
            ["other", `${prefix}${expected}${suffix}`],
            true,
          ),
        );
        assert.ok(
          isCorrect(`${prefix}${answer}${suffix}`, `${prefix}${expected}${suffix}`, false, false),
        );
      }
    }
});
test("apostrophe normalization preserves strict accents and other distinctions", () => {
  for (const mark of ["'", "`", "´", "‘", "’"]) {
    assert.ok(isCorrect(`s${mark}il vous plaît`, "s'il vous plaît"));
    assert.ok(!isCorrect(`s${mark}il vous plait`, "s'il vous plaît"));
    assert.ok(!isCorrect(`l${mark}ile`, "l'île"));
    assert.ok(isCorrect(`l${mark}i\u0302le`, "l'île"));
    assert.ok(!isCorrect(`l${mark}école`, "l'ècole"));
  }
  assert.ok(!isCorrect("i", "î"));
  assert.ok(!isCorrect("e", "é"));
  assert.ok(!isCorrect("sil", "s'il"));
  assert.ok(!isCorrect("s-il", "s'il"));
  assert.ok(!isCorrect('s"il', "s'il"));
  assert.ok(!isCorrect("a\u02BBa", "a'a"));
  assert.ok(!isCorrect("a\u02BCa", "a'a"));
  assert.ok(!isCorrect("à plus tard", "à bientôt"));
});
test("weighted order includes each word exactly once", () => {
  const words = [makeWord("a", "b", "a"), makeWord("c", "d", "b"), makeWord("e", "f", "c")];
  const ids = weightedOrder(words, "forward", 100, () => 0.5);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.ok(
    weight({ ...freshHistory(), correct: 1, wrong: 5, streak: 0, due: 0 }, 100) >
      weight({ ...freshHistory(), correct: 5, wrong: 0, streak: 3, due: 1000 }, 100),
  );
  assert.equal(new Set(randomOrder(words)).size, 3);
});
const MINUTE = 60000;
const DAY = 86400000;
test("FSRS scheduling: short steps, then days; a lapse comes back in 10 minutes", () => {
  const word = makeWord();
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  // A new word answered right: the second short step, 10 minutes.
  let h = reviewed(word.forward, true, t0);
  assert.equal(h.state, "learning");
  assert.equal(h.due, t0 + 10 * MINUTE);
  assert.equal(h.lastReview, t0);
  // Right again after the step: day-long reviews.
  const t1 = t0 + 10 * MINUTE;
  h = reviewed(h, true, t1);
  assert.equal(h.state, "review");
  assert.ok(h.due >= t1 + DAY, "at least a day");
  assert.equal(h.streak, 2);
  // Remembered after a longer gap, the interval grows more than when reviewed early.
  const onTime = reviewed(h, true, h.due);
  const early = reviewed(h, true, t1 + MINUTE);
  assert.ok(onTime.stability > early.stability);
  assert.ok(onTime.due - h.due > early.due - (t1 + MINUTE));
  // A wrong answer: relearning, back in 10 minutes, harder, one lapse.
  const t2 = onTime.lastReview!;
  const lapse = reviewed(onTime, false, t2 + 20 * DAY);
  assert.equal(lapse.state, "relearning");
  assert.equal(lapse.due, t2 + 20 * DAY + 10 * MINUTE);
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.streak, 0);
  assert.ok(lapse.stability < onTime.stability);
  assert.ok(lapse.difficulty > onTime.difficulty);
  assert.equal(lapse.correct + lapse.wrong, 4);
  // The other direction is untouched, and the same answers always give the same schedule.
  assert.equal(word.reverse.correct, 0);
  assert.deepEqual(reviewed(word.forward, true, t0), reviewed(word.forward, true, t0));
});
test("retrievability: none for a new word, falling over time", () => {
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  assert.equal(retrievability(freshHistory(), t0), null);
  const h = reviewed(reviewed(freshHistory(), true, t0), true, t0 + 10 * MINUTE);
  const soon = retrievability(h, t0 + DAY)!;
  const later = retrievability(h, t0 + 30 * DAY)!;
  assert.ok(soon > later && later > 0 && soon <= 1);
});
test("spaced order: due words most forgotten first, then new words, then the rest", () => {
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  const learned = (days: number) =>
    reviewed(reviewed(freshHistory(), true, t0 - days * DAY), true, t0 - days * DAY + 10 * MINUTE);
  const word = (id: string, forward = freshHistory()) => ({ ...makeWord(id, id, id), forward });
  const words = [
    word("new-1"),
    word("fresh", learned(0)), // reviewed just now: not due
    word("long-ago", learned(60)), // long overdue
    word("new-2"),
    word("a-while", learned(5)), // just due
  ];
  assert.deepEqual(spacedOrder(words, "forward", t0), [
    "long-ago",
    "a-while",
    "new-1",
    "new-2",
    "fresh",
  ]);
  // The reverse direction has no history: list order.
  assert.deepEqual(
    spacedOrder(words, "reverse", t0),
    words.map((w) => w.id),
  );
});
test("CSV handles old codes, quoting, commas and line endings", () => {
  assert.deepEqual(parseCSV("\uFEFFsv,fr\r\nhej,bonjour\r\n"), [
    ["sv", "fr"],
    ["hej", "bonjour"],
  ]);
  const list = {
    id: "1",
    title: "test",
    description: "",
    from: "English",
    to: "French",
    words: [makeWord('hi, "friend"', "bonjour\nami")],
  };
  assert.deepEqual(parseCSV(encodeCSV(list)), [
    ["English", "French"],
    ['hi, "friend"', "bonjour\nami"],
  ]);
  assert.throws(() => parseCSV('sv,fr\n"unfinished,bonjour'));
  assert.throws(() => parseCSV("sv,fr\nhello,bonjour,extra"));
});

test("forward practice accepts any accepted answer; reverse accepts only the native text", () => {
  const word = makeWord("katt", "chat", "", ["minou"]);
  assert.deepEqual(answersFor(word, "forward"), ["chat", "minou"]);
  assert.deepEqual(answersFor(word, "reverse"), ["katt"]);
  assert.ok(isCorrect("Minou", answersFor(word, "forward")));
  assert.ok(!isCorrect("minou", answersFor(word, "reverse")));
  assert.deepEqual(answersFor(makeWord("hund", "chien"), "forward"), ["chien"]);
});

test("CSV keeps accepted answers with | in the file only", () => {
  const word = wordFromCSV(" katt ", " chat | minou |  ");
  assert.deepEqual([word.front, word.back, word.accepted], ["katt", "chat", ["minou"]]);
  assert.equal(wordFromCSV("hund", "chien").accepted, undefined);
  const list = {
    id: "1",
    title: "t",
    description: "",
    from: "Swedish",
    to: "French",
    words: [word],
  };
  const [, row] = parseCSV(encodeCSV(list));
  assert.deepEqual(row, ["katt", "chat|minou"]);
  const again = wordFromCSV(row[0], row[1]);
  assert.deepEqual([again.back, again.accepted], ["chat", ["minou"]]);
});

test("CSV answers escape a literal | and backslash so they survive export and import", () => {
  // The CSV cells are written as they appear in the file.
  const file = String.raw;
  assert.deepEqual(splitCSVAnswers(file`Ju\|'hoan|chat`), ["Ju|'hoan", "chat"]);
  assert.deepEqual(splitCSVAnswers(file`a\\|b`), ["a\\", "b"]);
  // A backslash before anything else stays as written.
  assert.deepEqual(splitCSVAnswers(file`a\b`), [file`a\b`]);
  const word = makeWord("klick", "Ju|'hoan", "", ["back\\slash", "ends with \\"]);
  const list = {
    id: "1",
    title: "t",
    description: "",
    from: "Swedish",
    to: "French",
    words: [word],
  };
  const [, row] = parseCSV(encodeCSV(list));
  assert.equal(row[1], file`Ju\|'hoan|back\\slash|ends with \\`);
  const again = wordFromCSV(row[0], row[1]);
  assert.deepEqual([again.back, again.accepted], ["Ju|'hoan", ["back\\slash", "ends with \\"]]);
});

test("directions are stored as the side that was shown", () => {
  assert.equal(promptOf("forward"), "native");
  assert.equal(promptOf("reverse"), "learning");
  assert.equal(directionOf(promptOf("forward")), "forward");
  assert.equal(directionOf(promptOf("reverse")), "reverse");
});

test("new words get UUIDs, which the database uses as keys", () => {
  assert.match(
    makeWord().id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(makeWord("a", "b", "given").id, "given");
});
test("list statistics count established and due words per direction", () => {
  const now = 1_000_000;
  const fresh = makeWord("ny", "nouveau");
  const due = {
    ...makeWord("hej", "bonjour"),
    forward: { ...freshHistory(), correct: 1, wrong: 1, streak: 0, due: now },
  };
  const later = { ...freshHistory(), correct: 3, wrong: 0, streak: 3, due: now + 1 };
  const known = { ...makeWord("tack", "merci"), forward: later, reverse: later };
  assert.deepEqual(listStats({ words: [fresh, due, known] }, "forward", now), {
    learned: 1,
    due: 1,
  });
  assert.deepEqual(listStats({ words: [fresh, due, known] }, "reverse", now), {
    learned: 1,
    due: 0,
  });
});
test("a list without a name is shown as Untitled list", () => {
  assert.equal(listTitle({ title: "Basics" }), "Basics");
  assert.equal(listTitle({ title: "  " }), "Untitled list");
});
test("a word seeded from the old schedule (migration 013) schedules normally", () => {
  const due = Date.parse("2026-11-04T10:00:00Z");
  const seeded = {
    ...freshHistory(),
    correct: 5,
    wrong: 0,
    streak: 5,
    due,
    state: "review" as const,
    stability: 16,
    difficulty: 5,
    scheduledDays: 16,
    lastReview: due - 16 * DAY,
  };
  const right = reviewed(seeded, true, due);
  assert.equal(right.state, "review");
  assert.ok(right.stability > 16);
  assert.ok(right.due > due + 16 * DAY);
  const wrong = reviewed(seeded, false, due);
  assert.equal(wrong.state, "relearning");
  assert.equal(wrong.due, due + 10 * MINUTE);
});
