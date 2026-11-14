# Security

Intended for controlled self-hosting. This is not a security audit.

## Implemented safeguards

- Passwords are salted and hashed with Node's scrypt; raw passwords are never stored.
- Random 256-bit session tokens are stored only as SHA-256 hashes in PostgreSQL.
  Cookies are HTTP-only, SameSite Strict, host-only and expire after 14 days.
  A request over an HTTPS origin gets the Secure flag. Sessions are separate only
  across hostnames: aliases that differ just by port, or by scheme for a cookie
  without Secure, share the same session cookie.
- The admin area (`/admin`, `/api/admin/*`) answers 404 to anyone who isn't an
  admin (`users.is_admin`), signed in or not. `ADMIN_PASSWORD` is only used to
  create the first admin, or to give an admin without a password (a Google member) one,
  and never overwrites an existing password.
- Google sign-in (#152) is OpenID Connect with the authorization code, PKCE, `state` and
  `nonce`. The state and verifier live in a 10-minute HttpOnly, SameSite Lax cookie scoped
  to `/api/auth/google`, so a callback only works in the browser that started it. The ID
  token comes straight from Google's token endpoint over TLS, so its signature isn't
  checked; its issuer, audience, expiry, nonce and `email_verified` are. Only Google's
  account ID and the verified address are stored. The client secret is encrypted like the
  Requesty keys. A Google sign-in to an existing address removes its password and, the
  first time, every session, so whoever registered the address with a password before
  (this app never verifies addresses) loses access. `TEST_GOOGLE_TOKEN_URL` replaces
  Google's token endpoint only while `APP_ORIGIN` is plain HTTP on a loopback address.
- Every workspace read/write derives its owner from the authenticated session.
  The API accepts no client-supplied owner ID.
- Mutation endpoints require JSON Content-Type and an Origin that exactly matches
  `APP_ORIGIN` or one of `APP_ORIGIN_ALIASES`.
- Requesty keys are stored encrypted with AES-256-GCM (`SETTINGS_ENCRYPTION_KEY`)
  and never returned to the browser. Keep the encryption key out of backups that
  hold the database. Besides the basic and plus keys there's an optional
  read-only monitor key for Admin → AI settings (`docs/ai-features.md`). It's
  stored only after Requesty reports it as `manage: read`, `completions: none`,
  so it can't spend money or change anything in Requesty if it leaks. Admin → AI
  settings can create it with an admin key the admin types in: that key is used for
  that setup only (creating the key and labelling the tier keys) and never stored or
  logged, and the new key is shown to the admin once, before it's saved. The tier keys
  only ask Requesty for their own id there; they never get management rights.
- SQL values use parameterized queries. Zod validates all saved workspace data.
- Session expiry is checked on every request. Sign-out revokes the stored token.
- Authentication throttles are shared across processes through PostgreSQL.
- A write limit per account (`lib/write-limits.ts`, Admin → Limits) counts every request
  to a route that saves (answers, sessions, list edits and deletes, profile changes,
  reports and AI requests), refused ones included, so junk counts like saves.
  Over 20,000 an hour or 300,000 a day (defaults; 0 is no limit) the request gets 429 and
  the account's `write_limited_at` is set, shown in Admin → Users. A person answering once
  a second for 24 hours makes 86,400, so only a script reaches it. It stops a signed-in
  script from filling the database (the answer log and reports otherwise grow without
  bound). The counts are kept in the server process, so a restart starts them again.
- List revision checks prevent silent overwrites across tabs, and every user data query
  filters on `user_id`, so one account can't read, change or take over another's rows.
- The application container runs as a non-root user; PostgreSQL is not published
  to the host by Compose.
- Response headers limit embedding, content sniffing and browser capabilities.
  CSP permits Next.js inline bootstrap scripts; it is not a strict nonce-based CSP.

## Operator responsibilities

The app has to be served over HTTPS, with `APP_ORIGIN` set to the exact public origin.
List any other domains that serve it in `APP_ORIGIN_ALIASES`, using HTTPS too:
an HTTP alias gets session cookies without the Secure flag.
Compose publishes the app only on loopback (`127.0.0.1`), so a reverse proxy on the same
host can reach it, and publishes no database port. Keep the app's loopback mapping for that
proxy, don't expose it on other interfaces, and keep the database unpublished.
Running that proxy, the server and the backups is the operator's job and not covered here.

Registration is a site setting, switched in Admin → Registration. A real site starts
closed with no privacy details; only the dev and test stacks (`compose.dev.yaml`,
`compose.test.yaml`) start open, with a clearly fake contact. It can only be
switched on, and sign-up only works, once its checklist is complete: the privacy
controller and contact are set, and `APP_ORIGIN` is HTTPS unless it's a local
address. The privacy details are shown on the public `/privacy` page, which also
lists the one cookie and what is stored. Besides that cookie, the browser keeps only
the practice settings in local storage (never sent anywhere). Both are essential to
what the user asks for, so there is no cookie consent banner; anything more needs a
consent decision first. Never fill the privacy details with made-up values.

Sign-in limits are per email address and site-wide. Behind a reverse proxy, set
`AUTH_TRUSTED_IP_HEADER` to the header the proxy overwrites with the client's IP
(for example `X-Real-IP`) to add a per-IP limit; only that one header is trusted,
and only when the app can't be reached directly. Never point it at a header clients
can set, such as an unrewritten `X-Forwarded-For`. All limits store hashes only.

Keep registration closed unless it is intentionally needed. Registration has no
email verification, invite mechanism or automated password recovery. A user can
register an unverified email address; do not treat that as identity proof. Only Google
sign-in proves an address, and it takes such an account over from whoever registered it.
No raw form passwords, cookies, email lists or production dumps belong in GitHub.

Dependencies and base images are updated through Dependabot. Password reset, MFA, account
deletion, verified email, operational monitoring and a broader security review are
future work (see GitHub issues). Existing sessions remain valid until sign-out or expiry; there is no
UI to revoke all sessions.

The database-backed global authentication bucket intentionally limits costly
password hashing. It can deny legitimate sign-ins under a deliberate flood.
Add trusted-proxy-aware edge rate limiting before running an open public service.

## Data and backups

All data is in PostgreSQL, in the `postgres_data` volume. The app doesn't back it up: the
operator takes backups and tests restores. Keep backups and credentials out of GitHub.
The key in `SETTINGS_ENCRYPTION_KEY` is not in the database: without it the saved Requesty
keys can't be read, so keep a copy of it apart from the backups.

`docker compose down` retains data; `docker compose down -v` destroys the volume.
Never use the latter on real data without an explicit, verified recovery plan.

## Migrations

The one-shot migration service uses a PostgreSQL advisory transaction lock,
an ordered SQL migration directory and a migration ledger. Re-running applies only
unapplied files. Do not change an already-applied migration: add a new one.
Inspect the current schema before any future database change.
