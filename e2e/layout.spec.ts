import type { Page } from "@playwright/test";
import { test, expect, createList, openMenu, answer, saveState } from "./fixtures";

async function noSidewaysScroll(page: Page, view: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${view} scrolls sideways`).toBeLessThanOrEqual(0);
}

test("every view fits the width without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await noSidewaysScroll(page, "empty library");
  await createList(page, "A rather long list name that has to wrap somewhere sensible", [
    ["en ganska lång svensk mening att översätta", "une phrase française assez longue"],
  ]);
  await noSidewaysScroll(page, "library");
  await page.getByRole("button", { name: "Edit list" }).click();
  await noSidewaysScroll(page, "editor");
  await page.getByRole("button", { name: "Done" }).first().click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await noSidewaysScroll(page, "practice");
  await answer(page, "wrong");
  await noSidewaysScroll(page, "feedback");
  await page.getByRole("button", { name: "See results" }).click();
  await noSidewaysScroll(page, "results");
  await openMenu(page);
  await page.getByRole("button", { name: "Session history" }).click();
  await noSidewaysScroll(page, "history");
});

test("the help dialog opens and closes", async ({ page }) => {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("button", { name: "How practice works" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "A smarter mix, not a black box." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("on a phone the sidebar opens from the menu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the sidebar is always shown on a desktop");
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(page.locator(".mobile-wordmark")).toBeVisible();
  await expect(nav).not.toBeInViewport();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(nav).toBeInViewport();
  await expect(sidebar.locator(".wordmark")).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(nav).not.toBeInViewport();
});

test("the sidebar stays in place while the page scrolls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "on a phone the sidebar is a menu");
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/");
  await createList(page, "Long enough to scroll", [
    ["ett", "un"],
    ["två", "deux"],
    ["tre", "trois"],
  ]);
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const sidebar = (await page.locator(".sidebar").boundingBox())!;
  expect(Math.abs(sidebar.y)).toBeLessThan(1);
  expect(Math.abs(sidebar.height - 520)).toBeLessThan(1);
  // The bottom of the sidebar, with the save status and account, stays in view.
  await expect(saveState(page)).toBeInViewport();
  await expect(page.getByRole("button", { name: "Open profile" })).toBeInViewport();
});

test("the logo goes home, and asks first during practice", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Home", [["hej", "bonjour"]]);
  const logo = page.getByRole("link", { name: "vocabulary.training" }).filter({ visible: true });
  await openMenu(page);
  await page.getByRole("button", { name: "Session history" }).click();
  await logo.click();
  await expect(page.getByText("Inside Home")).toBeVisible();

  await page.getByRole("button", { name: "Start practice" }).click();
  await logo.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Leave this practice session?" })).toBeVisible();
  await dialog.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Inside Home")).toBeVisible();
});

test("the save status shows without opening the menu", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Status", [["hej", "bonjour"]]);
  await expect(saveState(page)).toBeInViewport();
  await expect(saveState(page)).toHaveAccessibleName(/./);
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toHaveCount(1);
});

test("the practice mode help is next to the practice mode", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Help", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "How Smart mix and Random order work" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "A smarter mix, not a black box." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // The label still belongs to the select.
  await expect(page.getByLabel("Practice mode")).toHaveValue("adaptive");
});

test("the sidebar never scrolls sideways, even at its narrowest", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "on a phone the sidebar is the full-width menu");
  // With AI on, so the Requesty credit (the widest item) is shown.
  await page.route("/api/workspace", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, ai: { languageNotes: true, speech: [] } } });
  });
  await page.goto("/");
  await createList(page, "Widths", [["hej", "bonjour"]]);
  for (const width of [1600, 1100, 900, 690]) {
    await page.setViewportSize({ width, height: 700 });
    const [visible, content] = await page
      .locator(".sidebar")
      .evaluate((e) => [e.clientWidth, e.scrollWidth]);
    expect(content, `sidebar at ${width}px`).toBe(visible);
    await expect(page.getByRole("button", { name: "Open profile" })).toBeInViewport({ ratio: 1 });
  }
});
