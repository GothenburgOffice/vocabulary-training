import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { REPORT_REASONS, reportRequestSchema } from "../lib/reports.ts";

test("reports accept only an activity id and a fixed reason", () => {
  const activityId = randomUUID();
  for (const reason of Object.keys(REPORT_REASONS))
    assert.deepEqual(reportRequestSchema.parse({ activityId, reason }), { activityId, reason });
  for (const invalid of [
    {},
    { activityId: "guessable", reason: "other" },
    { activityId, reason: "free text" },
    { activityId, reason: "other", word: "browser-controlled" },
    { activityId, reason: "other", comment: "free text" },
    { activityId, reason: "other", userId: randomUUID() },
  ])
    assert.equal(reportRequestSchema.safeParse(invalid).success, false);
});
