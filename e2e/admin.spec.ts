import { test, expect, type Page } from "@playwright/test";
import type { LanguageView } from "../lib/admin/ai-settings";
import { ADMIN_STATE } from "./global-setup";

test.skip(
  !process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
  "needs an admin account: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD",
);

const blank = { model: "", voice: "", instructions: "" };
const language = (name: string, code: string): LanguageView => ({
  name,
  code,
  revision: "1",
  hidden: false,
  speech: blank,
  plusSpeech: blank,
});

// The languages API, answered here so no real site setting changes: languages can't be
// deleted, and other tests use them. `refuse` names languages whose next save gets 409.
async function fakeLanguages(page: Page, refuse: string[] = []) {
  let languages = [language("Swedish", "sv"), language("French", "fr"), language("German", "de")];
  const saves: LanguageView[] = [];
  await page.route("/api/admin/languages", async (route) => {
    const request = route.request();
    const data = request.postDataJSON();
    if (request.method() === "PUT") {
      if (refuse.includes(data.name)) {
        refuse.splice(refuse.indexOf(data.name), 1);
        return route.fulfill({
          status: 409,
          json: { error: "This language changed in another tab. Reload to see it." },
        });
      }
      saves.push(data);
      languages = languages.map((l) =>
        l.name === data.name ? { ...data, revision: String(Number(l.revision) + 1) } : l,
      );
    } else if (request.method() === "PATCH") {
      languages = data.order.map((name: string) => languages.find((l) => l.name === name)!);
    } else if (request.method() === "POST") {
      languages = [...languages, language(data.name, data.code)];
    }
    return route.fulfill({ json: { languages } });
  });
  return saves;
}

// Signed in once for the whole run by global-setup.ts.
test.use({ storageState: ADMIN_STATE });

test("languages are edited in place and saved together", async ({ page }) => {
  const saves = await fakeLanguages(page, ["French"]);
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
  await page.getByLabel("Value").fill("openai/gpt-4o-mini-tts");
  await page.getByRole("button", { name: "Apply to 2" }).click();
  await expect(page.getByLabel("French speech model")).toHaveValue("openai/gpt-4o-mini-tts");
  await expect(page.getByLabel("German speech model")).toHaveValue("openai/gpt-4o-mini-tts");
  await expect(page.getByLabel("Swedish speech model")).toHaveValue("");
  await expect(page.getByLabel("German speech voice")).toBeEnabled();

  // French was changed in "another tab": it keeps its edits and says why; the rest save.
  await expect(save).toHaveText("Save changes (3)");
  await save.click();
  await expect(page.locator(".lang-errors")).toContainText(
    "French: This language changed in another tab.",
  );
  await expect(page.getByText("1 not saved.")).toBeVisible();
  await expect(save).toHaveText("Save changes (1)");
  expect(saves.map((s) => s.name)).toEqual(["Swedish", "German"]);
  expect(saves[1]).toMatchObject({ hidden: true, speech: { model: "openai/gpt-4o-mini-tts" } });

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByLabel("French speech model")).toHaveValue("");
  await expect(save).toBeDisabled();
});

test("languages are added and reordered from the table", async ({ page }) => {
  await fakeLanguages(page);
  await page.goto("/admin/languages");
  await page.getByLabel("New language", { exact: true }).fill("Finnish");
  await page.getByLabel("New language code").fill("fi");
  await page.getByRole("button", { name: "Add language" }).click();
  const names = page.locator(".lang-table tbody .lang-name");
  await expect(names).toHaveText(["Swedish", "French", "German", "Finnish"]);

  await page.getByRole("button", { name: "Move Finnish up" }).click();
  await expect(names).toHaveText(["Swedish", "French", "Finnish", "German"]);
  await expect(page.getByRole("button", { name: "Move Swedish up" })).toBeDisabled();
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
