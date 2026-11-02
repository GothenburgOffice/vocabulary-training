import { defineConfig, devices } from "@playwright/test";

// Browser tests against a running stack (CI's containers job, or the dev container), the same
// one the integration test uses. The browser sends its own Origin header, so TEST_BASE_URL must
// be APP_ORIGIN or one of APP_ORIGIN_ALIASES.
const baseURL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
