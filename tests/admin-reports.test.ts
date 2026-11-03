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

test("the list sorts only by a known column and direction, a page at a time", () => {
  assert.deepEqual(reportListQuerySchema.parse({}), { sort: "reported", dir: "desc", offset: 0 });
  assert.deepEqual(reportListQuerySchema.parse({ sort: "model", dir: "asc", offset: "50" }), {
    sort: "model",
    dir: "asc",
    offset: 50,
  });
  for (const query of [
    { sort: "prompt" },
    { sort: "model; DROP TABLE issue_reports" },
    { dir: "up" },
    { offset: "-1" },
    { offset: "1.5" },
  ])
    assert.equal(reportListQuerySchema.safeParse(query).success, false, JSON.stringify(query));
});
