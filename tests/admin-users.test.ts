import test from "node:test";
import assert from "node:assert/strict";
import { accountDeleteSchema, isE2eAccountEmail, tierChangeSchema } from "../lib/admin/users.ts";

test("account types accept only a user UUID and a supported tier", () => {
  const userId = "7199f62c-4c8b-43a6-8ca6-9711c6bffb04";
  assert.deepEqual(tierChangeSchema.parse({ userId, tier: "plus" }), { userId, tier: "plus" });
  assert.equal(tierChangeSchema.safeParse({ userId, tier: "admin" }).success, false);
  assert.equal(tierChangeSchema.safeParse({ userId: "not-an-id", tier: "basic" }).success, false);
  assert.equal(tierChangeSchema.safeParse({ userId, tier: "basic", isAdmin: true }).success, false);
});

test("account deletion accepts one account or the explicit test-account cleanup", () => {
  const userId = "7199f62c-4c8b-43a6-8ca6-9711c6bffb04";
  assert.deepEqual(accountDeleteSchema.parse({ userId }), { userId });
  assert.deepEqual(accountDeleteSchema.parse({ testAccounts: true }), { testAccounts: true });
  assert.equal(accountDeleteSchema.safeParse({ testAccounts: false }).success, false);
  assert.equal(accountDeleteSchema.safeParse({ userId, testAccounts: true }).success, false);
});

test("the test-account filter matches only e2e addresses at example.test", () => {
  assert.equal(isE2eAccountEmail("e2e-123@example.test"), true);
  assert.equal(isE2eAccountEmail("E2E-test@EXAMPLE.TEST"), true);
  for (const email of ["e2e-@example.test", "user@example.test", "e2e-user@other.test"])
    assert.equal(isE2eAccountEmail(email), false, email);
});
