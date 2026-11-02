import { test, expect, type Page } from "@playwright/test";
import type { LanguageView } from "../lib/admin/ai-settings";
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

test("reports show action details and prune only after confirmation", async ({ page }) => {
  let pruned = false;
  const report = {
    id: "report-1",
    reason: "pronunciation",
    createdAt: "2026-11-02T20:05:00.000Z",
    activity: {
      id: "action-1",
      kind: "speech",
      word: "bonjour",
      language: "French",
      model: "test/speech",
      voice: "test-voice",
      tier: "basic",
      createdAt: "2026-11-02T20:00:00.000Z",
    },
  };
  await page.route("/api/admin/reports", (route) => {
    if (route.request().method() === "DELETE") {
      pruned = true;
      return route.fulfill({ json: { deleted: 1 } });
    }
    return route.fulfill({ json: { reports: pruned ? [] : [report] } });
  });
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await expect(page.getByText("bonjour", { exact: true })).toBeVisible();
  await expect(page.getByText(/Model: test\/speech/)).toContainText("Voice: test-voice");
  const prune = page.getByRole("button", { name: "Prune reports older than 15 days" });
  page.once("dialog", (dialog) => void dialog.dismiss());
  await prune.click();
  expect(pruned).toBe(false);
  page.once("dialog", (dialog) => void dialog.accept());
  await prune.click();
  await expect(page.getByRole("status")).toHaveText("Deleted 1 report older than 15 days.");
  await expect(page.getByText("No reports yet.")).toBeVisible();
  expect(pruned).toBe(true);
});
