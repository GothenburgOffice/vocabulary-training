import test from "node:test";
import assert from "node:assert/strict";
import {
  accountDeleteSchema,
  canDeleteAccount,
  escapeLike,
  isE2eAccountEmail,
  tierChangeSchema,
  userListQuerySchema,
} from "../lib/admin/users.ts";

test("the account list takes a trimmed search, one scope and a non-negative offset", () => {
  assert.deepEqual(userListQuerySchema.parse({}), { q: "", scope: "all", offset: 0 });
  assert.deepEqual(userListQuerySchema.parse({ q: "  ann ", scope: "test", offset: "50" }), {
    q: "ann",
    scope: "test",
    offset: 50,
  });
  assert.equal(userListQuerySchema.safeParse({ scope: "admins" }).success, false);
  assert.equal(userListQuerySchema.safeParse({ offset: "-1" }).success, false);
  assert.equal(userListQuerySchema.safeParse({ offset: "1.5" }).success, false);
  assert.equal(userListQuerySchema.safeParse({ q: "x".repeat(201) }).success, false);
});

test("search text is escaped so LIKE wildcards match literally", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("back\\slash"), "back\\\\slash");
  assert.equal(escapeLike("plain@example.test"), "plain@example.test");
});

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

test("an admin can be deleted only when another admin remains", () => {
  assert.equal(canDeleteAccount(false, false), true);
  assert.equal(canDeleteAccount(true, true), true);
  assert.equal(canDeleteAccount(true, false), false);
});
