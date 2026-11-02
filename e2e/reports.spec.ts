import { test, expect, openMenu } from "./fixtures";

const activity = {
  id: "00000000-0000-4000-8000-000000000081",
  kind: "speech",
  word: "bonjour",
  language: "French",
  model: "test/speech",
  voice: "test-voice",
  tier: "basic",
  createdAt: "2026-11-02T20:00:00.000Z",
};

test("the lower sidebar reports a selected action with a fixed reason", async ({ page }) => {
  const submissions: unknown[] = [];
  await page.route("/api/reports", async (route) => {
    if (route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: { activities: [activity] } });
  });
  await page.goto("/");
  await openMenu(page);
  const entry = page.getByRole("button", { name: "Report an issue", exact: true });
  await expect(entry).toHaveCount(1);
  await expect(page.locator(".side-bottom")).toContainText("Report an issue");
  await entry.click();
  const dialog = page.getByRole("dialog");
  const send = dialog.getByRole("button", { name: "Send report" });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Recent activity").selectOption(activity.id);
  await expect(send).toBeDisabled();
  await dialog.getByLabel("What went wrong?").selectOption("pronunciation");
  await send.click();
  await expect(dialog.getByRole("status")).toHaveText(/Report sent/);
  expect(submissions).toEqual([{ activityId: activity.id, reason: "pronunciation" }]);
});

test("reporting handles an empty log and a failed submission", async ({ page }) => {
  let empty = true;
  await page.route("/api/reports", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 404, json: { error: "This action has expired." } })
      : route.fulfill({ json: { activities: empty ? [] : [activity] } }),
  );
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("button", { name: "Report an issue", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No recent activity.");
  await expect(dialog.getByRole("button", { name: "Send report" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  empty = false;
  await page.getByRole("button", { name: "Report an issue", exact: true }).click();
  await dialog.getByLabel("Recent activity").selectOption(activity.id);
  await dialog.getByLabel("What went wrong?").selectOption("pronunciation");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This action has expired.");
  await expect(dialog.getByRole("button", { name: "Send report" })).toBeEnabled();
});
