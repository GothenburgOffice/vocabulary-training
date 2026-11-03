import type { Page, Request } from "@playwright/test";
import { test, expect, createList, openMenu, answer } from "./fixtures";

// Reporting an AI result (#95). AI routes are answered here; no provider is called. The report
// itself goes to the real /api/reports.

const NOTE = "Merci ends in -ci, not -cy.";
const NOTE_ACTIVITY = {
  model: "dummy/note-model",
  prompt: { model: "dummy/note-model", messages: [{ role: "user", content: "tack: mercy" }] },
};

async function setAi(page: Page, ai: { languageNotes: boolean; speech: string[] }) {
  await page.route("/api/workspace", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), ai } });
  });
}

function reportRequests(page: Page) {
  const posted: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/reports")
      posted.push(request);
  });
  return posted;
}

async function openReport(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "Report an AI result" }).click();
  return page.getByRole("dialog");
}

test("there is no report entry before any AI result", async ({ page }) => {
  await setAi(page, { languageNotes: true, speech: ["Swedish"] });
  await page.goto("/");
  await openMenu(page);
  await expect(page.getByRole("button", { name: "How practice works" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report an AI result" })).toHaveCount(0);
});

test("a language note is reported once, with the request that was sent", async ({ page }) => {
  await setAi(page, { languageNotes: true, speech: [] });
  await page.route("/api/feedback", (route) =>
    route.fulfill({ json: { status: "ready", comment: NOTE, activity: NOTE_ACTIVITY } }),
  );
  const posted = reportRequests(page);
  await page.goto("/");
  await createList(page, "Report a note", [["tack", "merci"]]);
  await page.getByRole("button", { name: "Start practice" }).click();
  await answer(page, "mercy");
  await expect(page.getByRole("complementary", { name: "AI language note" })).toContainText(NOTE);

  const dialog = await openReport(page);
  await expect(dialog.getByLabel("AI result")).toContainText("Language note · tack");
  // A note offers only the reasons that apply to a note.
  await expect(dialog.getByLabel("What is wrong?").locator("option")).toHaveText([
    "Choose a reason…",
    "Wrong or misleading note",
    "Something else",
  ]);
  await expect(dialog.getByRole("button", { name: "Send report" })).toBeDisabled();
  // Cancel discards, even with a reason chosen: it must not submit the form.
  await dialog.getByLabel("What is wrong?").selectOption("incorrect-note");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(posted).toHaveLength(0);

  // The sidebar is still open (on a phone, as the menu), so the entry is right there.
  await page.getByRole("button", { name: "Report an AI result" }).click();
  await dialog.getByLabel("What is wrong?").selectOption("incorrect-note");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByRole("status")).toContainText("Thank you");

  expect(posted).toHaveLength(1);
  const body = posted[0].postDataJSON();
  expect(body).toMatchObject({
    kind: "note",
    reason: "incorrect-note",
    word: "tack",
    model: "dummy/note-model",
    prompt: NOTE_ACTIVITY.prompt,
  });
  // Only what the report keeps: no word id, account or key.
  expect(Object.keys(body).sort()).toEqual([
    "activityId",
    "at",
    "kind",
    "language",
    "model",
    "prompt",
    "reason",
    "word",
  ]);
  const saved = await (await posted[0].response())!.json();
  expect(saved).toEqual({ status: "saved" });
});

test("audio is logged only when the provider was asked, and offers audio reasons", async ({
  page,
}) => {
  await setAi(page, { languageNotes: false, speech: ["Swedish", "French"] });
  let cache = "hit";
  await page.route("/api/speech", (route) =>
    route.fulfill({
      contentType: "audio/mpeg",
      headers: { "X-AI-Model": "dummy%2Ftts", "X-AI-Voice": "Mia", "X-Audio-Cache": cache },
      body: Buffer.from([0xff, 0xfb, 0x90, 0]),
    }),
  );
  const posted = reportRequests(page);
  await page.goto("/");
  await createList(page, "Report audio", [["tack", "merci"]]);

  // A cached clip is not a provider call, so there is nothing to report yet.
  const play = page.getByRole("button", { name: "Play tack in Swedish" });
  const played = page.waitForResponse("**/api/speech");
  await play.click();
  await played;
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Report an AI result" })).toHaveCount(0);
  const close = page.getByRole("button", { name: "Close menu" });
  if (await close.isVisible()) await close.click();

  cache = "miss";
  await expect(play).toBeEnabled();
  const fetched = page.waitForResponse("**/api/speech");
  await play.click();
  await fetched;
  const dialog = await openReport(page);
  await expect(dialog.getByLabel("AI result")).toContainText("Audio · tack");
  await expect(dialog.getByLabel("What is wrong?").locator("option")).toHaveText([
    "Choose a reason…",
    "Wrong pronunciation",
    "Wrong language or accent",
    "Garbled or cut-off audio",
    "Something else",
  ]);
  await dialog.getByLabel("What is wrong?").selectOption("pronunciation");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByRole("status")).toContainText("Thank you");
  expect(posted[0].postDataJSON()).toMatchObject({
    kind: "speech",
    reason: "pronunciation",
    word: "tack",
    language: "Swedish",
    model: "dummy/tts",
    voice: "Mia",
    prompt: { part: "native" },
  });
});
