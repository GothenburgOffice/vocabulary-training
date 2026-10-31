# Security and operations

Intended for controlled self-hosting. This is not a security audit.

## Implemented safeguards

- Passwords are salted and hashed with Node's scrypt; raw passwords are never stored.
- Random 256-bit session tokens are stored only as SHA-256 hashes in PostgreSQL.
  Cookies are HTTP-only, SameSite Strict, host-only and expire after 14 days.
  HTTPS `APP_ORIGIN` enables the Secure flag.
- Every workspace read/write derives its owner from the authenticated session.
  The API accepts no client-supplied owner ID.
- Mutation endpoints require the exact configured Origin and JSON Content-Type.
- SQL values use parameterized queries. Zod validates all saved workspace data.
- Session expiry is checked on every request. Sign-out revokes the stored token.
- Authentication throttles are shared across processes through PostgreSQL.
- Revision checks prevent silent overwrites across tabs.
- The application container runs as a non-root user; PostgreSQL is not published
  to the host by Compose.
- Response headers limit embedding, content sniffing and browser capabilities.
  CSP permits Next.js inline bootstrap scripts; it is not a strict nonce-based CSP.

## Operator responsibilities

Put HTTPS in front of the app and set `APP_ORIGIN` to the exact public origin.
Compose binds the app to loopback by default; a reverse proxy on the host can route
to it. Containerized proxies should use an internal Docker network rather than
publishing the database.

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
