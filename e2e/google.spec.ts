import { test, expect, type Page } from "@playwright/test";

// The sign-in page's Google sign-in (#152). Whether the site offers it is faked here, so no
// site setting changes under the other tests; the flow itself is in
// tests/integration/google.test.mts, against a fake Google.
async function offerGoogle(page: Page, enabled: boolean) {
  await page.route("/api/auth/google", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { enabled, origin: new URL(page.url()).origin } })
      : route.fallback(),
  );
}

test("Continue with Google shows only while the site offers it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);

  await offerGoogle(page, true);
  await page.reload();
  const button = page.getByRole("button", { name: "Continue with Google" });
  await expect(button).toBeVisible();
  // A native form post, so the browser follows the server's redirect to Google.
  const form = page.locator("form.google-sign-in");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("action", "/api/auth/google");
  await expect(page.getByText("Signing in with Google replaces your password")).toBeVisible();
});

test("a Google sign-in that didn't happen says why, once", async ({ page }) => {
  await offerGoogle(page, true);
  await page.goto("/?google=closed");
  await expect(page.getByRole("alert")).toHaveText(
    "Registration is closed, so no account was created. Contact the site owner.",
  );
  // The reason leaves the address, so a reload or bookmark doesn't show it again.
  await expect(page).toHaveURL((url) => !url.searchParams.has("google"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.goto("/?google=something-else");
  await expect(page.getByRole("alert")).toHaveText("Google sign-in didn't work. Try again.");
});
