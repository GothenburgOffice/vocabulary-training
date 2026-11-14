import { test, expect } from "@playwright/test";
import { signedInAsAdmin } from "./admin-fixtures";

signedInAsAdmin();

test("the SMTP settings are saved and a test mail is sent to the address entered", async ({
  page,
}) => {
  // Answered here: mail settings are site-wide, so tests never change the real ones.
  let view = {
    encryptionReady: true,
    host: "",
    port: 587,
    security: "starttls",
    user: "",
    password: { state: "unset" },
    from: "",
    plaintextAllowed: false,
    enabled: false,
  };
  const saves: Record<string, unknown>[] = [];
  const tests: unknown[] = [];
  await page.route("/api/admin/email", async (route) => {
    if (route.request().method() === "PUT") {
      const data = route.request().postDataJSON();
      saves.push(data);
      view = {
        ...view,
        ...data,
        password: data.password ? { state: "set", hint: "cret" } : view.password,
        enabled: Boolean(data.host && data.from),
      };
    }
    await route.fulfill({ json: view });
  });
  await page.route("/api/admin/email/test", async (route) => {
    tests.push(route.request().postDataJSON());
    await route.fulfill({ json: { sent: true } });
  });
  await page.goto("/admin/email");
  const form = page.getByRole("form", { name: "SMTP server" });
  await expect(form.getByRole("status").first()).toContainText("Off");
  await expect(page.getByRole("button", { name: "Send test mail" })).toBeDisabled();
  // Plain SMTP is not offered on a real site.
  await expect(form.getByLabel("Security").getByRole("option")).toHaveCount(2);

  await form.getByLabel("Host").fill("smtp.example.test");
  await form.getByLabel("User name").fill("mailer");
  await form.getByLabel("Password").fill("a-secret");
  await form.getByLabel("From address").fill("Vocabulary <no-reply@example.test>");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Saved.")).toBeVisible();
  expect(saves).toEqual([
    {
      host: "smtp.example.test",
      port: 587,
      security: "starttls",
      user: "mailer",
      from: "Vocabulary <no-reply@example.test>",
      password: "a-secret",
    },
  ]);
  // The password is write-only: only its last characters come back.
  await expect(form.getByText("Saved, ending in …cret")).toBeVisible();
  await expect(form.getByLabel("Password")).toHaveValue("");

  const mail = page.getByRole("form", { name: "Test mail" });
  await mail.getByLabel("Send to").fill("me@example.test");
  await mail.getByRole("button", { name: "Send test mail" }).click();
  await expect(mail.getByRole("status")).toHaveText("Test mail sent to me@example.test.");
  expect(tests).toEqual([{ to: "me@example.test" }]);
});

test("a refused test mail shows the reason", async ({ page }) => {
  await page.route("/api/admin/email", (route) =>
    route.fulfill({
      json: {
        encryptionReady: true,
        host: "smtp.example.test",
        port: 587,
        security: "starttls",
        user: "",
        password: { state: "unset" },
        from: "no-reply@example.test",
        plaintextAllowed: false,
        enabled: true,
      },
    }),
  );
  await page.route("/api/admin/email/test", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "The mail server refused the user name or password." },
    }),
  );
  await page.goto("/admin/email");
  const mail = page.getByRole("form", { name: "Test mail" });
  await mail.getByLabel("Send to").fill("me@example.test");
  await mail.getByRole("button", { name: "Send test mail" }).click();
  await expect(mail.getByRole("status")).toHaveText(
    "The mail server refused the user name or password.",
  );
});
