# vocabulary.training

Personal word lists and focused vocabulary practice, modernized from the
[original vocabulary tester](https://github.com/hkarn/vocabulary-tester-site).
Built with Next.js, TypeScript and PostgreSQL, and run with Docker Compose.

## Features

- Email/password accounts, or Google sign-in, with server-side sessions.
- Word-pair lists per language pair, with paired and bulk editing and CSV import/export.
- Practice in either direction with independent review statistics per direction.
- Three practice modes (Weighted mix, Spaced review with FSRS scheduling, Random order),
  configurable round size,
  case/accent options, several accepted answers per word (through CSV import for now) and
  mistakes retry.
- Session history per language pair.
- A download of all your data (lists, review history, sessions) as one JSON file.
- Saves after each answer, with conflict detection across browser tabs.
- Light and dark appearance: follows the device, or set per account.
- Optional: a short AI language note for wrong answers and click-to-play word
  audio, both via [Requesty](https://www.requesty.ai). Grading never uses AI.
  See [AI features](docs/ai-features.md).

## Run it

Requires Docker with the Compose plugin. No Node installation is needed.

```sh
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edit `.env`: set a long random URL-safe `POSTGRES_PASSWORD`, and `ADMIN_EMAIL` and
`ADMIN_PASSWORD` for your own account (see **Admin** below).

**From source:**

```sh
docker compose up --build -d --wait
```

**From the published image** (`ghcr.io/gothenburgoffice/vocabulary-training`,
linux/amd64; `latest` follows passing `main` builds):

```sh
docker compose -f compose.images.yaml pull
docker compose -f compose.images.yaml up -d --wait
```

Open <http://localhost:3420> and sign in with the admin account. Registration
starts closed. To let others sign up, open **Admin → Registration**: enter who runs
the site and a privacy contact (shown on `/privacy`), then switch registration on.
It can't open until those are set and, for a public address, `APP_ORIGIN` uses
HTTPS. These are database settings, not `.env` ones.

**Admin.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first start,
and `SETTINGS_ENCRYPTION_KEY` (`openssl rand -base64 32`) to save AI keys.
While no admin exists, each start creates that account, or promotes an existing
account with that email without changing its password. Admins get an **Admin**
link in the account dialog (the sidebar's **Your account**), leading to `/admin`;
everyone else gets a 404 there. The flag is `users.is_admin`, so you can also set
it directly in the database.

**Google sign-in (optional).** In Google Cloud, create an OAuth client of type Web
application with the authorized redirect URI `<APP_ORIGIN>/api/auth/google/callback`, then
save its client ID and secret at **Admin → Registration** (the page shows the exact URI;
the secret needs `SETTINGS_ENCRYPTION_KEY`). Google sign-in is offered only on
`APP_ORIGIN`, while both are saved. A Google sign-in joins the account with that address,
removes its password and, the first time, ends its other sessions, since this app never
verified who registered it. New accounts need registration open. There is no password
recovery, so if you remove the client, Google members can't sign in until it is back. An
admin can always get back in: set `ADMIN_PASSWORD` again and restart, and an admin with no
password gets it (then empty it again). The design is in #152.

The app listens on localhost only and PostgreSQL has no published port. Data lives
in a named volume that survives `docker compose down`. **Never use `down -v` on
real data.** Both Compose files share the same project and volume name. Use
`-p <name>` for an isolated test stack.

## Configuration

| Variable                  | Default                 | Purpose                                                                            |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | required                | Database password                                                                  |
| `APP_PORT`                | `3420`                  | Host port (bound to 127.0.0.1)                                                     |
| `APP_ORIGIN`              | `http://localhost:3420` | Must exactly match the browser origin; HTTPS enables Secure cookies                |
| `APP_ORIGIN_ALIASES`      | empty                   | More accepted origins, comma-separated (e.g. domain aliases)                       |
| `ADMIN_EMAIL`             | empty                   | First admin, created on start while no admin exists                                |
| `ADMIN_PASSWORD`          | empty                   | That admin's password (12–4096 characters), used only to create it                 |
| `VOCABULARY_IMAGE`        | `…:latest`              | Image for `compose.images.yaml`; pin a `sha-<commit>` tag                          |
| `SETTINGS_ENCRYPTION_KEY` | empty                   | 32 random bytes (base64) that encrypt the Requesty keys saved in the admin area    |
| `AUTH_TRUSTED_IP_HEADER`  | empty                   | Header your reverse proxy overwrites with the client IP, for per-IP sign-in limits |

## Development

**VS Code Dev Container (recommended).** Create `.env` as above, then run
**Dev Containers: Reopen in Container**. VS Code starts PostgreSQL, runs
migrations, starts the Next.js dev server on <http://localhost:3420> and attaches
to the `app` container, so TypeScript, ESLint and Prettier see the real
dependencies. In the integrated terminal:

```sh
npm run lint
npm run format:check      # npm run format to fix
npm run typecheck
npm run knip              # unused files, exports and dependencies
npm test                  # unit tests
npm run test:integration  # HTTP + PostgreSQL against TEST_BASE_URL
npm run test:e2e          # browser tests (Playwright) against TEST_BASE_URL
```

The browser tests click through the main flows in Chromium, at desktop and phone
(375 px) widths, with a fresh account per test. They mock the AI routes, so they
never call Requesty. `npx playwright test --ui` is handy for watching one run. After
a Playwright update, rebuild the container to get the matching Chromium.

Both suites create throwaway accounts, so run them against their own database and
server, not the dev server you work in:

1. Create a database for the run on `db` (the `vocabulary` role may `CREATE DATABASE`)
   and migrate it with `node scripts/migrate.mjs`, with `DATABASE_URL` pointing at it and
   the test settings from `compose.test.yaml` and `ci.yml`: `ALLOW_REGISTRATION=true`,
   the fake `PRIVACY_*` values, `ADMIN_EMAIL`/`ADMIN_PASSWORD` and a random
   `SETTINGS_ENCRYPTION_KEY`.
2. Build, then start it on a free port with the same variables:
   `npx next build --webpack` and `npx next start -p 3101`, with `APP_ORIGIN=http://localhost:3101`.
3. Run the suites with `TEST_BASE_URL` and `TEST_ORIGIN` set to that origin, and
   `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` for the admin tests. Set them on every
   command: the dev container presets both to the dev server
   (`.devcontainer/compose.yaml`), so a plain `npm run test:e2e` writes to the dev database.

In the dev container, headless Chromium never fires `requestAnimationFrame`, so every
click times out. Start a virtual display and run headed:
`Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp &`, then
`TEST_BASE_URL=http://localhost:3101 TEST_ORIGIN=http://localhost:3101 DISPLAY=:99 npm run test:e2e -- --headed`.
Repeated runs can hit the sign-in limit
(15 per email per 15 minutes); in the test database, `DELETE FROM auth_limits` resets it.

Registration is enabled inside the dev container so you can create accounts to try
things with: the dev database starts with registration open and a
clearly fake privacy contact (`compose.dev.yaml`; CI uses `compose.test.yaml`). AI keys and models are set in the admin area, also in
dev. Automated tests use dummy keys and never call Requesty: with AI configured, the
integration test skips its "AI disabled" checks instead of making paid calls.
Dependencies are reinstalled automatically on start when `package-lock.json`
changes. On Windows, **Dev Containers: Clone Repository in
Container Volume** gives faster file watching than a folder on a Windows drive.
The dev container also has git, the GitHub CLI, curl, jq, ripgrep and `psql`. VS
Code passes in your git identity and credentials; run `gh auth login` once and
the sign-in is kept across rebuilds.

**Claude Code memory (optional).** Inside the dev container, Claude Code keeps its
project memory in `~/.claude-memory/vocabulary-training` on the host (or
`CLAUDE_MEMORY_DIR`), so it survives rebuilds and `git clean`. Claude Code running
directly on Windows uses a separate folder,
`%USERPROFILE%\.claude\projects\<slug>\memory`, where `<slug>` is the repository
path with every non-alphanumeric character replaced by `-` (for example
`e--Dokument--Websites-Github-vocabulary-training`; check the real folder name,
since the drive letter's case can differ). The dev container doesn't link the two.
To share one memory, replace the Windows folder with a junction once, in PowerShell:

```powershell
$memory = Join-Path $env:USERPROFILE '.claude-memory\vocabulary-training'   # or $env:CLAUDE_MEMORY_DIR
$old = Join-Path $env:USERPROFILE '.claude\projects\<slug>\memory'
New-Item -ItemType Directory -Force $memory | Out-Null
if (Test-Path $old) {
  $clash = Get-ChildItem $old -Name | Where-Object { Test-Path -LiteralPath (Join-Path $memory $_) }
  if ($clash) { throw "Both folders have: $($clash -join ', '). Merge them by hand first." }
  Copy-Item "$old\*" $memory -Recurse; Rename-Item $old 'memory.bak'
}
New-Item -ItemType Junction -Path $old -Target $memory
```

If both folders have a file with the same name (usually `MEMORY.md`), it stops
without changing anything: merge those files into the dev-container folder, delete
them from the Windows one, and run it again. Check that the junction lists your
files, then delete `memory.bak`. To remove or
retarget the junction, use `cmd /c rmdir "<path>"`: in Windows PowerShell 5.1,
`Remove-Item -Recurse` on a junction can delete the files it points to.

**Plain Compose.** `docker compose -f compose.yaml -f compose.dev.yaml up --build`,
then run the commands above with
`docker compose -f compose.yaml -f compose.dev.yaml exec app <command>`.
The VS Code workspace file has tasks for these. If dependencies change, rebuild
and recreate the `node_modules` volume. Never remove the database volume to do it.

**CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs format, lint,
typecheck, knip, unit tests, build and `npm audit`, then starts the Docker Compose stack and runs
the integration test, a restart test and the browser tests against it. Draft PRs skip it.
Passing `main` pushes build, re-test and publish the image to GHCR.
A `@claude` mention in an issue runs
[.github/workflows/claude.yml](.github/workflows/claude.yml), which reviews the issue against
the code and answers in a comment: already done, or a plan. Writers only, and read-only:
it can't push or open pull requests.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md): outside PRs are only
reviewed for `help wanted` issues or for plans approved in an issue first.
Code conventions are in [.github/copilot-instructions.md](.github/copilot-instructions.md). Planned work and
open decisions are tracked in
[GitHub issues](https://github.com/GothenburgOffice/vocabulary-training/issues).

## Before exposing it to the internet

This is an early version. The app needs to be served over HTTPS with `APP_ORIGIN` set to the
exact public origin, and registration should stay closed unless it is needed. There is no
email verification, password recovery or MFA yet. Hosting is up to the operator: the reverse
proxy, backups and server hardening are outside this repository, which covers the app and its
container. See [security](docs/security.md) and [architecture](docs/architecture.md).

## License

MIT. See [LICENSE](LICENSE). The artwork made for the hosted service (the logo set in `brand/`
and the icons and share image made from it) is not covered by it: it is
[CC BY-NC 4.0](brand/LICENSE.md). The Requesty logo (drawn inline in
`components/RequestyAttribution.tsx`) belongs to its owner and is not covered by the MIT license
either.
