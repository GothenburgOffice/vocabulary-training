import type { Page } from "@playwright/test";
import { test, expect, openAccount, saved } from "./fixtures";

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// Waits for the setting to reach the server. (On a phone the sidebar stays open behind the
// dialog, so the save status shows twice.)
const savedTheme = (page: Page) =>
  page.waitForResponse(
    (r) => r.url().endsWith("/api/profile") && r.request().method() === "PATCH" && r.ok(),
  );
const LIGHT = "rgb(246, 247, 249)";
const DARK = "rgb(17, 22, 29)";

test("Appearance in the account dialog switches at once and is kept with the account", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await saved(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await background(page)).toBe(LIGHT);

  const dialog = await openAccount(page);
  let save = savedTheme(page);
  await dialog.getByLabel("Appearance").selectOption("Dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background(page)).toBe(DARK);
  await save;

  // Saved on the account: the server renders the next page dark straight away.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background(page)).toBe(DARK);

  // System default follows the device.
  const again = await openAccount(page);
  save = savedTheme(page);
  await again.getByLabel("Appearance").selectOption("System default");
  await save;
  expect(await background(page)).toBe(LIGHT);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await background(page)).toBe(DARK);
});

test("signing in without a reload paints the workspace in the saved scheme; signing out drops it", async ({
  page,
  account,
  baseURL,
}) => {
  const saved = await page.request.patch("/api/profile", {
    headers: { Origin: new URL(baseURL!).origin },
    data: { theme: "dark" },
  });
  expect(saved.ok()).toBe(true);
  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");

  // Record the scheme the moment the workspace enters the page. Mutation observers run
  // before the browser paints, so "system" here would be a visible flash.
  await page.evaluate(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector(".app-shell")) return;
      document.body.dataset.themeAtFirstPaint = document.documentElement.dataset.theme;
      observer.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".app-shell")).toBeAttached();
  await expect(page.locator("body")).toHaveAttribute("data-theme-at-first-paint", "dark");
  expect(await background(page)).toBe(DARK);

  const dialog = await openAccount(page);
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  expect(await background(page)).toBe(LIGHT);
});
