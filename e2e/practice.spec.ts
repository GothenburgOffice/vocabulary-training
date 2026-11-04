import { test, expect, createList, openMenu, prompt, answer, saved } from "./fixtures";

const words: [string, string][] = [
  ["hej", "bonjour"],
  ["tack", "merci"],
  ["katt", "chat"],
];
const translation = Object.fromEntries(words);

test("practise: correct, wrong and skip, then results, mistakes and history", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Basics", words);
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Swedish → French · Weighted mix")).toBeVisible();

  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`Word ${i} of 3`)).toBeVisible();
    const word = await prompt(page);
    if (word === "hej") {
      await answer(page, "  Bonjour ");
      await expect(page.getByText("That's right.")).toBeVisible();
      await expect(page.getByText("Next review in 10 minutes.")).toBeVisible();
    } else if (word === "tack") {
      await answer(page, "mercy");
      await expect(page.getByText("Not quite. Let's keep this one in practice.")).toBeVisible();
      await expect(page.getByText("Correct answer: merci")).toBeVisible();
    } else {
      await page.getByRole("button", { name: "I don’t know yet" }).click();
      await expect(page.getByText("Correct answer: chat")).toBeVisible();
    }
    await expect(page.getByLabel("Your answer")).toBeDisabled();
    // Enter moves on, as the tip says.
    await page.keyboard.press("Enter");
  }

  await expect(page.getByRole("heading", { name: "You know what to work on next." })).toBeVisible();
  await expect(page.locator(".results-overview strong")).toHaveText("1 / 3");
  const rows = page.locator(".result-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "mercy" })).toContainText("Expected: merci");
  await expect(rows.filter({ hasText: "Skipped" })).toContainText("Expected: chat");

  await page.getByRole("button", { name: "Practise mistakes" }).click();
  for (let i = 1; i <= 2; i++) {
    await expect(page.getByText(`Word ${i} of 2`)).toBeVisible();
    const word = await prompt(page);
    expect(["tack", "katt"]).toContain(word);
    await answer(page, translation[word]);
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: "A good round. Keep it going." })).toBeVisible();
  await expect(page.locator(".results-overview strong")).toHaveText("2 / 2");
  await saved(page);

  // Both sessions and the word states come back from the server.
  await page.reload();
  await expect(page.getByText("Inside Basics")).toBeVisible();
  await expect(page.locator(".word-row .state")).toHaveText(["Learning", "Learning", "Learning"]);
  await openMenu(page);
  await page.getByRole("button", { name: "Session history" }).click();
  const sessions = page.locator(".history-row");
  await expect(sessions).toHaveCount(2);
  await expect(sessions.nth(0)).toContainText("2 questions");
  await expect(sessions.nth(0)).toContainText("2/2 correct");
  await expect(sessions.nth(1)).toContainText("3 questions");
  await expect(sessions.nth(1)).toContainText("1/3 correct");
});

test("reverse direction asks for the native word", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Reverse", [["hund", "chien"]]);
  await page.getByRole("button", { name: "Reverse test direction" }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("French → Swedish")).toBeVisible();
  await expect(page.getByText("Translate into Swedish")).toBeVisible();
  expect(await prompt(page)).toBe("chien");
  await answer(page, "hund");
  await expect(page.getByText("That's right.")).toBeVisible();
});

test("leaving a session asks first and keeps it out of history", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Leave", [
    ["hej", "bonjour"],
    ["tack", "merci"],
  ]);
  await page.getByRole("button", { name: "Start practice" }).click();
  await answer(page, "wrong");

  await page.getByRole("button", { name: "End session" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Leave this practice session?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep practising" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Your answer")).toBeVisible();

  // The sidebar's navigation asks too.
  await openMenu(page);
  await page.getByRole("button", { name: "My word lists" }).click();
  await dialog.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Inside Leave")).toBeVisible();

  await openMenu(page);
  await page.getByRole("button", { name: "Session history" }).click();
  await expect(page.getByRole("heading", { name: "A fresh start." })).toBeVisible();
});

test("spaced review asks new words in list order and fills the session", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Spaced", words);
  await page.getByLabel("Practice mode").selectOption("spaced");
  await expect(page.getByText("Due words first, the ones you are likeliest")).toBeVisible();
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText("Swedish → French · Spaced review")).toBeVisible();
  for (const [i, [front, back]] of words.entries()) {
    await expect(page.getByText(`Word ${i + 1} of 3`)).toBeVisible();
    expect(await prompt(page)).toBe(front);
    await answer(page, back);
    await page.getByRole("button", { name: /Next word|See results/ }).click();
  }
  await expect(page.locator(".results-overview strong")).toHaveText("3 / 3");
});

test("practice settings are remembered in this browser", async ({ page }) => {
  await page.goto("/");
  await createList(page, "Settings", [["hej", "bonjour"]]);
  await page.getByRole("button", { name: "Reverse test direction" }).click();
  await page.getByLabel("Practice mode").selectOption("random");
  await page.getByLabel("Session size").selectOption("5");
  await page.getByText("Answer settings").click();
  await page.getByLabel("Require accents").uncheck();
  await page.reload();
  await expect(page.getByLabel("Practice mode")).toHaveValue("random");
  await expect(page.getByLabel("Session size")).toHaveValue("5");
  await expect(page.locator(".direction-card")).toHaveText(/French\s*Swedish/);
  await page.getByText("Answer settings").click();
  await expect(page.getByLabel("Require accents")).not.toBeChecked();
  // Only in the browser: the server's workspace has no settings.
  const workspace = await (await page.request.get("/api/workspace")).text();
  expect(workspace).not.toContain("accents");
});
