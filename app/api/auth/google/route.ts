import { NextResponse } from "next/server";
import { authorizationUrl, encodeFlow, FLOW_COOKIE, newFlow } from "@/lib/google-oidc";
import { appOrigin, backToApp, flowCookieOptions } from "@/lib/server/google-flow";
import { allowedOrigins, fail, HttpError, json } from "@/lib/server/http";
import { readGoogleClient } from "@/lib/server/site-settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Google sign-in (#152) works without a session, so these run their own origin check instead
// of a builder from lib/server/route.ts.

// Whether the sign-in page offers Google, and on which origin (only APP_ORIGIN).
export async function GET() {
  try {
    return json({ enabled: Boolean(await readGoogleClient()), origin: appOrigin() });
  } catch (e) {
    return fail(e);
  }
}

// Starts the flow from the sign-in page's native form: a new state, nonce and PKCE verifier in
// a short-lived cookie, and a redirect to Google. A form post carries Origin like fetch does.
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins().includes(origin))
      throw new HttpError(403, "This request is not from this application.");
    const home = appOrigin();
    if (origin !== home) return backToApp(origin, "unavailable");
    const client = await readGoogleClient();
    if (!client) return backToApp(home, "unavailable");
    const flow = newFlow();
    const response = NextResponse.redirect(authorizationUrl(client.clientId, home, flow), 303);
    response.cookies.set(FLOW_COOKIE, encodeFlow(flow), flowCookieOptions(home));
    return response;
  } catch (e) {
    return fail(e);
  }
}
