import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dailyLetters,
  DEFAULT_LIMITS,
  limitsSchema,
  limitsToSettings,
  parseLimits,
} from "../lib/ai-limits.ts";

test("limits come from site settings, with defaults for anything missing or invalid", () => {
  assert.deepEqual(parseLimits(new Map()), DEFAULT_LIMITS);
  const limits = parseLimits(
    new Map([
      ["limits.speech.letters_per_minute", "100"],
      ["limits.speech.letters_per_day.plus", " 5000 "],
      ["limits.speech.request_block_seconds", "4"],
      ["limits.note.cooldown_ms", "0"],
      // Invalid values fall back to the default.
      ["limits.note.letters_per_minute", "-5"],
      ["limits.speech.letters_per_day.basic", "lots"],
    ]),
  );
  assert.equal(limits.speech.lettersPerMinute, 100);
  assert.equal(limits.speech.lettersPerDay.plus, 5000);
  assert.equal(limits.speech.lettersPerDay.basic, DEFAULT_LIMITS.speech.lettersPerDay.basic);
  assert.equal(limits.speechBlockMs, 4000);
  assert.equal(limits.note.cooldownMs, 0);
  assert.equal(limits.note.lettersPerMinute, DEFAULT_LIMITS.note.lettersPerMinute);
  // Values outside what admin may save fall back too, so whatever is shown can be saved.
  const outside = parseLimits(
    new Map([
      ["limits.speech.cooldown_ms", "900000"],
      ["limits.speech.request_block_seconds", "0"],
      ["limits.note.letters_per_minute", "0"],
    ]),
  );
  assert.equal(outside.speech.cooldownMs, DEFAULT_LIMITS.speech.cooldownMs);
  assert.equal(outside.speechBlockMs, DEFAULT_LIMITS.speechBlockMs);
  // 0 letters is a valid limit: no limit.
  assert.equal(outside.note.lettersPerMinute, 0);
});

test("speech and notes have separate budgets, per account type", () => {
  const speech = { ...DEFAULT_LIMITS.speech, lettersPerDay: { basic: 1, plus: 2 } };
  assert.equal(dailyLetters(speech, "plus"), 2);
  assert.equal(dailyLetters(speech, "basic"), 1);
  // An unknown account type gets the basic budget.
  assert.equal(dailyLetters(speech, "gold"), 1);
  assert.notEqual(DEFAULT_LIMITS.speech, DEFAULT_LIMITS.note);
});

test("limits saved from admin read back the same, and invalid ones are refused", () => {
  const limits = {
    speech: { lettersPerMinute: 100, lettersPerDay: { basic: 1000, plus: 3000 }, cooldownMs: 0 },
    note: { lettersPerMinute: 50, lettersPerDay: { basic: 500, plus: 900 }, cooldownMs: 2500 },
    speechBlockMs: 15_000,
  };
  assert.deepEqual(parseLimits(new Map(limitsToSettings(limits))), limits);
  assert.deepEqual(parseLimits(new Map(limitsToSettings(DEFAULT_LIMITS))), DEFAULT_LIMITS);
  assert.ok(limitsSchema.safeParse(limits).success);
  for (const bad of [
    { ...limits, speechBlockMs: 500 },
    { ...limits, speechBlockMs: 1500 },
    { ...limits, speech: { ...limits.speech, lettersPerMinute: -1 } },
    { ...limits, note: { ...limits.note, lettersPerMinute: 1.5 } },
    { ...limits, extra: true },
  ])
    assert.equal(limitsSchema.safeParse(bad).success, false);
});
