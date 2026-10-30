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

## Test the published image

The public package is [ghcr.io/hkarn/vocabulary-training](https://github.com/hkarn/vocabulary-training/pkgs/container/vocabulary-training).
It is a Linux/amd64 image, suitable for Linux containers on x64 Docker Desktop
or an x64 Linux host. GHCR distributes the image; it does not host a running website.
Publishing an image does not deploy it to any existing server.

Download `compose.images.yaml` and `.env.example` from this repository into a
new folder, or clone the repository. No host Node installation is needed.
In PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set a strong random URL-safe `POSTGRES_PASSWORD` and set `ALLOW_REGISTRATION=true`
to create your first account. Then run:

```powershell
docker compose -f compose.images.yaml pull
docker compose -f compose.images.yaml up -d --wait
```

Open [http://localhost:3000](http://localhost:3000). This creates your own empty
database, not a copy of anyone else's account or data. The app listens on localhost
only; PostgreSQL has no published port. After creating your account, set
`ALLOW_REGISTRATION=false` and repeat the `up -d --wait` command.

Stop without deleting your saved data:

```powershell
docker compose -f compose.images.yaml down
```

The named volume survives container replacement and `down`; do not add `-v`
unless you intentionally want to delete the database. Back it up before updates.
The source-built and image-only Compose files use the same project/volume name:
using both in the same Docker context shares that database, rather than creating
independent test environments. For isolation, use `-p vocabulary-training-test`
consistently on every Compose command.

`latest` follows passing `main` builds. For a reproducible version, set
`VOCABULARY_IMAGE` in `.env` to a published `sha-<full-commit>` tag or image digest.
To update, back up the database, run `pull`, then `up -d --wait` again.
Schema changes can limit rollbacks; changing the image alone does not revert data.
To use another port or hostname, also change `APP_ORIGIN` to exactly match your
browser's origin.

## Build from source with Docker

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

Only passing `main` push/manual runs enter the package-publishing job. That job
builds a release candidate, runs the image-only Compose stack against a fresh
PostgreSQL database, repeats integration/restart tests, then publishes that exact
image with `latest` and full-commit tags. It also checks an anonymous registry pull.
Pull requests never publish. Package publishing uses the workflow's
`GITHUB_TOKEN` with job-scoped `packages: write`, not a saved personal token.

GitHub initially creates new container packages as private. The package owner
must set this package's visibility to public once; the anonymous-pull check
intentionally fails until that is done. Do not put secrets or database files into
an image. The runtime image contains application code and migrations; it does
not contain the `.env` file, CI accounts or the database volume.

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
