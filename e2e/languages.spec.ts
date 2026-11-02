import { test, expect, createList, openMenu, saved } from "./fixtures";

test("language pairs keep their lists apart", async ({ page }) => {
  await page.goto("/");
  await createList(page, "French words", [["hej", "bonjour"]]);

  // Add German from the sidebar's learning-language menu.
  await openMenu(page);
  await page.getByLabel("Learning language", { exact: true }).selectOption("__add__");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("New learning language").selectOption("German");
  await dialog.getByRole("button", { name: "Open language workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your German workspace." })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first German words start here." }),
  ).toBeVisible();
  await createList(page, "German words", [["hej", "hallo"]]);

  await openMenu(page);
  await page.getByLabel("Learning language", { exact: true }).selectOption("French");
  await expect(page.getByText("Inside French words")).toBeVisible();
  await expect(page.getByText("German words")).toHaveCount(0);

  // Both pairs and the selected one survive a reload.
  await saved(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your French workspace." })).toBeVisible();
  await openMenu(page);
  await expect(page.getByLabel("Learning language", { exact: true }).locator("option")).toHaveText([
    "French",
    "German",
    "＋ Add a language…",
  ]);
});

test("changing the base language never relabels lists", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Swedish base", [["hej", "bonjour"]]);

  await openMenu(page);
  await page.getByRole("button", { name: "Open profile" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Native / base language").selectOption("English");
  await dialog.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByText("Profile updated. Existing lists have not been changed."),
  ).toBeVisible();
  await expect(page.getByText("Swedish base")).toHaveCount(0);
  await openMenu(page);
  await expect(page.locator(".sidebar-base strong")).toHaveText("English");

  await page.getByRole("button", { name: "Open profile" }).click();
  await dialog.getByLabel("Native / base language").selectOption("Swedish");
  await dialog.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Inside Swedish base")).toBeVisible();
  await expect(page.locator(".word-head")).toHaveText(/Swedish\s*French/);
});

test("a stale save from a second tab gets a conflict, not an overwrite", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Shared", [["hej", "bonjour"]]);
  const other = await page.context().newPage();
  await other.goto("/");
  await expect(other.getByText("Inside Shared")).toBeVisible();

  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List name").fill("Saved first");
  await page.getByRole("button", { name: "Save word list" }).first().click();
  await saved(page);

  await other.getByRole("button", { name: "Edit list" }).click();
  await other.getByLabel("List name").fill("Saved second");
  await other.getByRole("button", { name: "Save word list" }).first().click();
  await expect(other.locator(".save-state")).toHaveText(/Changes not saved/);
  await expect(other.locator(".save-error")).toContainText(
    "Another tab changed this list. Export any unsaved words, then reload this tab.",
  );

  await page.reload();
  await expect(page.getByText("Inside Saved first")).toBeVisible();
});
