import type { Page, Request } from "@playwright/test";
import { test, expect, createList, openAccount, openMenu, prompt, answer, saved } from "./fixtures";

// The AI features the workspace response reports, whatever the stack has configured (a dev
// stack may have real keys).
async function setAi(page: Page, ai: { languageNotes: boolean; speech: string[] }) {
  await page.route("/api/workspace", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), ai } });
  });
}

// The AI features are switched on in the workspace response and both AI routes are answered
// here. No provider is ever called.
async function fakeAi(page: Page) {
  const calls = { feedback: [] as Request[], speech: [] as Request[] };
  await setAi(page, { languageNotes: true, speech: ["Swedish", "French"] });
  await page.route("/api/feedback", (route) => {
    calls.feedback.push(route.request());
    return route.fulfill({ json: { status: "ready", comment: "Merci ends in -ci, not -cy." } });
  });
  await page.route("/api/speech", (route) => {
    calls.speech.push(route.request());
    return route.fulfill({ contentType: "audio/mpeg", body: Buffer.from([0xff, 0xfb, 0x90, 0]) });
  });
  return calls;
}

test("language notes only after wrong answers, answer audio only after grading", async ({
  page,
}) => {
  const calls = await fakeAi(page);
  await page.goto("/");
  await createList(page, "With AI", [
    ["hej", "bonjour"],
    ["tack", "merci"],
    ["katt", "chat"],
  ]);
  await expect(page.getByRole("button", { name: "Play hej in Swedish" })).toBeVisible();
  // The sidebar credits Requesty, marked as a referral, while an AI feature is on.
  await openMenu(page);
  const credit = page.getByRole("link", { name: /^AI features by Requesty/ });
  await expect(credit).toHaveAttribute("rel", "sponsored noopener noreferrer");
  await expect(page.getByText("Referral link", { exact: true })).toBeVisible();
  const close = page.getByRole("button", { name: "Close menu" });
  if (await close.isVisible()) await close.click();
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Audio and language notes are AI-generated and can make mistakes."),
  ).toBeVisible();

  const note = page.getByRole("complementary", { name: "AI language note" });
  const answerAudio = page.getByRole("button", { name: "Play answer word" });
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`Word ${i} of 3`)).toBeVisible();
    const word = await prompt(page);
    await expect(page.getByRole("button", { name: "Play question word" })).toBeVisible();
    await expect(answerAudio).toHaveCount(0);
    if (word === "hej") {
      await answer(page, "bonjour");
      await expect(answerAudio).toBeVisible();
      await expect(note).toHaveCount(0);
    } else if (word === "tack") {
      await answer(page, "mercy");
      await expect(note).toContainText("Merci ends in -ci, not -cy.");
      await expect(note).toContainText("Comment only. Your score is unchanged.");
      await expect(page.getByText("Not quite.")).toBeVisible();
      await answerAudio.click();
      await expect.poll(() => calls.speech.length).toBe(1);
    } else {
      await page.getByRole("button", { name: "I don’t know yet" }).click();
      await expect(answerAudio).toBeVisible();
      await expect(note).toHaveCount(0);
    }
    // Not Enter: after the audio click, focus is on the speaker button.
    await page.getByRole("button", { name: /Next word|See results/ }).click();
  }
  await expect(page.locator(".results-overview strong")).toHaveText("1 / 3");

  // Notes only for the one wrong answer, carrying only the exercise. (`next dev` runs effects
  // twice in Strict Mode, cancelling the first request, so count the answers, not requests.)
  expect(new Set(calls.feedback.map((r) => r.postData())).size).toBe(1);
  // The browser names the word; only the typed answer is free text. The server reads the rest
  // from the database (#82).
  expect(calls.feedback[0].postDataJSON()).toEqual({
    wordId: expect.any(String),
    direction: "forward",
    answer: "mercy",
    requireAccents: true,
    caseSensitive: false,
  });
  // The answer's audio reads every accepted answer (#79).
  expect(calls.speech[0].postDataJSON()).toEqual({ wordId: expect.any(String), part: "answers" });
});

test("without AI features there are no speaker buttons, notes or AI requests", async ({ page }) => {
  await setAi(page, { languageNotes: false, speech: [] });
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(feedback|speech)/.test(r.url())) requests.push(r.url());
  });
  await page.goto("/");
  await createList(page, "Plain", [["tack", "merci"]]);
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^AI features by Requesty/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Audio and language notes are AI-generated and can make mistakes."),
  ).toHaveCount(0);
  await answer(page, "mercy");
  await expect(page.getByText("Not quite.")).toBeVisible();
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "AI language note" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("AI features turned off in the profile hide notes and audio, and stay off", async ({
  page,
}) => {
  const calls = await fakeAi(page);
  await page.goto("/");
  await createList(page, "Opt out", [["tack", "merci"]]);
  await expect(page.getByRole("button", { name: "Play tack in Swedish" })).toBeVisible();

  const dialog = await openAccount(page);
  const toggle = dialog.getByRole("checkbox", { name: "Use AI features" });
  await expect(toggle).toBeChecked();
  const save = page.waitForResponse(
    (r) => r.url().endsWith("/api/profile") && r.request().method() === "PATCH" && r.ok(),
  );
  await toggle.uncheck();
  expect((await save).request().postDataJSON()).toEqual({ aiEnabled: false });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".speech-button")).toHaveCount(0);

  // Saved on the account: still off after a reload.
  await page.reload();
  await saved(page);
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await openMenu(page);
  await expect(page.getByRole("link", { name: /^AI features by Requesty/ })).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close menu" });
  if (await close.isVisible()) await close.click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Audio and language notes are AI-generated and can make mistakes."),
  ).toHaveCount(0);
  await answer(page, "mercy");
  await expect(page.getByText("Not quite.")).toBeVisible();
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "AI language note" })).toHaveCount(0);
  expect(calls.feedback).toEqual([]);
  expect(calls.speech).toEqual([]);
  await expect(
    (await openAccount(page)).getByRole("checkbox", { name: "Use AI features" }),
  ).not.toBeChecked();
});

test("the AI features switch is hidden when the site offers no AI features", async ({ page }) => {
  await setAi(page, { languageNotes: false, speech: [] });
  await page.goto("/");
  const dialog = await openAccount(page);
  await expect(dialog.getByLabel("Appearance")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Use AI features" })).toHaveCount(0);
});

test("speech for an unrelated language does not show the practice disclaimer", async ({ page }) => {
  await setAi(page, { languageNotes: false, speech: ["Japanese"] });
  await page.goto("/");
  await createList(page, "Unrelated speech", [["tack", "merci"]]);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Audio and language notes are AI-generated and can make mistakes."),
  ).toHaveCount(0);
});

test("speech for a language in the practice pair shows the disclaimer", async ({ page }) => {
  await setAi(page, { languageNotes: false, speech: ["Swedish"] });
  await page.goto("/");
  await createList(page, "Pair speech", [["tack", "merci"]]);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Audio and language notes are AI-generated and can make mistakes."),
  ).toBeVisible();
});

test("a second clip while one loads says so, and the first one still plays", async ({ page }) => {
  await setAi(page, { languageNotes: false, speech: ["Swedish", "French"] });
  // Like the server: one request at a time per account; another is answered "busy".
  let loading = false;
  let release = () => {};
  const aborted: string[] = [];
  page.on("requestfailed", (r) => {
    if (r.url().endsWith("/api/speech")) aborted.push(r.postData() ?? "");
  });
  await page.route("/api/speech", async (route) => {
    if (loading) return route.fulfill({ status: 429, json: { status: "busy" } });
    loading = true;
    await new Promise<void>((resolve) => (release = resolve));
    loading = false;
    return route.fulfill({ contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") });
  });
  await page.goto("/");
  await createList(page, "Clips", [
    ["hej", "bonjour"],
    ["tack", "merci"],
  ]);
  await page.getByRole("button", { name: "Play hej in Swedish" }).click();
  await expect(page.getByRole("button", { name: "Play hej in Swedish" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.getByRole("button", { name: "Play tack in Swedish" }).click();
  await expect(page.getByText("Audio request already in progress. Try again soon.")).toBeVisible();
  // The first request wasn't cancelled by the second click.
  release();
  await expect(page.getByRole("button", { name: "Play hej in Swedish" })).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(aborted).toEqual([]);
});
