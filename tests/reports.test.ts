import test from "node:test";
import assert from "node:assert/strict";
import type { AiAction } from "../lib/ai-actions.ts";
import { MAX_SPEECH_TEXT } from "../lib/ai-words.ts";
import {
  MAX_REPORT_PROMPT_CHARS,
  REASONS_FOR_KIND,
  ReportLimiter,
  REPORTS_PER_HOUR,
  reportFromAction,
  reportSchema,
} from "../lib/reports.ts";

const action: AiAction = {
  id: "k1x9-abc",
  kind: "speech",
  at: "2026-11-02T10:00:00.000Z",
  wordId: "w1",
  word: "vi ses snart",
  language: "Swedish",
  model: "vendor/tts",
  voice: "Mia",
  prompt: { part: "native" },
};

test("each kind of result offers only its own reasons", () => {
  assert.deepEqual(REASONS_FOR_KIND.speech, [
    "pronunciation",
    "language-accent",
    "garbled-audio",
    "other",
  ]);
  assert.deepEqual(REASONS_FOR_KIND.note, ["incorrect-note", "other"]);
});

test("a report built from a recent result is accepted by the server schema", () => {
  const report = reportFromAction(action, "pronunciation");
  assert.deepEqual(reportSchema.parse(report), report);
  // The optional voice is omitted rather than sent as undefined.
  const noVoice: AiAction = { ...action, voice: undefined };
  assert.equal("voice" in reportFromAction(noVoice, "other"), false);
});

test("a reason that does not apply to the result is refused", () => {
  const wrong = { ...reportFromAction(action, "pronunciation"), kind: "note" };
  assert.equal(reportSchema.safeParse(wrong).success, false);
  const garbledNote = { ...reportFromAction(action, "garbled-audio"), kind: "note" };
  assert.equal(reportSchema.safeParse(garbledNote).success, false);
});

test("unknown fields, bad times and oversize requests are refused", () => {
  const base = reportFromAction(action, "other");
  assert.equal(reportSchema.safeParse({ ...base, wordId: "w1" }).success, false);
  assert.equal(reportSchema.safeParse({ ...base, at: "yesterday" }).success, false);
  assert.equal(reportSchema.safeParse({ ...base, reason: "wrong" }).success, false);
  const huge = { ...base, prompt: { text: "x".repeat(MAX_REPORT_PROMPT_CHARS) } };
  assert.equal(reportSchema.safeParse(huge).success, false);
});

test("the report carries no key and no other learner's data", () => {
  const sent = JSON.stringify(reportFromAction(action, "other"));
  assert.equal(sent.includes("apiKey"), false);
  assert.equal(sent.includes("wordId"), false);
});

test("a long audio text is clipped to what can be read aloud, not refused", () => {
  const long = { ...action, word: "a".repeat(MAX_SPEECH_TEXT + 50) };
  const report = reportFromAction(long, "garbled-audio");
  assert.equal(report.word.length, MAX_SPEECH_TEXT);
  assert.equal(reportSchema.safeParse(report).success, true);
});

test("each account may send a limited number of reports per hour", () => {
  const limiter = new ReportLimiter(3, 1000);
  assert.equal(REPORTS_PER_HOUR, 20);
  for (let i = 0; i < 3; i++) assert.equal(limiter.take("a", 100 + i), true);
  assert.equal(limiter.take("a", 200), false);
  // Another account has its own allowance, and the window moves on.
  assert.equal(limiter.take("b", 200), true);
  assert.equal(limiter.take("a", 1200), true);
});
