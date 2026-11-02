import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_RETENTION_DAYS,
  reportListQuerySchema,
  reportPruneSchema,
} from "../lib/admin/reports.ts";

test("a prune accepts only the retention period, so newer reports are never deleted", () => {
  assert.equal(REPORT_RETENTION_DAYS, 15);
  assert.deepEqual(reportPruneSchema.parse({ olderThanDays: 15 }), { olderThanDays: 15 });
  for (const candidate of [
    { olderThanDays: 0 },
    { olderThanDays: 1 },
    { olderThanDays: "15" },
    {},
    { olderThanDays: 15, all: true },
  ])
    assert.equal(reportPruneSchema.safeParse(candidate).success, false, JSON.stringify(candidate));
});

test("the report list takes a non-negative whole offset", () => {
  assert.deepEqual(reportListQuerySchema.parse({}), { offset: 0 });
  assert.deepEqual(reportListQuerySchema.parse({ offset: "50" }), { offset: 50 });
  for (const offset of ["-1", "1.5", "x"])
    assert.equal(reportListQuerySchema.safeParse({ offset }).success, false, offset);
});
