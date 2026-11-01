// Seeds registration and the privacy details inside the migration transaction:
// registration.open from ALLOW_REGISTRATION (closed unless "true"), and the controller and
// contact from PRIVACY_CONTROLLER_NAME and PRIVACY_CONTACT_EMAIL. Only the dev and test stacks
// set these (compose.dev.yaml, compose.test.yaml); a real site gets registration closed and
// no privacy details, both set at /admin. Only missing settings are written, and admin stores
// every value (blank or closed included), so a restart never overwrites a change made there.
import { validAdminEmail } from "./admin-bootstrap.mjs";

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }} client
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<number>} how many settings were seeded
 */
export async function seedSiteSettings(client, env = process.env) {
  const rows = [["registration.open", env.ALLOW_REGISTRATION === "true" ? "true" : "false"]];
  const name = env.PRIVACY_CONTROLLER_NAME?.trim() ?? "";
  const email = env.PRIVACY_CONTACT_EMAIL?.trim() ?? "";
  if (name || email) {
    if (!name || name.length > 200 || !validAdminEmail(email))
      throw new Error(
        "Set PRIVACY_CONTROLLER_NAME (at most 200 characters) and a valid PRIVACY_CONTACT_EMAIL together, or neither.",
      );
    rows.push(["privacy.controller_name", name], ["privacy.contact_email", email]);
  }
  const values = rows.map((_, i) => `($${2 * i + 1},$${2 * i + 2})`).join(",");
  const result = await client.query(
    `INSERT INTO site_settings(key,value) VALUES ${values} ON CONFLICT (key) DO NOTHING`,
    rows.flat(),
  );
  return result.rowCount ?? 0;
}
