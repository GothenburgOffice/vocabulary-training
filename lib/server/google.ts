import "server-only";
import { callbackUrl, tokenUrl } from "@/lib/google-oidc";

// The token request of Google sign-in (#152): the code from the callback, this app's client
// secret and the PKCE verifier, for an ID token. Nothing else from the response is kept: the
// access token is never used or stored.
export class GoogleUnavailable extends Error {}

export async function exchangeCode(
  client: { clientId: string; clientSecret: string },
  code: string,
  verifier: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: callbackUrl(origin),
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new GoogleUnavailable("Google could not be reached.");
  }
  const result = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!response.ok || !result) throw new GoogleUnavailable("Google refused the sign-in code.");
  return result.id_token;
}
