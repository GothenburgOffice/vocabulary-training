import assert from "node:assert/strict";
import { test } from "node:test";
import { letterCount, MAX_SPEECH_TEXT, noteInput, speechText } from "../lib/ai-words.ts";

const word = {
  native: "vacker",
  baseLanguage: "Swedish",
  learningLanguage: "English",
  answers: ["beautiful", "pretty", "lovely"],
};

test("speech reads the stored word: a side, or every answer joined with semicolons", () => {
  assert.deepEqual(speechText(word, "native"), { text: "vacker", language: "Swedish" });
  assert.deepEqual(speechText(word, "learning"), { text: "beautiful", language: "English" });
  assert.deepEqual(speechText(word, "answers"), {
    text: "beautiful; pretty; lovely",
    language: "English",
  });
  // Answers that don't fit are left out whole, never cut.
  const long = { ...word, answers: Array.from({ length: 21 }, (_, i) => `${i}`.repeat(200)) };
  const text = speechText(long, "answers").text;
  assert.ok(text.length <= MAX_SPEECH_TEXT);
  assert.ok(text.split("; ").every((a) => a.length === 200));
});

test("a note's input comes from the stored word, with the grade worked out on the server", () => {
  const settings = { requireAccents: true, caseSensitive: false };
  const forward = noteInput(word, { direction: "forward", answer: "handsome", ...settings });
  assert.deepEqual(forward, {
    sourceLanguage: "Swedish",
    targetLanguage: "English",
    explanationLanguage: "Swedish",
    source: "vacker",
    reference: "beautiful",
    accepted: ["pretty", "lovely"],
    answer: "handsome",
    requireAccents: true,
    caseSensitive: false,
    correct: false,
  });
  assert.equal(
    noteInput(word, { direction: "forward", answer: "Lovely", ...settings }).correct,
    true,
  );
  // In reverse the learner answers in their own language; further answers aren't involved.
  const reverse = noteInput(word, { direction: "reverse", answer: "vackert", ...settings });
  assert.deepEqual(
    [reverse.source, reverse.reference, reverse.accepted, reverse.correct],
    ["beautiful", "vacker", undefined, false],
  );
});

test("letters are counted as characters, so a ё or 冰 counts once", () => {
  assert.equal(letterCount("ребёнок", "冰糖", "a; b"), 7 + 2 + 4);
});
