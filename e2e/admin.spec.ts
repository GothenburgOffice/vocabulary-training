import { test, expect, type Page } from "@playwright/test";
import type { LanguageView } from "../lib/admin/ai-settings";
import { USERS_PAGE_SIZE, isE2eAccountEmail } from "../lib/admin/users";
import { ADMIN_STATE } from "./global-setup";

test.skip(
  !process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
  "needs an admin account: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD",
);

const blank = { model: "", voice: "", instructions: "" };
const MODELS = [
  "deepinfra/XiaomiMiMo/MiMo-V2.5-tts",
  "deepinfra/hexgrad/Kokoro-82M",
  "openai/gpt-4o-mini-tts",
];
const language = (name: string, code: string): LanguageView => ({
  name,
  code,
  revision: "1",
  hidden: false,
  highlighted: false,
  speech: blank,
  plusSpeech: blank,
});

// The languages API, answered here so no real site setting changes: languages can't be
// deleted, and other tests use them. Like the server, a save from an older revision gets 409;
// `changeElsewhere` changes a language as another tab would.
async function fakeLanguages(page: Page) {
  let languages = [language("Swedish", "sv"), language("French", "fr"), language("German", "de")];
  const saves: LanguageView[] = [];
  const bump = (l: LanguageView) => String(Number(l.revision) + 1);
  await page.route("/api/admin/languages", async (route) => {
    const request = route.request();
    const data = request.postDataJSON();
    if (request.method() === "PUT") {
      if (languages.find((l) => l.name === data.name)?.revision !== data.revision)
        return route.fulfill({
          status: 409,
          json: { error: "This language changed in another tab. Reload to see it." },
        });
      saves.push(data);
      languages = languages.map((l) => (l.name === data.name ? { ...data, revision: bump(l) } : l));
    } else if (request.method() === "POST") {
      languages = [...languages, language(data.name, data.code)];
    }
    // Listed like the server does: highlighted first, then by name.
    languages.sort(
      (a, b) => Number(b.highlighted) - Number(a.highlighted) || a.name.localeCompare(b.name),
    );
    return route.fulfill({ json: { languages } });
  });
  // Requesty's model list, as the admin API returns it for a tier's key.
  await page.route("/api/admin/models", (route) =>
    route.fulfill({ json: { chat: [], speech: MODELS } }),
  );
  const changeElsewhere = (name: string, change: Partial<LanguageView>) => {
    languages = languages.map((l) =>
      l.name === name ? { ...l, ...change, revision: bump(l) } : l,
    );
  };
  return { saves, changeElsewhere };
}

// Signed in once for the whole run by global-setup.ts.
test.use({ storageState: ADMIN_STATE });

test("languages are edited in place and saved together", async ({ page }) => {
  const { saves, changeElsewhere } = await fakeLanguages(page);
  await page.goto("/admin/languages");
  const rows = page.locator(".lang-table tbody tr");
  await expect(rows).toHaveCount(3);
  const save = page.getByRole("button", { name: /^Save changes/ });
  await expect(save).toBeDisabled();

  await page.getByLabel("Swedish code").fill("se");
  await page.getByLabel("German hidden").check();
  await expect(rows.filter({ hasText: "Swedish" })).toHaveClass(/is-changed/);
  await expect(save).toHaveText("Save changes (2)");

  // Tick two rows and set the speech model on both.
  await page.getByLabel("Select French").check();
  await page.getByLabel("Select German").check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByLabel("Field to set").selectOption("speech.model");
  await page.getByLabel("Value").selectOption("openai/gpt-4o-mini-tts");
  await page.getByRole("button", { name: "Apply to 2" }).click();
  await expect(page.getByLabel("French speech model")).toHaveValue("openai/gpt-4o-mini-tts");
  await expect(page.getByLabel("German speech model")).toHaveValue("openai/gpt-4o-mini-tts");
  await expect(page.getByLabel("Swedish speech model")).toHaveValue("");
  await expect(page.getByLabel("German speech voice")).toBeEnabled();

  // French is changed in another tab meanwhile: it keeps its edits and says why; the rest save.
  changeElsewhere("French", { code: "fr-fr" });
  await expect(save).toHaveText("Save changes (3)");
  await save.click();
  await expect(page.locator(".lang-errors")).toContainText(
    "French: This language changed in another tab.",
  );
  await expect(page.getByText("1 not saved.")).toBeVisible();
  await expect(save).toHaveText("Save changes (1)");
  expect(saves.map((s) => s.name)).toEqual(["German", "Swedish"]);
  expect(saves[0]).toMatchObject({ hidden: true, speech: { model: "openai/gpt-4o-mini-tts" } });

  // Saving again can't overwrite the other tab's change, even after other rows saved.
  await save.click();
  await expect(page.getByText("1 not saved.")).toBeVisible();
  expect(saves.map((s) => s.name)).toEqual(["German", "Swedish"]);

  // Discard shows French as the other tab left it.
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByLabel("French speech model")).toHaveValue("");
  await expect(page.getByLabel("French code")).toHaveValue("fr-fr");
  await expect(save).toBeDisabled();
});

test("leaving by an admin link with unsaved rows asks first", async ({ page }) => {
  await fakeLanguages(page);
  await page.goto("/admin/languages");
  await page.getByLabel("Swedish code").fill("se");
  const nav = page.getByRole("navigation", { name: "Admin sections" });

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Leave without saving 1 changed language?");
    void dialog.dismiss();
  });
  await nav.getByRole("link", { name: "AI settings" }).click();
  await expect(page).toHaveURL(/\/admin\/languages$/);
  await expect(page.getByLabel("Swedish code")).toHaveValue("se");

  page.once("dialog", (dialog) => void dialog.accept());
  await nav.getByRole("link", { name: "AI settings" }).click();
  await expect(page).toHaveURL(/\/admin\/ai$/);
});

test("highlighted languages come first, the rest by name", async ({ page }) => {
  await fakeLanguages(page);
  await page.goto("/admin/languages");
  const names = page.locator(".lang-table tbody .lang-name");
  await expect(names).toHaveText(["French", "German", "Swedish"]);
  await expect(page.getByRole("button", { name: /Move/ })).toHaveCount(0);

  await page.getByLabel("New language", { exact: true }).fill("Finnish");
  await page.getByLabel("New language code").fill("fi");
  await page.getByRole("button", { name: "Add language" }).click();
  await expect(names).toHaveText(["Finnish", "French", "German", "Swedish"]);

  // Rows keep their place while edited; saving puts the highlighted ones first.
  await page.getByLabel("Swedish highlighted").check();
  await page.getByLabel("German highlighted").check();
  await expect(names).toHaveText(["Finnish", "French", "German", "Swedish"]);
  await page.getByRole("button", { name: /^Save changes/ }).click();
  await expect(names).toHaveText(["German", "Swedish", "Finnish", "French"]);
});

test("language headings sort the table, and an edited row stays put", async ({ page }) => {
  await fakeLanguages(page);
  await page.goto("/admin/languages");
  const names = page.locator(".lang-table tbody .lang-name");
  const code = page.getByRole("button", { name: "Code", exact: true });
  await code.click();
  await expect(names).toHaveText(["German", "French", "Swedish"]);
  await expect(page.getByRole("columnheader", { name: "Code" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await code.click();
  await expect(names).toHaveText(["Swedish", "French", "German"]);
  // Sorted by saved values: typing a new code doesn't move the row under the cursor.
  await page.getByLabel("German code").fill("aa");
  await expect(names).toHaveText(["Swedish", "French", "German"]);
  // Yes/no columns put the ticked rows first.
  await page.getByLabel("French hidden").check();
  await page.getByRole("button", { name: /^Save changes/ }).click();
  await page.getByRole("button", { name: "Hidden", exact: true }).click();
  await expect(names.first()).toHaveText(/French/);
});

test("the table scrolls inside its frame, not the page", async ({ page }) => {
  await fakeLanguages(page);
  await page.goto("/admin/languages");
  await expect(page.locator(".lang-table")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an edit made while saving is kept, and saves next", async ({ page }) => {
  const { saves } = await fakeLanguages(page);
  // Hold the save's answer until the row has been edited again (later routes run first).
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("/api/admin/languages", async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.fallback();
  });
  await page.goto("/admin/languages");
  const save = page.getByRole("button", { name: /^Save changes/ });
  await page.getByLabel("Swedish code").fill("se");
  await save.click();
  await expect(page.getByText("Saving…")).toBeVisible();
  await page.getByLabel("Swedish code").fill("sw");
  release();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByLabel("Swedish code")).toHaveValue("sw");
  await expect(save).toHaveText("Save changes (1)");
  // Based on the first save's revision, so it isn't refused as stale.
  await save.click();
  await expect(save).toBeDisabled();
  expect(saves.map((s) => s.code)).toEqual(["se", "sw"]);
});

test("model and voice cells list every choice, whatever they hold", async ({ page }) => {
  const { changeElsewhere } = await fakeLanguages(page);
  changeElsewhere("Swedish", { speech: { ...blank, model: "openai/gpt-4o-mini-tts" } });
  changeElsewhere("French", { speech: { ...blank, model: "someone/old-model" } });
  await page.goto("/admin/languages");
  const swedish = page.getByLabel("Swedish speech model");
  await expect(swedish).toHaveValue("openai/gpt-4o-mini-tts");
  await expect(swedish.locator("option")).toHaveText(["none", ...MODELS]);
  // A model that isn't in Requesty's list stays, marked.
  await expect(page.getByLabel("French speech model").locator("option")).toHaveText([
    "none",
    "someone/old-model (not listed)",
    ...MODELS,
  ]);
  await expect(page.getByLabel("German plus speech model").locator("option").first()).toHaveText(
    "basic",
  );

  await swedish.selectOption("deepinfra/hexgrad/Kokoro-82M");
  await expect(page.getByLabel("Swedish speech voice").locator("option")).toContainText([
    "default",
    "af_heart",
  ]);
  await page.getByLabel("Swedish speech voice").selectOption("af_heart");

  // Voices are grouped by language where the model has several, as for MiMo.
  await page.getByLabel("Swedish speech model").selectOption("deepinfra/XiaomiMiMo/MiMo-V2.5-tts");
  const voice = page.getByLabel("Swedish speech voice");
  await expect(voice.locator("optgroup")).toHaveCount(2);
  await expect(voice.locator("optgroup[label=Chinese] option")).toHaveText([
    "冰糖",
    "茉莉",
    "苏打",
    "白桦",
  ]);
  await voice.selectOption("茉莉");
  await expect(voice).toHaveValue("茉莉");
  await expect(page.getByRole("button", { name: /^Save changes/ })).toHaveText("Save changes (1)");
});

test("AI limits are edited and saved together, and reset to the defaults", async ({ page }) => {
  // Answered here: the limits apply to every account, so tests never change the real ones.
  const defaults = {
    speech: {
      lettersPerMinute: 1200,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 500,
    },
    note: {
      lettersPerMinute: 3000,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 3000,
    },
    speechBlockMs: 10000,
  };
  let limits = structuredClone(defaults);
  const saves: unknown[] = [];
  await page.route("/api/admin/limits", async (route) => {
    if (route.request().method() === "PUT") {
      limits = route.request().postDataJSON();
      saves.push(limits);
    }
    await route.fulfill({ json: { limits, defaults } });
  });
  await page.goto("/admin/limits");
  const save = page.getByRole("button", { name: "Save limits" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Speech: Letters per minute").fill("300");
  await page.getByLabel("Language notes: Letters per day, plus").fill("90000");
  await page.getByLabel("Speech request block (seconds)").fill("15");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(saves).toEqual([
    {
      ...defaults,
      speech: { ...defaults.speech, lettersPerMinute: 300 },
      note: { ...defaults.note, lettersPerDay: { basic: 100000, plus: 90000 } },
      speechBlockMs: 15000,
    },
  ]);
  await expect(save).toBeDisabled();

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByLabel("Speech: Letters per minute")).toHaveValue("1200");
  await expect(page.getByLabel("Speech request block (seconds)")).toHaveValue("10");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(saves[1]).toEqual(defaults);
});

test("users can be filtered, re-typed, locked, trashed and restored, with E2E cleanup", async ({
  page,
}) => {
  const viewerId = "7199f62c-4c8b-43a6-8ca6-9711c6bffb04";
  const testId = "a620960f-133c-4e1b-8cf6-04bf2d37e8cd";
  const learnerId = "523c4025-e0ca-4898-9d65-a36cf00c424f";
  const account = (id: string, email: string) => ({
    id,
    email,
    created_at: "2026-10-01T10:00:00.000Z",
    last_sign_in_at: null,
    ai_tier: "basic" as const,
    is_admin: false,
    locked_at: null as string | null,
    deleted_at: null as string | null,
    speech_calls_day: 2,
    speech_letters_day: 120,
    speech_calls_week: 3,
    speech_letters_week: 180,
    speech_calls_90: 4,
    speech_letters_90: 240,
    note_calls_day: 1,
    note_letters_day: 40,
    note_calls_week: 2,
    note_letters_week: 80,
    note_calls_90: 3,
    note_letters_90: 120,
  });
  let accounts = [
    account(testId, "e2e-test@example.test"),
    account(learnerId, "learner@example.test"),
  ];
  const limits = {
    speech: {
      lettersPerMinute: 1200,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 500,
    },
    note: {
      lettersPerMinute: 3000,
      lettersPerDay: { basic: 100000, plus: 300000 },
      cooldownMs: 3000,
    },
    speechBlockMs: 10000,
  };
  await page.route("**/api/admin/users**", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      // Like the server: one change at a time, and the changed access comes back.
      const { userId, tier, locked, trashed } = request.postDataJSON();
      const now = "2026-11-02T10:00:00.000Z";
      accounts = accounts.map((user) =>
        user.id !== userId
          ? user
          : tier
            ? { ...user, ai_tier: tier }
            : locked !== undefined
              ? { ...user, locked_at: locked ? now : null }
              : { ...user, deleted_at: trashed ? now : null },
      );
      const changed = accounts.find((user) => user.id === userId)!;
      return route.fulfill({
        json: tier
          ? { ok: true }
          : {
              account: {
                id: changed.id,
                locked_at: changed.locked_at,
                deleted_at: changed.deleted_at,
              },
            },
      });
    }
    if (request.method() === "DELETE") {
      // Only the E2E cleanup deletes at once.
      accounts = accounts.filter((user) => !isE2eAccountEmail(user.email));
      return route.fulfill({ json: { deleted: 1 } });
    }
    const params = new URL(request.url()).searchParams;
    const q = params.get("q")?.toLowerCase() ?? "";
    const scope = params.get("scope");
    const matching = accounts.filter((user) => {
      const isTestAccount = isE2eAccountEmail(user.email);
      return (
        user.email.toLowerCase().includes(q) &&
        (scope !== "test" || isTestAccount) &&
        (scope !== "regular" || !isTestAccount) &&
        (scope !== "trash" || user.deleted_at !== null)
      );
    });
    const offset = Number(params.get("offset") ?? 0);
    return route.fulfill({
      json: {
        viewerId,
        accounts: matching.slice(offset, offset + USERS_PAGE_SIZE),
        limits,
        total: matching.length,
        testAccounts: accounts.filter((user) => isE2eAccountEmail(user.email)).length,
        pageSize: USERS_PAGE_SIZE,
        trashDays: 30,
      },
    });
  });

  await page.goto("/admin/users");
  const rows = page.locator(".users-table tbody tr");
  await expect(rows).toHaveCount(2);
  // Everything is in the row: the first usage cell is speech in the last 24 hours, as letters
  // of the budget and calls.
  await expect(rows.first().locator(".usage").first()).toHaveText("120 / 100K (2)");
  await page.getByLabel("Account type for learner@example.test").selectOption("plus");
  await expect(page.getByLabel("Account type for learner@example.test")).toHaveValue("plus");

  // Search runs on the server: the fake narrows the list only when the query is sent.
  await page.getByLabel("Search by email").fill("learner");
  await expect(page.locator(".users-table .user-email")).toHaveText(["learner@example.test"]);
  await expect(page.getByText("Showing 1 of 1 matching accounts.")).toBeVisible();
  await page.getByLabel("Search by email").fill("");
  await expect(rows).toHaveCount(2);

  // Lock and unlock.
  const learner = rows.filter({ hasText: "learner@example.test" });
  const state = learner.locator(".user-state");
  await expect(state).toHaveText("Active");
  await learner.getByRole("button", { name: "Lock account learner@example.test" }).click();
  await expect(state).toContainText("Locked since");
  await expect(state.locator("span")).toHaveAttribute("title", /It can’t sign in\./);
  await learner.getByRole("button", { name: "Unlock account learner@example.test" }).click();
  await expect(state).toHaveText("Active");

  // The trash asks first, says when the account is deleted for good, and can be undone.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Move learner@example.test to the trash?");
    expect(dialog.message()).toContain("(30 days)");
    void dialog.accept();
  });
  await learner.getByRole("button", { name: "Move to trash account learner@example.test" }).click();
  await expect(state).toContainText("In the trash, deleted");
  // An account in the trash is locked by being there; it offers only Restore.
  await expect(learner.getByRole("button", { name: /^Lock account/ })).toHaveCount(0);
  await page.getByLabel("Account filter").selectOption("trash");
  await expect(page.locator(".users-table .user-email")).toHaveText(["learner@example.test"]);
  await learner.getByRole("button", { name: "Restore account learner@example.test" }).click();
  await expect(state).toHaveText("Active");
  await page.getByLabel("Account filter").selectOption("all");
  await expect(rows).toHaveCount(2);

  await page.getByLabel("Account filter").selectOption("test");
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("e2e-test@example.test")).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Permanently delete 1 E2E test accounts");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete test accounts (1)" }).click();
  await expect(page.getByText("Deleted 1 E2E test accounts.")).toBeVisible();
  await expect(rows).toHaveCount(0);
});

test("reports list newest first by page, show the request sent, and prune old ones", async ({
  page,
}) => {
  const report = (id: string, word: string, on: string) => ({
    id,
    reported_on: on,
    activity_on: on,
    kind: "speech",
    reason: "pronunciation",
    word,
    language: "French",
    model: "vendor/tts",
    voice: "Mia",
    tier: "basic",
    prompt: { part: "learning" },
  });
  const newer = report("0f8c2f8e-5d0a-4a57-9a43-2f1b0f6d2a11", "merci", "2026-11-03");
  const older = report("1a2b3c4d-5e6f-4a57-9a43-2f1b0f6d2a11", "bonjour", "2026-10-01");
  let reports = [newer, older];
  const pages: (string | null)[] = [];
  const prunes: unknown[] = [];
  // Like the server: newest first, one report per page here so "Load more" shows the cursor.
  await page.route(/\/api\/admin\/reports(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      prunes.push(request.postDataJSON());
      reports = [];
      return route.fulfill({ json: { deleted: 2 } });
    }
    const url = new URL(request.url());
    const beforeId = url.searchParams.get("beforeId");
    pages.push(beforeId && `${url.searchParams.get("beforeOn")}/${beforeId}`);
    const start = beforeId ? reports.findIndex((row) => row.id === beforeId) + 1 : 0;
    return route.fulfill({
      json: {
        reports: reports.slice(start, start + 1),
        total: reports.length,
        prunable: reports.length,
        retentionDays: 15,
        pageSize: 1,
      },
    });
  });

  await page.goto("/admin/reports");
  const cards = page.locator(".report-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Audio · merci");
  await expect(cards.first()).toContainText(
    "Wrong pronunciation · French · vendor/tts · Mia · basic",
  );
  // Dates only: reports keep no times.
  await expect(cards.first()).toContainText("Reported 2026-11-03 · result from 2026-11-03");
  await cards.first().getByText("Request sent, as the learner’s browser recorded it").click();
  await expect(cards.first().locator("pre")).toContainText('"part": "learning"');
  // No account is shown with a report (the header's email is the signed-in admin).
  await expect(page.locator(".report-list")).not.toContainText("@");

  // The next page continues after the last report shown, by date and id.
  await page.getByRole("button", { name: "Load more reports" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toContainText("Audio · bonjour");
  expect(pages).toEqual([null, `2026-11-03/${newer.id}`]);

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toBe("Permanently delete 2 reports older than 15 days?");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Delete reports older than 15 days (2)" }).click();
  await expect(page.getByText("Deleted 2 reports.")).toBeVisible();
  expect(prunes).toEqual([{ olderThanDays: 15 }]);
  await expect(page.getByText("No reports yet.")).toBeVisible();
});
