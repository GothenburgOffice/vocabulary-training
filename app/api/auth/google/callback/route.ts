import { cookies } from "next/headers";
import { decodeFlow, FLOW_COOKIE, identityFromIdToken } from "@/lib/google-oidc";
import {
  GoogleSignInRefused,
  purgeTrashedAccounts,
  recordSignIn,
  signInWithGoogle,
} from "@/lib/server/accounts";
import { cookieName, createSession, limitAuth } from "@/lib/server/auth";
import { exchangeCode, GoogleUnavailable } from "@/lib/server/google";
import { appOrigin, backToApp } from "@/lib/server/google-flow";
import { clientIp, cookieOptions, HttpError } from "@/lib/server/http";
import { readGoogleClient, readRegistration } from "@/lib/server/site-settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where Google sends the browser back (#152). The state must match the flow cookie this
// browser got at the start, so nobody can sign someone else in with their own code. Every
// outcome redirects to the sign-in page, which explains a ?google= reason.
export async function GET(request: Request) {
  let home: string;
  try {
    home = appOrigin();
  } catch {
    return new Response("The server origin is not configured.", { status: 503 });
  }
  try {
    const url = new URL(request.url);
    const flow = decodeFlow((await cookies()).get(FLOW_COOKIE)?.value);
    const state = url.searchParams.get("state");
    if (!flow || !state || state !== flow.state) return backToApp(home, "expired");
    // The person cancelled at Google, or Google refused.
    if (url.searchParams.get("error")) return backToApp(home, "cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 2000) return backToApp(home, "failed");
    const client = await readGoogleClient();
    if (!client) return backToApp(home, "unavailable");
    const idToken = await exchangeCode(client, code, flow.verifier, home);
    const result = identityFromIdToken(idToken, {
      clientId: client.clientId,
      nonce: flow.nonce,
      now: Date.now(),
    });
    if (!result.ok)
      return backToApp(home, result.reason === "email_not_verified" ? "not-verified" : "failed");
    await limitAuth(result.identity.email, clientIp(request));
    const { userId, isAdmin } = await signInWithGoogle(result.identity, async () => {
      const registration = await readRegistration();
      return registration.open && !registration.blockers.length;
    });
    // As with a password sign-in: no scheduler runs, so an admin's sign-in purges the trash.
    if (isAdmin)
      await purgeTrashedAccounts().catch((e) =>
        console.error("Trash purge failed:", e instanceof Error ? e.name : "unknown"),
      );
    await recordSignIn(userId);
    const response = backToApp(home);
    response.cookies.set(cookieName, await createSession(userId), cookieOptions(home));
    return response;
  } catch (e) {
    if (e instanceof GoogleSignInRefused) return backToApp(home, e.reason);
    if (e instanceof GoogleUnavailable) return backToApp(home, "unavailable");
    if (e instanceof HttpError && e.status === 429) return backToApp(home, "limited");
    console.error("Google sign-in failed:", e instanceof Error ? e.name : "unknown");
    return backToApp(home, "failed");
  }
}
