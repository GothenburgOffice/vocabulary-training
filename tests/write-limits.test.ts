import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WRITE_LIMITS,
  WriteLimiter,
  parseWriteLimits,
  writeLimitsSchema,
  writeLimitsToSettings,
} from "../lib/write-limits.ts";

const HOUR = 3_600_000;

test("the write limit counts per account, per hour and per day", () => {
  const limiter = new WriteLimiter();
  const limits = { perHour: 3, perDay: 5 };
  for (let i = 0; i < 3; i++) assert(limiter.take("a", i, limits));
  assert.equal(limiter.take("a", 10, limits), false);
  // Another account has its own count.
  assert(limiter.take("b", 10, limits));
  // A refused write isn't counted: the next hour allows the two left for the day.
  assert(limiter.take("a", HOUR, limits));
  assert(limiter.take("a", HOUR + 1, limits));
  assert.equal(limiter.take("a", HOUR + 2, limits), false);
  assert.equal(limiter.take("a", 2 * HOUR, limits), false);
  // A new day starts over.
  assert(limiter.take("a", 24 * HOUR, limits));
});

test("0 means no limit", () => {
  const limiter = new WriteLimiter();
  for (let i = 0; i < 1000; i++) assert(limiter.take("a", i, { perHour: 0, perDay: 0 }));
});

test("the defaults are far above a person answering once a second for 24 hours", () => {
  const limiter = new WriteLimiter();
  for (let s = 0; s < 24 * 3600; s++)
    assert(limiter.take("a", s * 1000, DEFAULT_WRITE_LIMITS), String(s));
});

test("write limit settings: defaults for anything missing or invalid, saved and read back", () => {
  assert.deepEqual(parseWriteLimits(new Map()), DEFAULT_WRITE_LIMITS);
  assert.deepEqual(
    parseWriteLimits(
      new Map([
        ["limits.writes.per_hour", "-1"],
        ["limits.writes.per_day", "1e9"],
      ]),
    ),
    DEFAULT_WRITE_LIMITS,
  );
  const changed = { perHour: 500, perDay: 0 };
  assert.deepEqual(parseWriteLimits(new Map(writeLimitsToSettings(changed))), changed);
  assert(writeLimitsSchema.safeParse(changed).success);
  assert.equal(writeLimitsSchema.safeParse({ perHour: 1.5, perDay: 1 }).success, false);
  assert.equal(writeLimitsSchema.safeParse({ perHour: 1, perDay: 1, extra: 1 }).success, false);
});
