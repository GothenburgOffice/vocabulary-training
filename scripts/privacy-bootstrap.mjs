// Seeds the privacy controller and contact from PRIVACY_CONTROLLER_NAME and
// PRIVACY_CONTACT_EMAIL, inside the migration transaction. Only missing settings are written:
// after the first start they are edited in Admin → Privacy, and a restart never overwrites
// them (a value cleared there is stored blank, so it isn't seeded again).
import { validAdminEmail } from "./admin-bootstrap.mjs";

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }} client
 * @param {Record<string, string | undefined>} env
 */
export async function seedPrivacy(client, env = process.env) {
  const name = env.PRIVACY_CONTROLLER_NAME?.trim() ?? "";
  const email = env.PRIVACY_CONTACT_EMAIL?.trim() ?? "";
  if (!name && !email) return "skipped";
  if (!name || name.length > 200 || !validAdminEmail(email))
    throw new Error(
      "Set PRIVACY_CONTROLLER_NAME (at most 200 characters) and a valid PRIVACY_CONTACT_EMAIL together, or neither.",
    );
  const result = await client.query(
    `INSERT INTO site_settings(key,value)
     VALUES ('privacy.controller_name',$1),('privacy.contact_email',$2)
     ON CONFLICT (key) DO NOTHING`,
    [name, email],
  );
  return result.rowCount ? "seeded" : "exists";
}
