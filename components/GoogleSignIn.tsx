"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";

// Why a Google sign-in (#152) ended back on the sign-in page: the callback's ?google= reason.
const MESSAGES: Record<string, string> = {
  expired: "The Google sign-in took too long or was started in another tab. Try again.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in didn't work. Try again.",
  unavailable: "Google sign-in isn't available on this site right now.",
  "not-verified": "Google hasn't verified that email address, so it can't be used here.",
  closed: "Registration is closed, so no account was created. Contact the site owner.",
  locked: "This account is locked. Contact the site's privacy contact.",
  linked: "That email address belongs to an account linked to another Google account.",
  limited: "Too many sign-in attempts. Try again in 15 minutes.",
};

// AccountApp renders this only in the browser (the server's render is its loading screen), so
// the reason is read from the address on the first render. The guard keeps a server render,
// should one ever happen, from reaching for window.
function reasonFromAddress() {
  if (typeof window === "undefined") return "";
  const reason = new URL(window.location.href).searchParams.get("google");
  return reason ? (MESSAGES[reason] ?? MESSAGES.failed) : "";
}

// Continue with Google: a native form, so the browser follows the redirect to Google. Shown
// only while the site has a Google client and only on APP_ORIGIN, where Google returns.
export default function GoogleSignIn({ busy }: { busy: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [message] = useState(reasonFromAddress);
  useEffect(() => {
    // Shown once: a reload or a bookmark doesn't repeat it.
    const url = new URL(window.location.href);
    if (url.searchParams.has("google")) {
      url.searchParams.delete("google");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    let active = true;
    apiRequest<{ enabled: boolean; origin: string }>("/api/auth/google")
      .then((status) => {
        if (active) setEnabled(status.enabled && status.origin === window.location.origin);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {enabled && (
        <form className="google-sign-in" method="post" action="/api/auth/google">
          <button className="button" disabled={busy}>
            Continue with Google
          </button>
          <p className="auth-note">
            Signing in with Google replaces your password: from then on you sign in with Google.
          </p>
        </form>
      )}
    </>
  );
}
