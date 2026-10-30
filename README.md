# vocabulary.training

Personal word lists and focused vocabulary practice, modernized from the
[original vocabulary tester](https://github.com/hkarn/vocabulary-tester-site).
Next.js, TypeScript and PostgreSQL, with Docker Compose for development and running
the application. No AI services or model keys are needed.

## Features

- Accounts with email/password sign-in and server-managed sessions.
- Saved profile language, word-pair lists, independent forward/reverse review
  statistics and completed-session history.
- Language-pair dashboards, paired and bulk editing, CSV import/export.
- Weighted or random sampling, configurable round sizes, case/accent handling,
  accepted alternatives, mistakes retry and keyboard-friendly answering.
- Responsive book/wordmark variants selected by the sidebar's available width.
- Explicit saving/error states and optimistic concurrency checks across tabs.

## Start with Docker

Prerequisite: Docker with the Compose plugin. No host Node installation is required.

```sh
cp .env.example .env
```

PowerShell alternative:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace `POSTGRES_PASSWORD` with a strong, random URL-safe value.
Set `ALLOW_REGISTRATION=true` when you intentionally want to create accounts.
Then run:

```sh
docker compose up --build -d --wait
```

Open http://localhost:3000. The migration job runs before the app starts.
Set `ALLOW_REGISTRATION=false` and run `docker compose up -d` again after creating
the accounts you need. Closing registration does not prevent existing users signing in.

`APP_ORIGIN` must exactly match the origin in your browser. If you change the port,
also update `APP_ORIGIN`. Do not alternate `localhost` and `127.0.0.1` without
updating it.

```sh
docker compose logs -f app
docker compose down
```

The named PostgreSQL volume survives `down`. Do not use `down -v` for real data.

## Container-first development

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

The development override mounts source and keeps dependencies/build cache in
named container volumes. After changing dependencies, rebuild and refresh only
the dependency/cache volumes; never remove the database volume to fix dependencies.

## Verification

```sh
docker compose -f compose.yaml -f compose.dev.yaml exec app npm test
docker compose -f compose.yaml -f compose.dev.yaml exec app npm run typecheck
```

GitHub Actions runs unit/build checks and a separate real Docker Compose integration
job. The integration job uses a disposable database and checks authentication,
ownership isolation, persistence, stale revisions, CSRF rejection, payload limits
and authentication throttling.

For a direct local test environment only, Node 22 and PostgreSQL can run the same
source using `DATABASE_URL`, `APP_ORIGIN` and `ALLOW_REGISTRATION`. The supported
routine workflow remains Docker-first.

## Preview versus application

The attached Computer preview uses the same workspace component with illustrative
lists and a fixed sample clock. It deliberately has no real sign-in, database or
durable saves. The deployable account app starts with an empty workspace.
`scripts/sync-preview.mjs` copies only shared UI source into the separate preview
project; it never copies account credentials or server environment files.

## Before internet deployment

This is an initial self-hostable version, not a claim of production launch readiness.
Read [security and operations](docs/security.md), [architecture](docs/architecture.md)
and [verification status](docs/verification.md). The [source map](docs/code-map.md)
records Graphify's structural pass and its limits. Configure HTTPS and an intentional
registration policy, and test database backup and restore. This version has no
email verification, password recovery, MFA or social login.

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses;
`npm ci` restores them from the committed lockfile.
