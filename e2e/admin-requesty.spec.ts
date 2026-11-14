import { test, expect, type Page } from "@playwright/test";
import type { MonitorView } from "../lib/admin/ai-settings";
import type { UsageView } from "../lib/admin/requesty-usage";
import { signedInAsAdmin } from "./admin-fixtures";

signedInAsAdmin();

async function fakeAiSettings(page: Page, usage: UsageView) {
  const tier = { model: "", key: { state: "unset" } };
  let monitor: MonitorView = { key: { state: "unset" }, appLabel: "vocabulary-training" };
  const view = () => ({ encryptionReady: true, tiers: { basic: tier, plus: tier }, monitor });
  const saves: unknown[] = [];
  await page.route("/api/admin/ai", (route) => route.fulfill({ json: view() }));
  await page.route("/api/admin/ai/monitor", async (route) => {
    const update = route.request().postDataJSON();
    saves.push(update);
    if (update.apiKey)
      monitor = { ...monitor, key: { state: "set", hint: update.apiKey.slice(-4) } };
    if (update.appLabel) monitor = { ...monitor, appLabel: update.appLabel };
    await route.fulfill({ json: view() });
  });
  await page.route("/api/admin/ai/usage", (route) => route.fulfill({ json: usage }));
  await page.route("/api/admin/ai/monitor/create", async (route) => {
    saves.push({ create: route.request().postDataJSON() });
    await route.fulfill({
      json: {
        apiKey: "rqsty-sk-created-monitor",
        labelled: [{ tier: "basic", name: "Vocab basic" }],
        problems: ["No plus key here."],
      },
    });
  });
  return saves;
}

test("a saved monitor key shows the Requesty balance, this app's keys and usage", async ({
  page,
}) => {
  const saves = await fakeAiSettings(page, {
    configured: true,
    appLabel: "vocabulary-training",
    org: { name: "Gothenburg Office", balance: 42.5 },
    keys: [
      {
        name: "Vocab basic",
        tier: "basic",
        monthlySpend: 1.25,
        monthlyLimit: null,
        lastUsedAt: null,
      },
      { name: "Vocab plus", tier: "plus", monthlySpend: 0.5, monthlyLimit: 10, lastUsedAt: null },
    ],
    usage: [
      {
        period: "2026-11-01T00:00:00Z",
        tier: "basic",
        requests: 1200,
        inputTokens: 34000,
        outputTokens: 5600,
        spend: 1.25,
      },
    ],
    fetchedAt: "2026-11-06T10:00:00Z",
  });
  await page.goto("/admin/ai");
  await expect(page.getByText("Not set: usage isn't shown.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Requesty usage" })).toHaveCount(0);

  await page.getByLabel("Monitor key").fill("rqsty-sk-monitor-dummy");
  await page.getByRole("button", { name: "Save key" }).nth(2).click();
  await expect(page.getByText("Saved, ending in …ummy")).toBeVisible();
  expect(saves).toEqual([{ apiKey: "rqsty-sk-monitor-dummy" }]);

  const usage = page.getByRole("region", { name: "Requesty usage" });
  await expect(usage.getByText("$42.50")).toBeVisible();
  await expect(usage.getByRole("row", { name: /^basic Vocab basic/ }).getByRole("cell")).toHaveText(
    ["basic", "Vocab basic", "$1.25", "No limit"],
  );
  await expect(usage.getByRole("row", { name: /^plus Vocab plus/ }).getByRole("cell")).toHaveText([
    "plus",
    "Vocab plus",
    "$0.50",
    "$10.00",
  ]);
  await expect(usage.getByRole("row", { name: /^November 2026/ }).getByRole("cell")).toHaveText([
    "November 2026",
    "basic",
    "1,200",
    "34,000",
    "5,600",
    "$1.25",
  ]);
});

test("Requesty usage says so when no key carries this app's label", async ({ page }) => {
  const saves = await fakeAiSettings(page, {
    configured: true,
    appLabel: "vt",
    org: { name: "", balance: 3 },
    keys: [],
    usage: [],
    fetchedAt: "2026-11-06T10:00:00Z",
  });
  await page.goto("/admin/ai");
  await page.getByLabel("Monitor key").fill("rqsty-sk-monitor-dummy");
  await page.getByRole("button", { name: "Save key" }).nth(2).click();
  await page.getByLabel("App label").fill("vt");
  await page.getByRole("button", { name: "Save label" }).click();
  expect(saves).toEqual([{ apiKey: "rqsty-sk-monitor-dummy" }, { appLabel: "vt" }]);
  const usage = page.getByRole("region", { name: "Requesty usage" });
  await expect(
    usage.getByText("No Requesty key carries the label app=vt.", { exact: false }),
  ).toBeVisible();
  await expect(usage.getByText("No usage by keys labelled app=vt", { exact: false })).toBeVisible();
  await expect(usage.getByRole("table")).toHaveCount(0);
});

test("an admin key creates the read-only key, shown once until it's saved", async ({ page }) => {
  const saves = await fakeAiSettings(page, { configured: false });
  await page.goto("/admin/ai");
  const create = page.getByRole("button", { name: "Create read-only key" });
  await expect(create).toBeDisabled();
  await expect(page.getByLabel("Name for the new key")).toHaveValue("Vocabulary admin monitor");
  await page.getByLabel("Requesty admin key").fill("rqsty-sk-admin-dummy");
  await page.getByLabel("Name for the new key").fill("Vocab monitor");
  await create.click();

  const shown = page.getByLabel("New read-only key");
  await expect(shown).toHaveValue("rqsty-sk-created-monitor");
  await expect(page.getByLabel("Requesty admin key")).toHaveValue("");
  await expect(page.getByRole("status")).toHaveText(
    "Created. Copy the new key now: Requesty won't show it again. " +
      "Labelled app=vocabulary-training: basic (Vocab basic). No plus key here.",
  );

  await page.getByRole("button", { name: "Save this key" }).click();
  await expect(page.getByText("Saved, ending in …itor")).toBeVisible();
  await expect(shown).toHaveCount(0);
  expect(saves).toEqual([
    { create: { adminKey: "rqsty-sk-admin-dummy", name: "Vocab monitor", labelTiers: true } },
    { apiKey: "rqsty-sk-created-monitor" },
  ]);
});
