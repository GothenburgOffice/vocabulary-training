import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  createList,
  openAccount,
  done,
  openMenu,
  prompt,
  answer,
  saved,
  saveState,
} from "./fixtures";

// Next.js adds its own (empty) alert for route announcements.
const errorIn = (page: Page) => page.getByRole("main").getByRole("alert");

test("a new list starts with its name, then saves pairs as they're typed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New word list" }).click();
  await expect(page.getByRole("heading", { name: "Start with a name." })).toBeVisible();
  const addWords = page.getByRole("button", { name: "Add words" });
  await expect(addWords).toBeDisabled();
  await expect(page.getByLabel("First language word 1")).toHaveCount(0);

  await page.getByLabel("List name").fill("Typed");
  // The name isn't saved until the list is created.
  await expect(saveState(page)).toHaveText(/Unsaved changes/);
  await addWords.click();
  await saved(page);
  await page.getByLabel("First language word 1").fill("hej");
  await page.getByLabel("Translation 1").fill("bonjour");
  await expect(saveState(page)).toHaveText(/Unsaved changes/);
  await saved(page);
  await expect(page.getByText("1 word pair", { exact: true })).toBeVisible();

  // No Done needed: it is saved already.
  await page.reload();
  await expect(page.getByText("Inside Typed")).toBeVisible();
  await expect(page.locator(".word-row")).toHaveText([/hej\s*bonjour/]);
});

test("unfinished rows stay unsaved, and leaving with them asks first", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Half", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Add a word pair" }).click();
  await page.getByLabel("First language word 2").fill("tack");
  await expect(page.getByText("1 word pair · 1 unfinished, not saved")).toBeVisible();
  await expect(saveState(page)).toHaveText(/Unsaved changes/);

  await done(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Leave with unfinished edits?" })).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveText(["1 word pair missing a word"]);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await page.getByLabel("Translation 2").fill("merci");
  await saved(page);
  await done(page);
  await expect(page.locator(".word-row")).toHaveText([/hej\s*bonjour/, /tack\s*merci/]);

  // Leaving anyway drops the unfinished row and keeps the rest.
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Add a word pair" }).click();
  await page.getByLabel("First language word 3").fill("katt");
  await done(page);
  await dialog.getByRole("button", { name: "Leave anyway" }).click();
  await saved(page);
  await page.reload();
  await expect(page.locator(".word-row")).toHaveCount(2);
});

test("a pasted list is saved by Import, not before", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Pasted", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Paste a list instead" }).click();
  const pasted = page.getByLabel("One word pair per line, separated by a tab or semicolon");
  await expect(pasted).toHaveValue("hej\tbonjour");
  await pasted.fill("hej;bonjour\ntack\tmerci\nnej");
  await expect(saveState(page)).toHaveText(/Unsaved changes/);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(errorIn(page)).toHaveText(
    "Line 3: separate a complete word pair with a tab or semicolon.",
  );
  // Cancel drops the pasted text.
  await page.getByRole("button", { name: "Cancel" }).click();
  await saved(page);

  await page.getByRole("button", { name: "Paste a list instead" }).click();
  await pasted.fill("hej;bonjour\ntack\tmerci");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByLabel("Translation 2")).toHaveValue("merci");
  await saved(page);
  await page.reload();
  await expect(page.locator(".word-row")).toHaveText([/hej\s*bonjour/, /tack\s*merci/]);
});

test("undo restores the list as it was opened", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Original", [
    ["hej", "bonjour"],
    ["tack", "merci"],
  ]);
  await page.getByRole("button", { name: "Edit list" }).click();
  const undo = page.getByRole("button", { name: "Undo changes" });
  await expect(undo).toBeDisabled();
  await page.getByLabel("List name").fill("Renamed");
  await page.getByRole("button", { name: "Remove word 1" }).click();
  await saved(page);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(page.getByLabel("List name")).toHaveValue("Original");
  await expect(page.getByLabel("First language word 1")).toHaveValue("hej");
  await saved(page);
  await page.reload();
  await expect(page.getByText("Inside Original")).toBeVisible();
  await expect(page.locator(".word-row")).toHaveCount(2);
});

test("a list without a name is shown as Untitled list", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Named", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List name").fill("");
  await saved(page);
  await done(page);
  await expect(page.getByText("Inside Untitled list")).toBeVisible();
  // It can be practised; the session is recorded under the shown name.
  await page.getByRole("button", { name: "Start practice" }).click();
  await answer(page, "bonjour");
  await page.getByRole("button", { name: "See results" }).click();
  await saved(page);
  await openMenu(page);
  await page.getByRole("button", { name: "Session history" }).click();
  await expect(page.locator(".history-row")).toContainText("Untitled list");
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
  await expect(page.getByText("2 word pairs from your CSV will be added.")).toBeVisible();
  await page.getByLabel("List name").fill("From CSV");
  await page.getByRole("button", { name: "Add words" }).click();
  await expect(page.getByLabel("First language word 2")).toHaveValue("hej, du");
  await saved(page);
  await done(page);

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

  // A list not created yet has nothing to delete; a saved one can be deleted from the editor.
  await page.getByRole("button", { name: "New word list" }).click();
  await expect(page.getByRole("button", { name: "Delete list" })).toHaveCount(0);
  await page.getByRole("main").getByRole("button", { name: "My word lists" }).click();
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

test("a delete refused because another tab changed the list doesn't block saving", async ({
  page,
}) => {
  await page.goto("/");
  await createList(page, "Contested", [["hej", "bonjour"]]);
  const other = await page.context().newPage();
  await other.goto("/");
  await expect(other.getByText("Inside Contested")).toBeVisible();

  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List name").fill("Changed first");
  await done(page);
  await saved(page);

  // The other tab still has the old revision: the delete is refused and the list comes back.
  await other.getByRole("button", { name: "Delete", exact: true }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Delete list" }).click();
  await expect(errorIn(other)).toContainText(
    "Another tab changed “Contested”, so it wasn't deleted.",
  );
  await expect(other.getByText("Inside Contested")).toBeVisible();
  // Saving goes on: no retry needed.
  await createList(other, "Still saving", [["tack", "merci"]]);
  await saved(other);

  await page.reload();
  await expect(page.locator(".list-row")).toHaveText([/Changed first/, /Still saving/]);
});

test("deleting a list from the editor isn't undone by a save still waiting", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Gone", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List name").fill("Gone for good");
  // Straight away, before the autosave runs.
  await page.getByRole("button", { name: "Delete list" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list" }).click();
  await expect(page.getByText("List deleted.")).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your first French words start here." }),
  ).toBeVisible();
});

test("every way out of the editor shows the list as edited", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Moving", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByLabel("List learning language").selectOption("German");
  // Leave through the sidebar at once: the library follows the list to German.
  await openMenu(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "My word lists" })
    .click();
  await expect(page.getByRole("heading", { name: "Your German workspace." })).toBeVisible();
  await expect(page.getByText("Inside Moving")).toBeVisible();

  // Practice from the editor uses the words just added.
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Add a word pair" }).click();
  await page.getByLabel("First language word 2").fill("tack");
  await page.getByLabel("Translation 2").fill("danke");
  await openMenu(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Practice" })
    .click();
  await expect(page.getByText("Word 1 of 2")).toBeVisible();
});

test("leaving a new list asks first, even without a name", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New word list" }).click();
  await page.getByLabel("A short description").fill("Words for the trip");
  await expect(saveState(page)).toHaveText(/Unsaved changes/);
  await page.getByRole("main").getByRole("button", { name: "My word lists" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("listitem")).toHaveText([
    "this new list, which isn't created until you press Add words",
  ]);
  await dialog.getByRole("button", { name: "Leave anyway" }).click();
  await saved(page);
});

test("pasted words over 200 characters are refused on import", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Long", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  await page.getByRole("button", { name: "Paste a list instead" }).click();
  await page
    .getByLabel("One word pair per line, separated by a tab or semicolon")
    .fill(`hej;bonjour\nlång;${"x".repeat(201)}`);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(errorIn(page)).toHaveText("Line 2: keep each word to 200 characters or fewer.");
});

test("the base language can't change while a list is being edited", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Locked", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  const account = await openAccount(page);
  await expect(account.getByLabel("Native / base language")).toBeDisabled();
  await expect(account).toContainText("Leave the list editor before changing your base language.");
});

test("further accepted answers: add, make primary, remove, paste and practise", async ({
  page,
}) => {
  await page.goto("/");
  await createList(page, "Answers", [["katt", "chat"]]);
  await page.getByRole("button", { name: "Edit list" }).click();
  const add = page.getByRole("button", { name: "Add another accepted answer for word 1" });
  await add.click();
  await page.keyboard.type("minou");
  await add.click();
  await page.keyboard.type("matou");
  await saved(page);

  // Saved with the word: they come back after a reload.
  await page.reload();
  await page.getByRole("button", { name: "Edit list" }).click();
  await expect(page.getByLabel("Word 1, accepted answer 2")).toHaveValue("minou");
  await expect(page.getByLabel("Word 1, accepted answer 3")).toHaveValue("matou");

  // Making one primary swaps it with the primary answer.
  await page.getByRole("button", { name: "Make word 1's accepted answer 2 primary" }).click();
  await expect(page.getByLabel("Translation 1")).toHaveValue("minou");
  await expect(page.getByLabel("Word 1, accepted answer 2")).toHaveValue("chat");
  await page.getByRole("button", { name: "Remove word 1's accepted answer 3" }).click();
  await expect(page.getByLabel("Word 1, accepted answer 3")).toHaveCount(0);
  await saved(page);

  // Paste mode shows them after a |, and imports them the same way.
  await page.getByRole("button", { name: "Paste a list instead" }).click();
  const pasted = page.getByLabel("One word pair per line, separated by a tab or semicolon");
  await expect(pasted).toHaveValue("katt\tminou|chat");
  await pasted.fill("katt;minou|chat\nhund;chien|clebs\nja;oui\\|si");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByLabel("Word 2, accepted answer 2")).toHaveValue("clebs");
  // A \| is a | inside one answer.
  await expect(page.getByLabel("Translation 3")).toHaveValue("oui|si");
  await page.getByRole("button", { name: "Paste a list instead" }).click();
  await pasted.fill("katt;|chat");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(errorIn(page)).toHaveText("Line 1: put the primary answer before any |.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await saved(page);
  await done(page);

  // Practising forward accepts a further answer; feedback lists them all.
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`Word ${i} of 3`)).toBeVisible();
    const word = await prompt(page);
    await answer(page, { katt: "chat", hund: "clebs", ja: "oui|si" }[word]!);
    await expect(page.getByText("That's right.")).toBeVisible();
    if (word === "katt") await expect(page.getByText("Answer: minou / chat")).toBeVisible();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator(".results-overview strong")).toHaveText("3 / 3");
});

test("Export my data downloads every list as JSON from the account dialog", async ({
  page,
  account,
}) => {
  await page.goto("/");
  await createList(page, "Exported", [["katt", "chat"]]);
  const dialog = await openAccount(page);
  const download = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Export my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^vocabulary-training-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.account.email).toBe(account.email);
  expect(data.lists.map((l: { title: string }) => l.title)).toEqual(["Exported"]);
  expect(data.lists[0].words[0]).toMatchObject({ prompt: "katt", answers: ["chat"] });
});
