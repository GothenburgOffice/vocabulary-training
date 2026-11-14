import { test, expect } from "@playwright/test";
import { signedInAsAdmin } from "./admin-fixtures";

signedInAsAdmin();

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
  // AI usage is a section of Limits, above the write limit.
  await page.goto("/admin/limits");
  const section = page.getByRole("region", { name: "AI usage" });
  const save = section.getByRole("button", { name: "Save limits" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Speech: Letters per minute").fill("300");
  await page.getByLabel("Language notes: Letters per day, plus").fill("90000");
  await page.getByLabel("Speech request block (seconds)").fill("15");
  await save.click();
  await expect(section.getByRole("status")).toHaveText("Saved.");
  expect(saves).toEqual([
    {
      ...defaults,
      speech: { ...defaults.speech, lettersPerMinute: 300 },
      note: { ...defaults.note, lettersPerDay: { basic: 100000, plus: 90000 } },
      speechBlockMs: 15000,
    },
  ]);
  await expect(save).toBeDisabled();

  await section.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.getByLabel("Speech: Letters per minute")).toHaveValue("1200");
  await expect(page.getByLabel("Speech request block (seconds)")).toHaveValue("10");
  await save.click();
  await expect(section.getByRole("status")).toHaveText("Saved.");
  expect(saves[1]).toEqual(defaults);
});

test("answer timing settings are saved, and the calibration shows each threshold's share", async ({
  page,
}) => {
  // Answered here: the settings apply to every account.
  const defaults = { cutoffMs: { keyboard: 1000, touch: 1500 }, hardThreshold: 2 };
  let settings = structuredClone(defaults);
  const saves: unknown[] = [];
  const summary = {
    keyboard: {
      answers: 120,
      accounts: 3,
      buckets: [
        [0, 90],
        [8, 6],
        [12, 4],
      ],
    },
    touch: { answers: 5, accounts: 0, buckets: [] },
  };
  await page.route("/api/admin/timing", async (route) => {
    if (route.request().method() === "PUT") {
      settings = route.request().postDataJSON();
      saves.push(settings);
    }
    await route.fulfill({ json: { settings, defaults, summary } });
  });
  await page.goto("/admin/timing");
  await expect(page.getByRole("heading", { name: "Answer timing" })).toBeVisible();
  const keyboard = page.getByRole("row", { name: /^Physical keyboard/ });
  // Of 100 scored answers, 10 are at 2 or above and 4 at 3 or above; touch has none scored.
  await expect(keyboard.getByRole("cell")).toHaveText([
    "120",
    "3",
    "100",
    "10.0%",
    "10.0%",
    "10.0%",
    "4.0%",
    "4.0%",
    "0.0%",
  ]);
  await expect(
    page
      .getByRole("row", { name: /^Touchscreen/ })
      .getByRole("cell")
      .last(),
  ).toHaveText("–");
  const save = page.getByRole("button", { name: "Save timing settings" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Touchscreen: pause cutoff (ms)").fill("2000");
  await page.getByLabel("Hard threshold").fill("2.5");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(saves).toEqual([{ cutoffMs: { keyboard: 1000, touch: 2000 }, hardThreshold: 2.5 }]);
  // The threshold set is marked in the table.
  await expect(page.getByRole("columnheader", { name: "≥ 2.5 (set)" })).toBeVisible();
});

test("the write limit is saved, and reset to the defaults", async ({ page }) => {
  // Answered here: the limit applies to every account.
  const defaults = { perHour: 20000, perDay: 300000 };
  let limits = structuredClone(defaults);
  const saves: unknown[] = [];
  await page.route("/api/admin/limits/writes", async (route) => {
    if (route.request().method() === "PUT") {
      limits = route.request().postDataJSON();
      saves.push(limits);
    }
    await route.fulfill({ json: { limits, defaults } });
  });
  await page.route("/api/admin/limits", (route) =>
    route.fulfill({
      json: {
        limits: {
          speech: { lettersPerMinute: 1, lettersPerDay: { basic: 1, plus: 1 }, cooldownMs: 0 },
          note: { lettersPerMinute: 1, lettersPerDay: { basic: 1, plus: 1 }, cooldownMs: 0 },
          speechBlockMs: 10000,
        },
        defaults: {
          speech: { lettersPerMinute: 1, lettersPerDay: { basic: 1, plus: 1 }, cooldownMs: 0 },
          note: { lettersPerMinute: 1, lettersPerDay: { basic: 1, plus: 1 }, cooldownMs: 0 },
          speechBlockMs: 10000,
        },
      },
    }),
  );
  await page.goto("/admin/limits");
  const section = page.getByRole("region", { name: "Saves" });
  const save = section.getByRole("button", { name: "Save write limits" });
  await expect(save).toBeDisabled();
  await section.getByLabel("Saves per hour").fill("50000");
  await save.click();
  await expect(section.getByRole("status")).toHaveText("Saved.");
  expect(saves).toEqual([{ perHour: 50000, perDay: 300000 }]);
  await section.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(section.getByLabel("Saves per hour")).toHaveValue("20000");
  await save.click();
  await expect(section.getByRole("status")).toHaveText("Saved.");
  expect(saves[1]).toEqual(defaults);
});

test("the Google client is saved with a write-only secret, and removed", async ({ page }) => {
  // Answered here: the client is a site setting, so tests never change the real one.
  const redirectUri = "http://127.0.0.1:3013/api/auth/google/callback";
  let view = {
    encryptionReady: true,
    clientId: "",
    secret: { state: "unset" },
    redirectUri,
    enabled: false,
  };
  const saves: unknown[] = [];
  await page.route("/api/admin/google", async (route) => {
    if (route.request().method() === "PUT") {
      const update = route.request().postDataJSON();
      saves.push(update);
      const secret =
        update.clientSecret === null
          ? { state: "unset" }
          : update.clientSecret
            ? { state: "set", hint: update.clientSecret.slice(-4) }
            : view.secret;
      view = {
        ...view,
        clientId: update.clientId,
        secret,
        enabled: Boolean(update.clientId) && secret.state === "set",
      };
    }
    await route.fulfill({ json: view });
  });
  await page.goto("/admin/registration");
  const card = page.getByRole("form", { name: "Google sign-in" });
  await expect(card.getByRole("status")).toHaveText(
    "Off: save a client ID and secret to offer it.",
  );
  await expect(card.getByLabel("Authorized redirect URI")).toHaveValue(redirectUri);
  await card.getByLabel("Client ID").fill("1234-test.apps.googleusercontent.com");
  await card.getByLabel("Client secret").fill("e2e-test-only-secret");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("status").first()).toHaveText(
    "On: the sign-in page offers Continue with Google.",
  );
  // The secret field empties; only its last characters are shown.
  await expect(card.getByLabel("Client secret")).toHaveValue("");
  await expect(card.getByText("Saved, ending in …cret")).toBeVisible();

  await card.getByRole("button", { name: "Remove client" }).click();
  await expect(card.getByRole("status").first()).toHaveText(
    "Off: save a client ID and secret to offer it.",
  );
  expect(saves).toEqual([
    { clientId: "1234-test.apps.googleusercontent.com", clientSecret: "e2e-test-only-secret" },
    { clientId: "", clientSecret: null },
  ]);
});
