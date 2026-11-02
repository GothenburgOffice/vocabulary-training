import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWord } from "../lib/learning.ts";
import {
  DEFAULT_SETTINGS,
  NO_PRACTICE,
  grade,
  isLastWord,
  practiceQueue,
  practiceReducer,
  readSettings,
  type Practice,
} from "../lib/practice.ts";

const hej = makeWord("hej", "bonjour", "w1");
const tack = makeWord("tack", "merci", "w2", ["merci bien"]);
const katt = makeWord("katt", "chat", "w3");
const words = [hej, tack, katt];
const now = Date.UTC(2026, 10, 2);

test("a session moves word by word: type, check, next", () => {
  let p = practiceReducer(NO_PRACTICE, { type: "start", queue: ["w1", "w2"] });
  assert.deepEqual(p, { ...NO_PRACTICE, queue: ["w1", "w2"] });
  // Next does nothing before an answer is checked.
  assert.equal(practiceReducer(p, { type: "next" }), p);

  p = practiceReducer(p, { type: "type", answer: "bonjour" });
  const result = grade(hej, p.answer, false, DEFAULT_SETTINGS, now);
  p = practiceReducer(p, { type: "check", result, skipped: false });
  assert.deepEqual(p.feedback, { ...result, skipped: false });
  assert.deepEqual(p.results, [result]);
  // The answer is locked once checked, and a second check changes nothing.
  assert.equal(practiceReducer(p, { type: "type", answer: "x" }), p);
  assert.equal(practiceReducer(p, { type: "check", result, skipped: false }), p);
  assert.equal(isLastWord(p), false);

  p = practiceReducer(p, { type: "next" });
  assert.deepEqual([p.index, p.answer, p.feedback, p.results.length], [1, "", null, 1]);
  p = practiceReducer(p, {
    type: "check",
    result: grade(tack, "", true, DEFAULT_SETTINGS, now),
    skipped: true,
  });
  assert.equal(isLastWord(p), true);
  // The last word stays until the session is completed.
  assert.equal(practiceReducer(p, { type: "next" }), p);

  // Starting again clears everything.
  const again: Practice = practiceReducer(p, { type: "start", queue: ["w3"] });
  assert.deepEqual(again, { ...NO_PRACTICE, queue: ["w3"] });
});

test("grading uses the direction, the accepted answers and the answer settings", () => {
  assert.deepEqual(grade(tack, "  merci bien ", false, DEFAULT_SETTINGS, now), {
    word: { id: "w2", front: "tack", back: "merci" },
    answer: "merci bien",
    correct: true,
    direction: "forward",
    answeredAt: now,
  });
  // Reverse asks for the native side; alternatives only count forward.
  const reverse = { ...DEFAULT_SETTINGS, direction: "reverse" as const };
  assert.equal(grade(tack, "tack", false, reverse, now).correct, true);
  assert.equal(grade(tack, "merci bien", false, reverse, now).correct, false);
  // A skip is never correct, even with the right text typed.
  assert.deepEqual(
    [
      grade(hej, "bonjour", true, DEFAULT_SETTINGS, now).correct,
      grade(hej, "x", true, DEFAULT_SETTINGS, now).answer,
    ],
    [false, "Skipped"],
  );
  assert.equal(
    grade(hej, "Bonjour", false, { ...DEFAULT_SETTINGS, caseSensitive: true }, now).correct,
    false,
  );
  const cafe = makeWord("kaffe", "café");
  assert.equal(grade(cafe, "cafe", false, DEFAULT_SETTINGS, now).correct, false);
  assert.equal(
    grade(cafe, "cafe", false, { ...DEFAULT_SETTINGS, accents: false }, now).correct,
    true,
  );
});

test("a session samples the list without repeats, or retries only the mistakes", () => {
  for (const mode of ["adaptive", "random"] as const) {
    const two = practiceQueue(words, { ...DEFAULT_SETTINGS, mode, length: 2 }, now);
    assert.equal(two.length, 2);
    assert.equal(new Set(two).size, 2);
    const all = practiceQueue(words, { ...DEFAULT_SETTINGS, mode, length: 1000 }, now);
    assert.deepEqual([...all].sort(), ["w1", "w2", "w3"]);
  }
  const results = [
    grade(hej, "bonjour", false, DEFAULT_SETTINGS, now),
    grade(tack, "mercy", false, DEFAULT_SETTINGS, now),
    grade(katt, "", true, DEFAULT_SETTINGS, now),
  ];
  // Every mistake comes back, whatever the session size.
  const retry = practiceQueue(words, { ...DEFAULT_SETTINGS, length: 1 }, now, results);
  assert.deepEqual([...retry].sort(), ["w2", "w3"]);
});

test("remembered practice settings are checked, with defaults for anything else", () => {
  const saved = {
    direction: "reverse",
    mode: "random",
    length: 5,
    caseSensitive: true,
    accents: false,
  };
  assert.deepEqual(readSettings(JSON.stringify(saved)), saved);
  assert.deepEqual(readSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings("not json"), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings("null"), DEFAULT_SETTINGS);
  assert.deepEqual(
    readSettings(JSON.stringify({ direction: "sideways", length: 3, accents: "yes" })),
    DEFAULT_SETTINGS,
  );
});
