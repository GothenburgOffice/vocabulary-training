import type { Page } from "@playwright/test";
import { test, expect, createList, openMenu, answer } from "./fixtures";

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
  await page.getByRole("button", { name: "Cancel" }).click();
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
