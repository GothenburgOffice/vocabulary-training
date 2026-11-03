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
