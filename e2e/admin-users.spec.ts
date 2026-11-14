import { test, expect } from "@playwright/test";
import { USERS_PAGE_SIZE, isE2eAccountEmail } from "../lib/admin/users";
import { signedInAsAdmin } from "./admin-fixtures";

signedInAsAdmin();

test("users can be filtered, re-typed, locked, trashed and restored, with E2E cleanup", async ({
  page,
}) => {
  const viewerId = "7199f62c-4c8b-43a6-8ca6-9711c6bffb04";
  const testId = "a620960f-133c-4e1b-8cf6-04bf2d37e8cd";
  const learnerId = "523c4025-e0ca-4898-9d65-a36cf00c424f";
  const account = (id: string, email: string) => ({
    id,
    email,
    created_at: "2026-10-01T10:00:00.000Z",
    last_sign_in_at: null,
    write_limited_at: null,
    ai_tier: "basic" as const,
    is_admin: false,
    locked_at: null as string | null,
    deleted_at: null as string | null,
    speech_calls_day: 2,
    speech_letters_day: 120,
    speech_calls_week: 3,
    speech_letters_week: 180,
    speech_calls_90: 4,
    speech_letters_90: 240,
    note_calls_day: 1,
    note_letters_day: 40,
    note_calls_week: 2,
    note_letters_week: 80,
    note_calls_90: 3,
    note_letters_90: 120,
  });
  let accounts = [
    account(testId, "e2e-test@example.test"),
    account(learnerId, "learner@example.test"),
  ];
  const limits = {
    speech: {
      lettersPerMinute: 1200,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 500,
    },
    note: {
      lettersPerMinute: 3000,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 3000,
    },
    speechBlockMs: 10000,
  };
  await page.route("**/api/admin/users**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      // Like the server: one change at a time, and the changed access comes back.
      const { userId, tier, locked, trashed } = request.postDataJSON();
      const now = "2026-11-02T10:00:00.000Z";
      accounts = accounts.map((user) =>
        user.id !== userId
          ? user
          : tier
            ? { ...user, ai_tier: tier }
            : locked !== undefined
              ? { ...user, locked_at: locked ? now : null }
              : { ...user, deleted_at: trashed ? now : null },
      );
      const changed = accounts.find((user) => user.id === userId)!;
      return route.fulfill({
        json: tier
          ? { ok: true }
          : {
              account: {
                id: changed.id,
                locked_at: changed.locked_at,
                deleted_at: changed.deleted_at,
              },
            },
      });
    }
    if (request.method() === "DELETE") {
      // Only the E2E cleanup deletes at once.
      accounts = accounts.filter((user) => !isE2eAccountEmail(user.email));
      return route.fulfill({ json: { deleted: 1 } });
    }
    const params = new URL(request.url()).searchParams;
    const q = params.get("q")?.toLowerCase() ?? "";
    const scope = params.get("scope");
    const matching = accounts.filter((user) => {
      const isTestAccount = isE2eAccountEmail(user.email);
      return (
        user.email.toLowerCase().includes(q) &&
        (scope !== "test" || isTestAccount) &&
        (scope !== "regular" || !isTestAccount) &&
        (scope !== "trash" || user.deleted_at !== null)
      );
    });
    // Only the email sort is faked; the list is otherwise in the order it was made.
    if (params.get("sort") === "email")
      matching.sort(
        (a, b) => a.email.localeCompare(b.email) * (params.get("dir") === "asc" ? 1 : -1),
      );
    const offset = Number(params.get("offset") ?? 0);
    return route.fulfill({
      json: {
        viewerId,
        accounts: matching.slice(offset, offset + USERS_PAGE_SIZE),
        limits,
        total: matching.length,
        testAccounts: accounts.filter((user) => isE2eAccountEmail(user.email)).length,
        pageSize: USERS_PAGE_SIZE,
        trashDays: 30,
      },
    });
  });

  await page.goto("/admin/users");
  const rows = page.locator(".users-table > tbody > tr");
  const emails = page.locator(".users-table .user-email > button");
  await expect(rows).toHaveCount(2);
  // The table only shows: no controls in the rows.
  await expect(rows.locator("select, input")).toHaveCount(0);
  // The row shows 90 days of speech (letters, calls) and whether the daily limit blocks it;
  // hovering shows every period against its budget.
  const speech = rows.first().locator(".usage-stat").first();
  await expect(speech).toHaveText("240 (4)");
  await expect(speech.getByLabel("Not limited")).toBeVisible();
  await speech.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  await expect(tip.getByRole("row", { name: /24 hours/ })).toHaveText(
    /24 hours\s*2\s*120\s*100,000/,
  );
  await expect(tip).toContainText("Within the daily limit: 99,880 letters left");

  // Headings sort on the server, as the list loads in pages: the first click on Email is A–Z.
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await expect(emails).toHaveText(["e2e-test@example.test", "learner@example.test"]);
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await expect(emails).toHaveText(["learner@example.test", "e2e-test@example.test"]);
  await expect(page.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  // Search runs on the server: the fake narrows the list only when the query is sent.
  await page.getByLabel("Search by email").fill("learner");
  await expect(emails).toHaveText(["learner@example.test"]);
  await expect(page.getByText("Showing 1 of 1 matching accounts.")).toBeVisible();
  await page.getByLabel("Search by email").fill("");
  await expect(rows).toHaveCount(2);

  // A row opens the account's card, where its type and access change.
  const learner = rows.filter({ hasText: "learner@example.test" });
  const state = learner.locator(".user-state");
  await expect(state).toHaveText("Active");
  await learner.locator("td").first().click();
  const card = page.getByRole("dialog", { name: "learner@example.test" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("row", { name: /90 days/ }).first()).toHaveText(
    /90 days\s*4\s*240\s*9,000,000/,
  );
  await card.getByLabel("Account type").selectOption("plus");
  await expect(card.getByRole("status")).toHaveText("Updated learner@example.test.");
  await expect(learner.locator("td").first()).toHaveText("Plus");

  // Lock and unlock.
  await card.getByRole("button", { name: "Lock account" }).click();
  await expect(card).toContainText("It can’t sign in.");
  await expect(state).toHaveText("Locked");
  await card.getByRole("button", { name: "Unlock account" }).click();
  await expect(state).toHaveText("Active");

  // The trash asks first, says when the account is deleted for good, and can be undone.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Move learner@example.test to the trash?");
    expect(dialog.message()).toContain("(30 days)");
    void dialog.accept();
  });
  await card.getByRole("button", { name: "Move to trash" }).click();
  await expect(state).toHaveText("Trash");
  await expect(card).toContainText("Deleted for good with its data on");
  // An account in the trash is locked by being there; it offers only Restore.
  await expect(card.getByRole("button", { name: "Lock account" })).toHaveCount(0);
  await card.getByRole("button", { name: "Close dialog" }).click();
  await expect(card).toBeHidden();
  await page.getByLabel("Account filter").selectOption("trash");
  await expect(emails).toHaveText(["learner@example.test"]);
  // The keyboard's way in: the email is a button.
  await emails.first().focus();
  await page.keyboard.press("Enter");
  await card.getByRole("button", { name: "Restore account" }).click();
  await expect(state).toHaveText("Active");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await page.getByLabel("Account filter").selectOption("all");
  await expect(rows).toHaveCount(2);

  // Your own account can't be locked or trashed from its card.
  accounts = [...accounts, { ...account(viewerId, "admin@example.test"), is_admin: true }];
  await page.getByLabel("Search by email").fill("admin@");
  await expect(emails).toHaveText(["admin@example.test"]);
  await emails.first().click();
  const own = page.getByRole("dialog", { name: "admin@example.test" });
  await expect(own).toContainText("Admin (your account)");
  await expect(own.getByRole("button", { name: /Lock account|Move to trash/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Search by email").fill("");

  await page.getByLabel("Account filter").selectOption("test");
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("e2e-test@example.test")).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Permanently delete 1 E2E test accounts");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete test accounts (1)" }).click();
  await expect(page.getByText("Deleted 1 E2E test accounts.")).toBeVisible();
  await expect(rows).toHaveCount(0);
});
