import "server-only";
import { NextResponse } from "next/server";
import { FLOW_COOKIE, FLOW_MAX_AGE_S } from "@/lib/google-oidc";
import { allowedOrigins } from "./http";

// APP_ORIGIN: Google returns only there (the redirect URI saved in Google Cloud), so the
// button shows and the flow starts only there, not on APP_ORIGIN_ALIASES.
export const appOrigin = () => allowedOrigins()[0];

// The flow cookie. Lax, not Strict like the session cookie: it has to come back with the
// top-level navigation from Google to the callback.
export function flowCookieOptions(origin: string, maxAge = FLOW_MAX_AGE_S) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/auth/google",
    secure: new URL(origin).protocol === "https:",
    maxAge,
  };
}

// Back to the sign-in page, with a reason the page explains when the sign-in didn't happen.
// The flow cookie is used once, so every way out clears it.
export function backToApp(origin: string, reason?: string) {
  const response = NextResponse.redirect(new URL(reason ? `/?google=${reason}` : "/", origin), 303);
  response.cookies.set(FLOW_COOKIE, "", flowCookieOptions(origin, 0));
  return response;
}
