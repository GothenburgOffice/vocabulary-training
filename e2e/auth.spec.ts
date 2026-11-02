import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("register, sign out and sign back in", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  const password = "e2e-test-only-password";
  await page.goto("/");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Your French workspace." })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not-the-password-at-all");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your French workspace." })).toBeVisible();
});
