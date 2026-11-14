import { test, expect } from "@playwright/test";
import { signedInAsAdmin } from "./admin-fixtures";

signedInAsAdmin();

test("reports list newest first by page, sort by a heading, show the request, and prune", async ({
  page,
}) => {
  const report = (id: string, word: string, on: string, kind: string, model: string) => ({
    id,
    reported_on: on,
    activity_on: on,
    kind,
    reason: kind === "speech" ? "pronunciation" : "incorrect-note",
    word,
    language: "French",
    model,
    voice: kind === "speech" ? "Mia" : null,
    tier: "basic",
    prompt: kind === "speech" ? { part: "learning" } : { model, messages: [] },
  });
  const newer = report(
    "0f8c2f8e-5d0a-4a57-9a43-2f1b0f6d2a11",
    "merci",
    "2026-11-03",
    "speech",
    "vendor/tts",
  );
  const older = report(
    "1a2b3c4d-5e6f-4a57-9a43-2f1b0f6d2a11",
    "bonjour",
    "2026-10-01",
    "note",
    "acme/chat",
  );
  let reports = [newer, older];
  const queries: string[] = [];
  const prunes: unknown[] = [];
  // Like the server: newest first unless sorted, one report per page here so "Load more" shows.
  await page.route(/\/api\/admin\/reports(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      prunes.push(request.postDataJSON());
      reports = [];
      return route.fulfill({ json: { deleted: 2 } });
    }
    const params = new URL(request.url()).searchParams;
    const after = params.get("after");
    queries.push(`${params.get("sort")} ${params.get("dir")} ${after ?? "top"}`);
    const sorted =
      params.get("sort") === "model"
        ? [...reports].sort(
            (a, b) => a.model.localeCompare(b.model) * (params.get("dir") === "asc" ? 1 : -1),
          )
        : reports;
    // Like the server: the page after the last report shown.
    const start = after ? sorted.findIndex((row) => row.id === after) + 1 : 0;
    return route.fulfill({
      json: {
        reports: sorted.slice(start, start + 1),
        total: reports.length,
        prunable: reports.length,
        retentionDays: 15,
        pageSize: 1,
      },
    });
  });

  await page.goto("/admin/reports");
  const rows = page.locator(".reports-table > tbody > tr");
  await expect(rows).toHaveCount(1);
  // One row with everything: dates only (reports keep no times), and no account.
  await expect(rows.first()).toHaveText(
    /2026-11-03\s*2026-11-03\s*Audio\s*Wrong pronunciation\s*merci\s*French\s*vendor\/tts\s*Mia\s*Basic/,
  );
  await expect(page.locator(".reports-table")).not.toContainText("@");

  // The next page continues after the last report shown.
  await page.getByRole("button", { name: "Load more reports" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("bonjour");

  // A row opens the report with the request that was sent.
  await rows.first().locator("td").first().click();
  const card = page.getByRole("dialog", { name: "Audio · merci" });
  await expect(card.locator("pre")).toContainText('"part": "learning"');
  await expect(card).not.toContainText("@");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();

  // Sorting asks the server for the first page in the new order.
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("acme/chat");
  expect(queries).toEqual(["reported desc top", `reported desc ${newer.id}`, "model asc top"]);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Permanently delete 2 reports older than 15 days?");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete reports older than 15 days (2)" }).click();
  await expect(page.getByText("Deleted 2 reports.")).toBeVisible();
  expect(prunes).toEqual([{ olderThanDays: 15 }]);
  await expect(page.getByText("No reports yet.")).toBeVisible();
});
