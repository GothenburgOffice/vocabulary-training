import type { Page, Request } from "@playwright/test";
import { test, expect, createList, prompt, answer } from "./fixtures";

// The test stack has no Requesty keys, so the AI features are switched on in the workspace
// response and both AI routes are answered here. No provider is ever called.
async function fakeAi(page: Page) {
  const calls = { feedback: [] as Request[], speech: [] as Request[] };
  await page.route("/api/workspace", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({
      response,
      json: { ...json, ai: { languageNotes: true, speech: ["Swedish", "French"] } },
    });
  });
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
  await page.getByLabel("Session size").selectOption("1000");
  await page.getByRole("button", { name: "Start practice" }).click();

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
  expect(calls.feedback[0].postDataJSON()).toEqual({
    sourceLanguage: "Swedish",
    targetLanguage: "French",
    explanationLanguage: "Swedish",
    source: "tack",
    reference: "merci",
    accepted: [],
    answer: "mercy",
    correct: false,
    requireAccents: true,
    caseSensitive: false,
  });
  expect(calls.speech[0].postDataJSON()).toEqual({ text: "merci", language: "French" });
});

test("without AI features there are no speaker buttons, notes or AI requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/(feedback|speech)/.test(r.url())) requests.push(r.url());
  });
  await page.goto("/");
  await createList(page, "Plain", [["tack", "merci"]]);
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await page.getByRole("button", { name: "Start practice" }).click();
  await answer(page, "mercy");
  await expect(page.getByText("Not quite.")).toBeVisible();
  await expect(page.locator(".speech-button")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "AI language note" })).toHaveCount(0);
  expect(requests).toEqual([]);
});
