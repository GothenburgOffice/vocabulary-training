// Answer timing (#2): how long a learner hesitates on an answer, measured against their own
// usual, as a possible future "Hard" grade. It only collects for now: nothing here changes a
// grade or a review date until the threshold has been calibrated.
//
// Typing speed is left out: it varies too much between people and devices. Per answer, the
// browser measures, in time with the tab visible:
// - hesitation before: from the word being shown to the first keystroke;
// - hesitation between: of each pause between keystrokes, and before the check, the part
//   longer than the input type's cutoff (admin), so ordinary typing gaps count for nothing.
// The server keeps only running averages per account and input type, never the times of
// single answers.
import { z } from "zod";

export const INPUT_TYPES = ["keyboard", "touch"] as const;
export type InputType = (typeof INPUT_TYPES)[number];
export const INPUT_LABELS: Record<InputType, string> = {
  keyboard: "Physical keyboard",
  touch: "Touchscreen",
};

// What one right, typed answer took. Times in milliseconds.
export type TimingSample = {
  input: InputType;
  activeMs: number;
  beforeMs: number;
  pauseMs: number;
};
// Longer than this is a learner who walked away, not one who hesitated.
const MAX_ACTIVE_MS = 120_000;
const ms = z.number().int().min(0).max(600_000);
export const timingSampleSchema = z
  .object({ input: z.enum(INPUT_TYPES), activeMs: ms, beforeMs: ms, pauseMs: ms })
  .strict();
export const usableSample = (s: TimingSample) =>
  s.activeMs <= MAX_ACTIVE_MS && s.beforeMs + s.pauseMs <= s.activeMs;

// The admin settings: the pause cutoff per input type, and the hesitation score (standard
// deviations above the person's usual) from which an answer would count as Hard.
export type TimingSettings = { cutoffMs: Record<InputType, number>; hardThreshold: number };
export const DEFAULT_TIMING: TimingSettings = {
  cutoffMs: { keyboard: 1000, touch: 1500 },
  hardThreshold: 2,
};
const TIMING_BOUNDS = {
  cutoffMs: { min: 200, max: 10_000 },
  hardThreshold: { min: 0.5, max: 5 },
};
const cutoff = z.number().int().min(TIMING_BOUNDS.cutoffMs.min).max(TIMING_BOUNDS.cutoffMs.max);
export const timingSettingsSchema = z
  .object({
    cutoffMs: z.object({ keyboard: cutoff, touch: cutoff }).strict(),
    // In quarter steps, the calibration counts' steps.
    hardThreshold: z
      .number()
      .min(TIMING_BOUNDS.hardThreshold.min)
      .max(TIMING_BOUNDS.hardThreshold.max)
      .refine((t) => Number.isInteger(t * 4), "Use a threshold in steps of 0.25."),
  })
  .strict();
// Site settings "timing.…"; anything missing or out of range is the default.
export function parseTimingSettings(settings: Map<string, string>): TimingSettings {
  const read = (key: string, fallback: number, bounds: { min: number; max: number }) => {
    const value = Number(settings.get(key)?.trim() || NaN);
    return Number.isFinite(value) && value >= bounds.min && value <= bounds.max ? value : fallback;
  };
  const d = DEFAULT_TIMING;
  const b = TIMING_BOUNDS;
  return {
    cutoffMs: {
      keyboard: Math.round(read("timing.keyboard_cutoff_ms", d.cutoffMs.keyboard, b.cutoffMs)),
      touch: Math.round(read("timing.touch_cutoff_ms", d.cutoffMs.touch, b.cutoffMs)),
    },
    hardThreshold: read("timing.hard_threshold", d.hardThreshold, b.hardThreshold),
  };
}
export const timingToSettings = (t: TimingSettings): [string, string][] => [
  ["timing.keyboard_cutoff_ms", String(t.cutoffMs.keyboard)],
  ["timing.touch_cutoff_ms", String(t.cutoffMs.touch)],
  ["timing.hard_threshold", String(t.hardThreshold)],
];

// One account's running averages for one input type, of the hesitation score
// log(1 + seconds), so that a few very long pauses don't swamp the rest.
export type TimingStats = { samples: number; mean: number; variance: number };
export const FRESH_STATS: TimingStats = { samples: 0, mean: 0, variance: 0 };
// The average of everything so far for the first answers, then a moving average that
// follows the latest 20 or so, so a learner who gets quicker is followed.
const ALPHA = 0.05;
// Below this many answers there is no usual to compare with yet.
export const MIN_SAMPLES = 20;

const hesitationScore = (s: TimingSample) => Math.log1p((s.beforeMs + s.pauseMs) / 1000);

// Adds one answer: returns the new averages, and the answer's score against the person's
// usual before it (null until there are MIN_SAMPLES answers to compare with).
export function observe(stats: TimingStats, sample: TimingSample) {
  const x = hesitationScore(sample);
  const z =
    stats.samples >= MIN_SAMPLES
      ? (x - stats.mean) / Math.sqrt(Math.max(stats.variance, 1e-4))
      : null;
  const a = Math.max(ALPHA, 1 / (stats.samples + 1));
  const diff = x - stats.mean;
  const next: TimingStats = {
    samples: stats.samples + 1,
    mean: stats.mean + a * diff,
    variance: stats.samples === 0 ? 0 : (1 - a) * (stats.variance + a * diff * diff),
  };
  return { stats: next, z };
}

// The site-wide count of scores, in quarter steps from -2 to 5 (the ends take the rest), so
// admin can see how many answers a threshold would mark Hard. It holds no account.
const BUCKET_STEP = 0.25;
export const MIN_BUCKET = -8;
export const MAX_BUCKET = 20;
export const bucketOf = (z: number) =>
  Math.min(MAX_BUCKET, Math.max(MIN_BUCKET, Math.floor(z / BUCKET_STEP)));
// The share of scored answers at or above a threshold (a bucket counts when it starts there).
export function shareAtOrAbove(buckets: Map<number, number>, threshold: number) {
  let total = 0;
  let above = 0;
  const from = Math.ceil(threshold / BUCKET_STEP - 1e-9);
  for (const [bucket, count] of buckets) {
    total += count;
    if (bucket >= from) above += count;
  }
  return total ? above / total : 0;
}

// The browser side: a clock for one answer, in time with the tab visible. Times come from
// the caller (performance.now()), so it can be tested.
export class AnswerClock {
  private started = 0;
  private hidden = 0;
  private hiddenSince: number | null = null;
  private before: number | null = null;
  private lastInput = 0;
  private pause = 0;
  constructor(private cutoffMs: number) {}
  start(now: number, hidden = false) {
    this.started = now;
    this.hidden = 0;
    this.hiddenSince = hidden ? now : null;
    this.before = null;
    this.lastInput = 0;
    this.pause = 0;
  }
  // The tab was hidden or shown again.
  visibility(hidden: boolean, now: number) {
    if (hidden && this.hiddenSince === null) this.hiddenSince = now;
    else if (!hidden && this.hiddenSince !== null) {
      this.hidden += now - this.hiddenSince;
      this.hiddenSince = null;
    }
  }
  private active(now: number) {
    return (
      now - this.started - this.hidden - (this.hiddenSince === null ? 0 : now - this.hiddenSince)
    );
  }
  private gap(t: number) {
    this.pause += Math.max(0, t - this.lastInput - this.cutoffMs);
  }
  input(now: number) {
    const t = this.active(now);
    if (this.before === null) this.before = t;
    else this.gap(t);
    this.lastInput = t;
  }
  // The answer's times, or null without any typing.
  finish(now: number, input: InputType): TimingSample | null {
    if (this.before === null) return null;
    const t = this.active(now);
    this.gap(t);
    return {
      input,
      activeMs: Math.round(t),
      beforeMs: Math.round(this.before),
      pauseMs: Math.round(this.pause),
    };
  }
}
