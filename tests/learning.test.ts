import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  isCorrect,
  makeWord,
  weightedOrder,
  randomOrder,
  weight,
  reviewed,
  parseCSV,
  encodeCSV,
} from "../lib/learning.ts";
test("answer policies and alternatives", () => {
  assert.equal(normalize("  Hello   world  "), "hello world");
  assert.ok(isCorrect("  HELLO ", "hi | hello"));
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
          isCorrect(`${prefix}${answer}${suffix}`, `other | ${prefix}${expected}${suffix}`, true),
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
    weight({ correct: 1, wrong: 5, streak: 0, due: 0 }, 100) >
      weight({ correct: 5, wrong: 0, streak: 3, due: 1000 }, 100),
  );
  assert.equal(new Set(randomOrder(words)).size, 3);
});
test("review scheduling updates one independent history", () => {
  const word = makeWord();
  let h = reviewed(word.forward, true, 0);
  assert.equal(h.due, 86400000);
  h = reviewed(h, true, 0);
  assert.equal(h.due, 2 * 86400000);
  h = reviewed(h, false, 100);
  assert.equal(h.due, 600100);
  assert.equal(h.streak, 0);
  assert.equal(word.reverse.correct, 0);
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
