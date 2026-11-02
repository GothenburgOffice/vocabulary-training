import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export type Account = { email: string; password: string };

// Each test gets its own account, registered through the API so only the auth test spends
// time on the form. The page shares the context's cookies, so it starts signed in.
export const test = base.extend<{ account: Account }>({
  account: [
    async ({ page, baseURL }, use) => {
      const account = {
        email: `e2e-${randomUUID()}@example.test`,
        password: "e2e-test-only-password",
      };
      const response = await page.request.post("/api/auth", {
        headers: { Origin: new URL(baseURL!).origin },
        data: { action: "register", ...account },
      });
      expect(response.status(), await response.text()).toBe(200);
      await use(account);
    },
    { auto: true },
  ],
});

// On a phone the sidebar is behind the Menu button.
export async function openMenu(page: Page) {
  // Wait for the workspace, or a page still loading would look like a desktop.
  await expect(page.locator(".app-shell")).toBeAttached();
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}

// The save status: in the sidebar, or in the header on a phone.
export const saveState = (page: Page) => page.locator(".save-state").filter({ visible: true });

export async function saved(page: Page) {
  await expect(saveState(page)).toHaveText(/All changes saved/);
}

// The account dialog, from the sidebar's account row.
export async function openAccount(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "Open profile" }).click();
  return page.getByRole("dialog");
}

// Leaves the list editor with Done; what's waiting is saved as it closes.
export async function done(page: Page) {
  await page.getByRole("button", { name: "Done" }).first().click();
}

// Creates a list from the library: a name first, then word pairs, which save as they're typed.
export async function createList(page: Page, title: string, pairs: [string, string][]) {
  await page.getByRole("button", { name: "New word list" }).click();
  await page.getByLabel("List name").fill(title);
  await page.getByRole("button", { name: "Add words" }).click();
  for (const [i, [front, back]] of pairs.entries()) {
    if (i >= 5) await page.getByRole("button", { name: "Add a word pair" }).click();
    await page.getByLabel(`First language word ${i + 1}`).fill(front);
    await page.getByLabel(`Translation ${i + 1}`).fill(back);
  }
  await done(page);
  await expect(page.getByText(`Inside ${title}`)).toBeVisible();
  await saved(page);
}

// The word currently asked; practice order is random, so tests look up what to do with it.
export async function prompt(page: Page) {
  const word = page.locator(".prompt-word > span").first();
  await expect(word).not.toBeEmpty();
  return (await word.textContent())!;
}

export async function answer(page: Page, text: string) {
  await page.getByLabel("Your answer").fill(text);
  await page.getByRole("button", { name: "Check answer" }).click();
}
