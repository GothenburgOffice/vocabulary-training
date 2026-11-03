import test from "node:test";
import assert from "node:assert/strict";
import {
  accountChangeSchema,
  canRemoveAccess,
  escapeLike,
  isE2eAccountEmail,
  purgeDate,
  testAccountsDeleteSchema,
  TRASH_DAYS,
  userListQuerySchema,
} from "../lib/admin/users.ts";

const userId = "7199f62c-4c8b-43a6-8ca6-9711c6bffb04";

test("the account list takes a trimmed search, one scope and a non-negative offset", () => {
  assert.deepEqual(userListQuerySchema.parse({}), { q: "", scope: "all", offset: 0 });
  assert.deepEqual(userListQuerySchema.parse({ q: "  ann ", scope: "test", offset: "50" }), {
    q: "ann",
    scope: "test",
    offset: 50,
  });
  assert.equal(userListQuerySchema.parse({ scope: "trash" }).scope, "trash");
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

test("one account change at a time: a tier, a lock, or the trash", () => {
  assert.deepEqual(accountChangeSchema.parse({ userId, tier: "plus" }), { userId, tier: "plus" });
  assert.deepEqual(accountChangeSchema.parse({ userId, locked: true }), { userId, locked: true });
  assert.deepEqual(accountChangeSchema.parse({ userId, trashed: false }), {
    userId,
    trashed: false,
  });
  for (const candidate of [
    { userId, tier: "admin" },
    { userId: "not-an-id", tier: "basic" },
    { userId, tier: "basic", isAdmin: true },
    { userId, locked: "yes" },
    { userId, locked: true, trashed: true },
    { userId },
  ])
    assert.equal(
      accountChangeSchema.safeParse(candidate).success,
      false,
      JSON.stringify(candidate),
    );
});

test("only the E2E test accounts are deleted at once; others go through the trash", () => {
  assert.deepEqual(testAccountsDeleteSchema.parse({ testAccounts: true }), { testAccounts: true });
  assert.equal(testAccountsDeleteSchema.safeParse({ testAccounts: false }).success, false);
  assert.equal(testAccountsDeleteSchema.safeParse({ userId }).success, false);
  assert.equal(testAccountsDeleteSchema.safeParse({ userId, testAccounts: true }).success, false);
});

test("an account in the trash is deleted for good 30 days after it went in", () => {
  assert.equal(TRASH_DAYS, 30);
  assert.equal(purgeDate("2026-11-02T10:00:00.000Z").toISOString(), "2026-12-02T10:00:00.000Z");
});

test("the test-account filter matches only e2e addresses at example.test", () => {
  assert.equal(isE2eAccountEmail("e2e-123@example.test"), true);
  assert.equal(isE2eAccountEmail("E2E-test@EXAMPLE.TEST"), true);
  for (const email of ["e2e-@example.test", "user@example.test", "e2e-user@other.test"])
    assert.equal(isE2eAccountEmail(email), false, email);
});

test("an admin can be locked or trashed only while another admin can still sign in", () => {
  assert.equal(canRemoveAccess(false, false), true);
  assert.equal(canRemoveAccess(true, true), true);
  assert.equal(canRemoveAccess(true, false), false);
});
