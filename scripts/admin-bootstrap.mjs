// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. Runs inside the migration
// transaction on every start, but only acts while no admin exists, and never changes the
// password of an existing account.
import { randomBytes, randomUUID, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(nodeScrypt);

// Same format as lib/server/password.ts; tests/admin-bootstrap.test.ts checks they agree.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
// Same as emptyWorkspace() in lib/workspace.ts; also checked by the test.
export const EMPTY_WORKSPACE = {
  baseLanguage: "Swedish",
  learningLanguage: "French",
  lists: [],
  runs: [],
};

// The sign-in email rule from credentialsSchema in lib/validation.ts (zod's email pattern, at
// most 254 characters); also checked by the test.
const EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
/** @param {string} email */
export const validAdminEmail = (email) => email.length <= 254 && EMAIL.test(email);

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }} client
 * @param {Record<string, string | undefined>} env
 */
export async function bootstrapAdmin(client, env = process.env) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return "skipped";
  // Fail the migration rather than commit an account that can never sign in.
  if (!validAdminEmail(email))
    throw new Error("ADMIN_EMAIL must be a valid email address of at most 254 characters.");
  if ((await client.query("SELECT 1 FROM users WHERE is_admin")).rowCount) return "exists";
  const promoted = await client.query("UPDATE users SET is_admin=true WHERE email=$1", [email]);
  if (promoted.rowCount) return "promoted";
  const password = env.ADMIN_PASSWORD ?? "";
  if (password.length < 12 || password.length > 4096)
    throw new Error("ADMIN_PASSWORD must be 12 to 4096 characters to create the admin account.");
  const id = randomUUID();
  await client.query("INSERT INTO users(id,email,password_hash,is_admin) VALUES($1,$2,$3,true)", [
    id,
    email,
    await hashPassword(password),
  ]);
  await client.query("INSERT INTO workspaces(user_id,data) VALUES($1,$2)", [id, EMPTY_WORKSPACE]);
  return "created";
}
