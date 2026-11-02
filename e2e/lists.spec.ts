import { readFile } from "node:fs/promises";
import { test, expect, createList, prompt, answer, saved } from "./fixtures";

test("editor: validation, pasted pairs and editing a saved list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New word list" }).click();
  const save = page.getByRole("button", { name: "Save word list" }).first();
  // Next.js adds its own (empty) alert for route announcements.
  const error = page.getByRole("main").getByRole("alert");
  await save.click();
  await expect(error).toHaveText("Give your list a name.");

  await page.getByLabel("List name").fill("Pasted");
  await save.click();
  await expect(error).toHaveText("Add at least one word pair.");
  await page.getByLabel("First language word 1").fill("hej");
  await save.click();
  await expect(error).toHaveText("Complete both sides of each word pair, or remove the row.");

  // Paste mode takes tabs or semicolons, one pair per line, and switching back keeps them.
  await page.getByRole("button", { name: "Paste a list" }).click();
  const pasted = page.getByLabel("One word pair per line, separated by a tab or semicolon");
  await pasted.fill("hej;bonjour\ntack\tmerci\nnej");
  await page.getByRole("button", { name: "Word by word" }).click();
  await expect(error).toHaveText("Line 3: separate a complete word pair with a tab or semicolon.");
  await pasted.fill("hej;bonjour\ntack\tmerci\n");
  await page.getByRole("button", { name: "Word by word" }).click();
  await expect(page.getByLabel("Translation 2")).toHaveValue("merci");
  await expect(page.getByText("2 word pairs")).toBeVisible();
  await save.click();
  await expect(page.getByText("Inside Pasted")).toBeVisible();
  await expect(page.locator(".word-row")).toHaveCount(2);

  // Edit: rename, remove a word, add one.
  await page.getByRole("button", { name: "Edit list" }).click();
  await expect(page.getByRole("heading", { name: "A few words, well chosen." })).toBeVisible();
  await page.getByLabel("List name").fill("Edited");
  await page.getByRole("button", { name: "Remove word 1" }).click();
  await page.getByRole("button", { name: "Add a word pair" }).click();
  await page.getByLabel("First language word 2").fill("katt");
  await page.getByLabel("Translation 2").fill("chat");
  await save.click();
  await saved(page);

  await page.reload();
  await expect(page.getByText("Inside Edited")).toBeVisible();
  await expect(page.locator(".word-row")).toHaveText([/tack\s*merci/, /katt\s*chat/]);
});

test("cancelling the editor keeps the saved list unchanged", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Keep", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List name").fill("Changed");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Inside Keep")).toBeVisible();
});

test("CSV: import with alternative answers, practise them and export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog");
  const contents = dialog.getByLabel("CSV contents");

  // A list must start from the profile's base language.
  await contents.fill("en,fr\nhello,bonjour");
  await dialog.getByRole("button", { name: "Preview imported words" }).click();
  await expect(dialog.getByRole("alert")).toContainText("This CSV uses English as its base");

  await contents.fill('sv,fr\nkatt,chat|minou\n"hej, du",salut\n');
  await dialog.getByRole("button", { name: "Preview imported words" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("List name")).toHaveValue("Imported word list");
  await expect(page.getByLabel("First language word 2")).toHaveValue("hej, du");
  await page.getByLabel("List name").fill("From CSV");
  await page.getByRole("button", { name: "Save word list" }).first().click();
  await saved(page);

  // Any accepted answer counts; feedback lists them all.
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();
  for (let i = 0; i < 2; i++) {
    const word = await prompt(page);
    await answer(page, word === "katt" ? "minou" : "salut");
    await expect(page.getByText("That's right.")).toBeVisible();
    if (word === "katt") await expect(page.getByText("Answer: chat / minou")).toBeVisible();
    await page.keyboard.press("Enter");
  }
  await page.getByRole("button", { name: "Back to lists" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("from-csv.csv");
  expect(await readFile((await file.path())!, "utf8")).toBe(
    '﻿"Swedish","French"\r\n"katt","chat|minou"\r\n"hej, du","salut"',
  );
  await expect(page.getByText("CSV exported.")).toBeVisible();
});

test("deleting a list asks first, then removes it for good", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Doomed", [["hej", "bonjour"]]);
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toContainText("Doomed and its 1 word will be deleted");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Inside Doomed")).toBeVisible();

  // A new list has nothing to delete yet; a saved one can be deleted from the editor.
  await page.getByRole("button", { name: "New word list" }).click();
  await expect(page.getByRole("button", { name: "Delete list" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Delete list" }).click();
  await dialog.getByRole("button", { name: "Delete list" }).click();
  await expect(page.getByText("List deleted.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first French words start here." }),
  ).toBeVisible();
  await saved(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your first French words start here." }),
  ).toBeVisible();
});
