import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AnswerClock,
  DEFAULT_TIMING,
  FRESH_STATS,
  MIN_SAMPLES,
  bucketOf,
  observe,
  parseTimingSettings,
  shareAtOrAbove,
  timingSettingsSchema,
  timingToSettings,
  usableSample,
  type TimingSample,
} from "../lib/timing.ts";
import { reviewSchema } from "../lib/validation.ts";

test("the clock counts the time before typing and pauses past the cutoff", () => {
  const clock = new AnswerClock(1000);
  clock.start(0);
  // 2 s before the first key, then ordinary typing gaps.
  clock.input(2000);
  clock.input(2300);
  clock.input(2600);
  // A 2.5 s pause: 1.5 s of it counts.
  clock.input(5100);
  // Enter 0.4 s after the last key: under the cutoff.
  assert.deepEqual(clock.finish(5500, "keyboard"), {
    input: "keyboard",
    activeMs: 5500,
    beforeMs: 2000,
    pauseMs: 1500,
  });
  // A long wait before pressing Enter counts too.
  clock.start(0);
  clock.input(500);
  assert.equal(clock.finish(4500, "touch")!.pauseMs, 3000);
});

test("the clock leaves out time with the tab hidden, and needs typing", () => {
  const clock = new AnswerClock(1000);
  clock.start(0);
  clock.visibility(true, 1000);
  clock.visibility(false, 61_000);
  clock.input(62_000);
  clock.visibility(true, 62_500);
  clock.visibility(false, 90_000);
  clock.input(90_200);
  assert.deepEqual(clock.finish(90_400, "keyboard"), {
    input: "keyboard",
    activeMs: 2900,
    beforeMs: 2000,
    pauseMs: 0,
  });
  // Opened in a hidden tab: the clock starts when the tab is shown.
  clock.start(0, true);
  clock.visibility(false, 10_000);
  clock.input(11_000);
  assert.equal(clock.finish(11_000, "keyboard")!.beforeMs, 1000);
  // No typing, no timing.
  clock.start(0);
  assert.equal(clock.finish(3000, "keyboard"), null);
});

test("an answer is scored only against an established usual, and a long one stands out", () => {
  const sample = (beforeMs: number): TimingSample => ({
    input: "keyboard",
    activeMs: beforeMs + 1000,
    beforeMs,
    pauseMs: 0,
  });
  let stats = FRESH_STATS;
  for (let i = 0; i < MIN_SAMPLES; i++) {
    const { stats: next, z } = observe(stats, sample(800 + (i % 5) * 100));
    assert.equal(z, null, `answer ${i + 1}`);
    stats = next;
  }
  assert.equal(stats.samples, MIN_SAMPLES);
  const usual = observe(stats, sample(1000)).z!;
  const slow = observe(stats, sample(8000)).z!;
  assert.ok(Math.abs(usual) < 1, String(usual));
  assert.ok(slow > 3, String(slow));
  // A slow typist's usual is their own: the same 8 s is not unusual for them.
  let slower = FRESH_STATS;
  for (let i = 0; i < MIN_SAMPLES; i++)
    slower = observe(slower, sample(7000 + (i % 5) * 500)).stats;
  assert.ok(observe(slower, sample(8000)).z! < 1);
});

test("unusable samples: walked away, or more hesitation than time", () => {
  assert.equal(usableSample({ input: "touch", activeMs: 200_000, beforeMs: 1, pauseMs: 0 }), false);
  assert.equal(
    usableSample({ input: "touch", activeMs: 1000, beforeMs: 900, pauseMs: 200 }),
    false,
  );
  assert.equal(usableSample({ input: "touch", activeMs: 1000, beforeMs: 600, pauseMs: 200 }), true);
});

test("the calibration counts: quarter steps, and the share at a threshold", () => {
  assert.equal(bucketOf(0), 0);
  assert.equal(bucketOf(2.1), 8);
  assert.equal(bucketOf(-1.9), -8);
  assert.equal(bucketOf(-10), -8);
  assert.equal(bucketOf(99), 20);
  const buckets = new Map([
    [0, 90],
    [8, 6],
    [12, 4],
  ]);
  assert.equal(shareAtOrAbove(buckets, 2), 0.1);
  assert.equal(shareAtOrAbove(buckets, 2.25), 0.04);
  assert.equal(shareAtOrAbove(new Map(), 2), 0);
});

test("timing settings: defaults for anything missing or out of range, saved and read back", () => {
  assert.deepEqual(parseTimingSettings(new Map()), DEFAULT_TIMING);
  const odd = new Map([
    ["timing.keyboard_cutoff_ms", "50"],
    ["timing.touch_cutoff_ms", "nope"],
    ["timing.hard_threshold", "9"],
  ]);
  assert.deepEqual(parseTimingSettings(odd), DEFAULT_TIMING);
  const changed = { cutoffMs: { keyboard: 800, touch: 2000 }, hardThreshold: 2.5 };
  assert.deepEqual(parseTimingSettings(new Map(timingToSettings(changed))), changed);
  assert(timingSettingsSchema.safeParse(changed).success);
  assert.equal(timingSettingsSchema.safeParse({ ...changed, hardThreshold: 2.3 }).success, false);
  assert.equal(
    timingSettingsSchema.safeParse({ ...changed, cutoffMs: { keyboard: 100, touch: 2000 } })
      .success,
    false,
  );
});

test("a review carries timing only for a right answer, in the expected shape", () => {
  const review = {
    id: "00000000-0000-4000-8000-000000000001",
    wordId: "00000000-0000-4000-8000-000000000002",
    direction: "forward",
    correct: true,
  };
  const timing = { input: "keyboard", activeMs: 3000, beforeMs: 1200, pauseMs: 0 };
  assert(reviewSchema.safeParse(review).success);
  assert(reviewSchema.safeParse({ ...review, timing }).success);
  assert.equal(reviewSchema.safeParse({ ...review, correct: false, timing }).success, false);
  assert.equal(
    reviewSchema.safeParse({ ...review, timing: { ...timing, input: "mouse" } }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({ ...review, timing: { ...timing, typingMs: 10 } }).success,
    false,
  );
});
