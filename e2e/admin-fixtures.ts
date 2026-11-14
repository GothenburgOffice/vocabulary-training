import { test } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";

// Every admin spec: skipped without an admin account, and signed in as that admin, once for
// the whole run, by global-setup.ts. Call it at the top of the spec file.
export function signedInAsAdmin() {
  test.skip(
    !process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
    "needs an admin account: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD",
  );
  test.use({ storageState: ADMIN_STATE });
}
