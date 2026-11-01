import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "../../../lib/server/db";
import {
  body,
  cookieOptions,
  fail,
  HttpError,
  json,
  requireOrigin,
} from "../../../lib/server/http";
import { cookieName, createSession, limitAuth, requireUser } from "../../../lib/server/auth";
import { hashPassword, hashToken, verifyPassword } from "../../../lib/server/password";
import { credentialsSchema } from "../../../lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json({ user: await requireUser() });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = requireOrigin(request);
    // Room for a 4096-character password even when every character is JSON-escaped.
    const parsed = credentialsSchema.safeParse(await body(request, 32_768));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { action, email, password } = parsed.data;
    await limitAuth(email);
    let userId: string;
    if (action === "register") {
      if (process.env.ALLOW_REGISTRATION !== "true")
        throw new HttpError(403, "Registration is closed. Contact the site owner.");
      const passwordHash = await hashPassword(password);
      userId = randomUUID();
      // The profile languages default in the users table; lists start empty.
      await db
        .query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
          userId,
          email,
          passwordHash,
        ])
        .catch((e) => {
          if ((e as { code?: string }).code === "23505")
            throw new HttpError(409, "An account could not be created. Try signing in instead.");
          throw e;
        });
    } else {
      const result = await db.query("SELECT id,password_hash FROM users WHERE email=$1", [email]);
      const user = result.rows[0];
      // Comparable hash work even for an unknown email.
      const hash = user?.password_hash ?? `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
      const valid = await verifyPassword(password, hash);
      if (!user || !valid) throw new HttpError(401, "Email or password is incorrect.");
      userId = user.id;
    }
    const token = await createSession(userId!);
    const response = json({ user: { id: userId!, email } });
    response.cookies.set(cookieName, token, cookieOptions(origin));
    return response;
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const origin = requireOrigin(request);
    const token = (await cookies()).get(cookieName)?.value;
    if (token) await db.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
    const response = json({ ok: true });
    response.cookies.set(cookieName, "", { ...cookieOptions(origin), maxAge: 0 });
    return response;
  } catch (e) {
    return fail(e);
  }
}
