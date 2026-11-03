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

test("the list sorts only by a known column and direction, after the last report shown", () => {
  const id = "0f8c2f8e-5d0a-4a57-9a43-2f1b0f6d2a11";
  assert.deepEqual(reportListQuerySchema.parse({}), { sort: "reported", dir: "desc" });
  assert.deepEqual(reportListQuerySchema.parse({ sort: "model", dir: "asc", after: id }), {
    sort: "model",
    dir: "asc",
    after: id,
  });
  for (const query of [
    { sort: "prompt" },
    { sort: "model; DROP TABLE issue_reports" },
    { dir: "up" },
    { after: "50" },
    { after: "not-an-id" },
  ])
    assert.equal(reportListQuerySchema.safeParse(query).success, false, JSON.stringify(query));
});
