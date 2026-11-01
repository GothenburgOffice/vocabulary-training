import test from "node:test";
import assert from "node:assert/strict";
import { privacyReady, privacyUpdateSchema } from "../lib/admin/privacy.ts";
import { seedPrivacy } from "../scripts/privacy-bootstrap.mjs";

const real = { controllerName: "Example Org", contactEmail: "privacy@example.test" };

test("registration needs both a controller and a valid contact email", () => {
  assert.equal(privacyReady(real), true);
  assert.equal(privacyReady({ ...real, controllerName: "  " }), false);
  assert.equal(privacyReady({ ...real, contactEmail: "" }), false);
  assert.equal(privacyReady({ ...real, contactEmail: "not-an-email" }), false);
});

test("admins can save real details or clear them, but not an invalid email", () => {
  assert.deepEqual(
    privacyUpdateSchema.parse({ controllerName: " Example Org ", contactEmail: " a@b.test " }),
    { controllerName: "Example Org", contactEmail: "a@b.test" },
  );
  assert(privacyUpdateSchema.safeParse({ controllerName: "", contactEmail: "" }).success);
  assert.equal(privacyUpdateSchema.safeParse({ ...real, contactEmail: "nope" }).success, false);
  assert.equal(
    privacyUpdateSchema.safeParse({ ...real, controllerName: "x".repeat(201) }).success,
    false,
  );
  assert.equal(privacyUpdateSchema.safeParse({ ...real, extra: true }).success, false);
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
  PRIVACY_CONTROLLER_NAME: " Example Org ",
  PRIVACY_CONTACT_EMAIL: "privacy@example.test",
};

test("the first-start seed writes only missing privacy settings", async () => {
  const empty = fakeClient(0);
  assert.equal(await seedPrivacy(empty, {}), "skipped");
  assert.equal(empty.queries.length, 0);

  const fresh = fakeClient(2);
  assert.equal(await seedPrivacy(fresh, env), "seeded");
  assert.match(fresh.queries[0].sql, /ON CONFLICT \(key\) DO NOTHING/);
  assert.deepEqual(fresh.queries[0].params, ["Example Org", "privacy@example.test"]);

  // Already stored (or cleared in admin, which stores a blank): nothing changes.
  assert.equal(await seedPrivacy(fakeClient(0), env), "exists");
});

test("the seed refuses half or invalid details instead of publishing them", async () => {
  for (const bad of [
    { PRIVACY_CONTROLLER_NAME: "Example Org" },
    { PRIVACY_CONTACT_EMAIL: "privacy@example.test" },
    { ...env, PRIVACY_CONTACT_EMAIL: "not-an-email" },
    { ...env, PRIVACY_CONTROLLER_NAME: "x".repeat(201) },
  ]) {
    const client = fakeClient(2);
    await assert.rejects(seedPrivacy(client, bad), /PRIVACY_CONTROLLER_NAME/);
    assert.equal(client.queries.length, 0);
  }
});
