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
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
}

export async function saved(page: Page) {
  await expect(page.locator(".save-state")).toHaveText(/All changes saved/);
}

// Creates a list from the library in the editor's word-by-word mode and waits for the save.
export async function createList(page: Page, title: string, pairs: [string, string][]) {
  await page.getByRole("button", { name: "New word list" }).click();
  await page.getByLabel("List name").fill(title);
  for (const [i, [front, back]] of pairs.entries()) {
    if (i >= 5) await page.getByRole("button", { name: "Add a word pair" }).click();
    await page.getByLabel(`First language word ${i + 1}`).fill(front);
    await page.getByLabel(`Translation ${i + 1}`).fill(back);
  }
  await page.getByRole("button", { name: "Save word list" }).first().click();
  await expect(page.getByText("List updated.")).toBeVisible();
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
