import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import {
  body,
  clientIp,
  cookieOptions,
  fail,
  HttpError,
  json,
  requireOrigin,
} from "@/lib/server/http";
import {
  createAccount,
  findAccountForSignIn,
  purgeTrashedAccounts,
  recordSignIn,
} from "@/lib/server/accounts";
import { cookieName, createSession, endSession, limitAuth } from "@/lib/server/auth";
import { userRead } from "@/lib/server/route";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { credentialsSchema } from "@/lib/validation";
import { readRegistration } from "@/lib/server/site-settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = userRead(async ({ user }) => json({ user }));
// Sign-in and sign-out work without a session, so they run requireOrigin themselves instead of
// using a builder from lib/server/route.ts.
export async function POST(request: Request) {
  try {
    const origin = requireOrigin(request);
    // Room for a 4096-character password even when every character is JSON-escaped.
    const parsed = credentialsSchema.safeParse(await body(request, 32_768));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const { action, email, password } = parsed.data;
    await limitAuth(email, clientIp(request));
    let userId: string;
    if (action === "register") {
      // Switched on in Admin → Registration, and only usable once its checklist is complete
      // (the privacy contact first: the email address is personal data).
      const registration = await readRegistration();
      if (!registration.open)
        throw new HttpError(403, "Registration is closed. Contact the site owner.");
      if (registration.blockers.length)
        throw new HttpError(
          403,
          "Registration opens once the site owner has published a privacy contact and finished setup.",
        );
      userId = randomUUID();
      await createAccount(userId, email, await hashPassword(password));
    } else {
      const user = await findAccountForSignIn(email);
      // Comparable hash work even for an unknown email.
      const hash = user?.password_hash ?? `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
      const valid = await verifyPassword(password, hash);
      if (!user || !valid) throw new HttpError(401, "Email or password is incorrect.");
      // Only after the password checks out, so the lock isn't revealed to anyone else.
      if (user.locked_at || user.deleted_at)
        throw new HttpError(403, "This account is locked. Contact the site's privacy contact.");
      userId = user.id;
      // No scheduler runs in this app, so an admin's sign-in purges the expired trash.
      if (user.is_admin)
        await purgeTrashedAccounts().catch((e) =>
          console.error("Trash purge failed:", e instanceof Error ? e.name : "unknown"),
        );
    }
    await recordSignIn(userId!);
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
    if (token) await endSession(token);
    const response = json({ ok: true });
    response.cookies.set(cookieName, "", { ...cookieOptions(origin), maxAge: 0 });
    return response;
  } catch (e) {
    return fail(e);
  }
}
