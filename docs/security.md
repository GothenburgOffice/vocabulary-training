# Security and operations

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
  create the first admin and never overwrites an existing password.
- Every workspace read/write derives its owner from the authenticated session.
  The API accepts no client-supplied owner ID.
- Mutation endpoints require JSON Content-Type and an Origin that exactly matches
  `APP_ORIGIN` or one of `APP_ORIGIN_ALIASES`.
- Requesty keys are stored encrypted with AES-256-GCM (`SETTINGS_ENCRYPTION_KEY`)
  and never returned to the browser. Keep the encryption key out of backups that
  hold the database.
- SQL values use parameterized queries. Zod validates all saved workspace data.
- Session expiry is checked on every request. Sign-out revokes the stored token.
- Authentication throttles are shared across processes through PostgreSQL.
- List revision checks prevent silent overwrites across tabs, and every user data query
  filters on `user_id`, so one account can't read, change or take over another's rows.
- The application container runs as a non-root user; PostgreSQL is not published
  to the host by Compose.
- Response headers limit embedding, content sniffing and browser capabilities.
  CSP permits Next.js inline bootstrap scripts; it is not a strict nonce-based CSP.

## Operator responsibilities

Put HTTPS in front of the app and set `APP_ORIGIN` to the exact public origin.
List any other domains that serve it in `APP_ORIGIN_ALIASES`, using HTTPS too:
an HTTP alias gets session cookies without the Secure flag.
Compose binds the app to loopback by default; a reverse proxy on the host can route
to it. Containerized proxies should use an internal Docker network rather than
publishing the database.

Registration stays closed until the privacy controller and contact are set (site
settings, seeded from `PRIVACY_*` on the first start). They're shown on the public
`/privacy` page, which also lists the one cookie and what is stored. The site sets
no other cookies and stores nothing else in the browser, so it needs no cookie
consent banner. Never fill the privacy details with made-up values.

Keep registration closed unless it is intentionally needed. Registration has no
email verification, invite mechanism or automated password recovery. A user can
register an unverified email address; do not treat that as identity proof.
No raw form passwords, cookies, email lists or production dumps belong in GitHub.

Review dependencies and base-image patches regularly. Password reset, MFA, account
deletion, verified email, operational monitoring and a broader security review are
future work (see GitHub issues). Existing sessions remain valid until sign-out or expiry; there is no
UI to revoke all sessions.

The database-backed global authentication bucket intentionally limits costly
password hashing. It can deny legitimate sign-ins under a deliberate flood.
Add trusted-proxy-aware edge rate limiting before running an open public service.

## Database backups

Create PostgreSQL-format backups outside the repository. Do not commit backups
or credentials. For example, redirect `pg_dump` to an operator-managed backup file
using an appropriate shell or use your PostgreSQL backup tooling:

```sh
docker compose exec -T db pg_dump -U vocabulary -d vocabulary -Fc > vocabulary.backup
```

That redirection example is for shells with binary-safe stdout redirection.
Windows PowerShell 5.1 redirection is not binary-safe; instead use `pg_dump -f`
inside the container and `docker compose cp` to copy the file out.

Verify restores against a separate database before relying on a backup.
`docker compose down` retains data; `docker compose down -v` destroys the volume.
Never use the latter on real data without an explicit, verified recovery plan.

## Migrations

The one-shot migration service uses a PostgreSQL advisory transaction lock,
an ordered SQL migration directory and a migration ledger. Re-running applies only
unapplied files. Do not change an already-applied migration: add a new one.
Inspect the current schema before any future database change.
