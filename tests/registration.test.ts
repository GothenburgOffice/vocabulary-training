import test from "node:test";
import assert from "node:assert/strict";
import {
  privacyReady,
  registrationBlockers,
  registrationUpdateSchema,
} from "../lib/admin/registration.ts";
import { seedSiteSettings } from "../scripts/settings-bootstrap.mjs";

const real = { controllerName: "Example Org", contactEmail: "privacy@example.test" };

test("the privacy page shows a controller only with a name and a valid email", () => {
  assert.equal(privacyReady(real), true);
  assert.equal(privacyReady({ ...real, controllerName: "  " }), false);
  assert.equal(privacyReady({ ...real, contactEmail: "not-an-email" }), false);
});

test("registration is blocked until the privacy details and HTTPS are in place", () => {
  assert.deepEqual(registrationBlockers(real, "https://vocabulary.example"), []);
  // Local addresses may use plain HTTP; public ones may not.
  for (const origin of ["http://localhost:3420", "http://127.0.0.1:3430", "http://[::1]:3000"])
    assert.deepEqual(registrationBlockers(real, origin), [], origin);
  assert.equal(registrationBlockers(real, "http://vocabulary.example").length, 1);
  assert.equal(registrationBlockers(real, "").length, 1);
  const blank = registrationBlockers({ controllerName: "", contactEmail: "" }, "https://a.example");
  assert.deepEqual(blank, ["Enter the data controller.", "Enter a valid privacy contact email."]);
});

test("admins save the switch with the details; blank details are allowed, invalid ones not", () => {
  assert.deepEqual(
    registrationUpdateSchema.parse({
      open: false,
      controllerName: " Example Org ",
      contactEmail: " a@b.test ",
    }),
    { open: false, controllerName: "Example Org", contactEmail: "a@b.test" },
  );
  const update = { open: false, ...real };
  assert(registrationUpdateSchema.safeParse({ ...update, controllerName: "" }).success);
  assert.equal(
    registrationUpdateSchema.safeParse({ ...update, contactEmail: "nope" }).success,
    false,
  );
  assert.equal(registrationUpdateSchema.safeParse({ ...update, open: "yes" }).success, false);
  assert.equal(registrationUpdateSchema.safeParse({ ...update, extra: true }).success, false);
});

// Records the seed's query and answers with the given number of inserted rows.
function fakeClient(inserted: number) {
  const queries: { sql: string; params: unknown[] }[] = [];
  return {
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return { rowCount: inserted };
    },
  };
}
const env = {
  ALLOW_REGISTRATION: "true",
  PRIVACY_CONTROLLER_NAME: " Example Org ",
  PRIVACY_CONTACT_EMAIL: "privacy@example.test",
};

test("the first-start seed writes only missing settings, closed unless ALLOW_REGISTRATION=true", async () => {
  const prod = fakeClient(1);
  assert.equal(await seedSiteSettings(prod, {}), 1);
  assert.match(prod.queries[0].sql, /ON CONFLICT \(key\) DO NOTHING/);
  assert.deepEqual(prod.queries[0].params, ["registration.open", "false"]);
  assert.deepEqual((await seedQuery({ ALLOW_REGISTRATION: "yes" })).params, [
    "registration.open",
    "false",
  ]);

  const dev = fakeClient(3);
  assert.equal(await seedSiteSettings(dev, env), 3);
  assert.deepEqual(dev.queries[0].params, [
    "registration.open",
    "true",
    "privacy.controller_name",
    "Example Org",
    "privacy.contact_email",
    "privacy@example.test",
  ]);
  // Already stored (admin stores every value): nothing changes.
  assert.equal(await seedSiteSettings(fakeClient(0), env), 0);
});
async function seedQuery(values: Record<string, string>) {
  const client = fakeClient(1);
  await seedSiteSettings(client, values);
  return client.queries[0];
}

test("the seed refuses half or invalid privacy details instead of publishing them", async () => {
  for (const bad of [
    { PRIVACY_CONTROLLER_NAME: "Example Org" },
    { PRIVACY_CONTACT_EMAIL: "privacy@example.test" },
    { ...env, PRIVACY_CONTACT_EMAIL: "not-an-email" },
    { ...env, PRIVACY_CONTROLLER_NAME: "x".repeat(201) },
  ]) {
    const client = fakeClient(3);
    await assert.rejects(seedSiteSettings(client, bad), /PRIVACY_CONTROLLER_NAME/);
    assert.equal(client.queries.length, 0);
  }
});
