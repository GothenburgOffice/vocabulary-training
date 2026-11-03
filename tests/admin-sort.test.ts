import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSort } from "../lib/admin/sort.ts";

test("a heading sorts in its first direction, then reverses on the next click", () => {
  assert.deepEqual(nextSort(null, "email", "asc"), { key: "email", dir: "asc" });
  assert.deepEqual(nextSort({ key: "email", dir: "asc" }, "email", "asc"), {
    key: "email",
    dir: "desc",
  });
  assert.deepEqual(nextSort({ key: "email", dir: "desc" }, "email", "asc"), {
    key: "email",
    dir: "asc",
  });
  // Another heading starts over in its own first direction.
  assert.deepEqual(nextSort({ key: "email", dir: "asc" }, "created", "desc"), {
    key: "created",
    dir: "desc",
  });
});
