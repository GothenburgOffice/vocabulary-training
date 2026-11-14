// Google's token endpoint, faked for test stacks (compose.test.yaml), so Google sign-in (#152)
// can be tested without a Google client or network access. The app reaches it only through
// TEST_GOOGLE_TOKEN_URL, which it honours only while APP_ORIGIN is plain HTTP on a loopback
// address.
//
// A test chooses who "Google" says signed in through the authorization code itself: the code
// is base64url JSON of the ID token's claims (sub, email, email_verified, nonce, and aud or
// iss to test a wrong one). No state is shared, so tests can run at the same time.
import { createServer } from "node:http";

const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

createServer((request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || request.url !== "/token") return send(404, {});
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    const form = new URLSearchParams(body);
    // What Google requires of the request: the code, the client and PKCE.
    for (const field of ["code", "client_id", "client_secret", "redirect_uri", "code_verifier"])
      if (!form.get(field)) return send(400, { error: "invalid_request" });
    if (form.get("grant_type") !== "authorization_code")
      return send(400, { error: "unsupported_grant_type" });
    let claims;
    try {
      claims = JSON.parse(Buffer.from(form.get("code"), "base64url").toString("utf8"));
    } catch {
      return send(400, { error: "invalid_grant" });
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = {
      iss: "https://accounts.google.com",
      aud: form.get("client_id"),
      iat: now,
      exp: now + 3600,
      ...claims,
    };
    send(200, {
      access_token: "test-only-google-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email",
      id_token: `${part({ alg: "none" })}.${part(idToken)}.`,
    });
  });
}).listen(4500, "0.0.0.0", () => console.log("Fake Google token endpoint on :4500"));
