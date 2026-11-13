import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hashToken } from "./password";
import { HttpError } from "./http";
import { isTheme, type Theme } from "../theme";
export const cookieName = "vocabulary_session";
export async function requireUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, "Sign in to continue.");
  const result = await db.query(
    // A locked account, or one in the trash, has no valid session even if one was left behind.
    "SELECT u.id,u.email,u.ai_tier,u.ai_enabled,u.is_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.locked_at IS NULL AND u.deleted_at IS NULL",
    [hashToken(token)],
  );
  if (!result.rowCount) throw new HttpError(401, "Your session has expired. Sign in again.");
  return result.rows[0] as {
    id: string;
    email: string;
    ai_tier: string;
    ai_enabled: boolean;
    is_admin: boolean;
  };
}
// The signed-in account's Appearance setting, for <html data-theme> on every page, so the
// first paint is already in the right colours. Signed out (or if the lookup fails): system.
export async function sessionTheme(): Promise<Theme> {
  try {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return "system";
    const result = await db.query(
      "SELECT u.theme FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.locked_at IS NULL AND u.deleted_at IS NULL",
      [hashToken(token)],
    );
    const theme = result.rows[0]?.theme;
    return isTheme(theme) ? theme : "system";
  } catch {
    return "system";
  }
}
// Admin pages and routes answer 404 to everyone else, so they don't reveal that they exist.
export async function requireAdmin() {
  const user = await requireUser().catch((e) => {
    if (e instanceof HttpError && e.status === 401) return null;
    throw e;
  });
  if (!user?.is_admin) throw new HttpError(404, "Not found.");
  return user;
}
// For admin pages: everyone else gets the normal 404 page. Call it in every admin page,
// not only the layout, because client navigation doesn't rerun the layout.
export async function adminPage() {
  try {
    return await requireAdmin();
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')",
    [hashToken(token), userId],
  );
  await db.query("DELETE FROM sessions WHERE expires_at<now()");
  return token;
}
// Signs out the session with this cookie token, if it exists.
export async function endSession(token: string) {
  await db.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
}
export async function limitAuth(email: string, ip = "") {
  // Database-backed so limits also work across app workers. No raw email or IP stored. Without
  // a trusted client IP (clientIp), every visitor shares the conservative global bucket.
  const buckets: [string, number][] = [
    [hashToken(email), 15],
    ...(ip ? [[hashToken(`ip:${ip}`), 30] as [string, number]] : []),
    ["global", 300],
  ];
  for (const [bucket, limit] of buckets) {
    const result = await db.query(
      `INSERT INTO auth_limits(bucket,window_start,attempts) VALUES($1,now(),1)
       ON CONFLICT(bucket) DO UPDATE SET
       attempts=CASE WHEN auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_limits.attempts+1 END,
       window_start=CASE WHEN auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE auth_limits.window_start END
       RETURNING attempts`,
      [bucket],
    );
    if (result.rows[0].attempts > limit)
      throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.");
  }
  await db.query("DELETE FROM auth_limits WHERE window_start<now()-interval '1 day'");
}
