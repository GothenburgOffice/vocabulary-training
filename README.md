# vocabulary.training

Personal word lists and focused vocabulary practice, modernized from the
[original vocabulary tester](https://github.com/hkarn/vocabulary-tester-site).
Built with Next.js, TypeScript and PostgreSQL, and run with Docker Compose.

## Features

- Email/password accounts with server-side sessions.
- Word-pair lists per language pair, with paired and bulk editing and CSV import/export.
- Practice in either direction with independent review statistics per direction.
- Weighted (spaced review) or random sampling, configurable round size,
  case/accent options, several accepted answers per word (through CSV import for now) and
  mistakes retry.
- Session history per language pair.
- Saves after each answer, with conflict detection across browser tabs.
- Optional: a short AI language note for wrong answers and click-to-play word
  audio, both via [Requesty](https://www.requesty.ai). Grading never uses AI.
  See [AI features](docs/ai-features.md).

## Run it

Requires Docker with the Compose plugin. No Node installation is needed.

```sh
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edit `.env`: set a long random URL-safe `POSTGRES_PASSWORD`, and
`ALLOW_REGISTRATION=true` while you create your account. Registration also needs
`PRIVACY_CONTROLLER_NAME` and `PRIVACY_CONTACT_EMAIL`: who runs the site and a
privacy contact, shown on `/privacy`. Use real details; they're seeded on the first
start and edited in **Admin → Privacy** after that.

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

Open <http://localhost:3420>. After creating your account, set
`ALLOW_REGISTRATION=false` and run the `up` command again.

**Admin.** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first start,
and `SETTINGS_ENCRYPTION_KEY` (`openssl rand -base64 32`) to save AI keys.
While no admin exists, each start creates that account, or promotes an existing
account with that email without changing its password. Admins get an **Admin**
link in the account bar, leading to `/admin`; everyone else gets a 404 there. The
flag is `users.is_admin`, so you can also set it directly in the database.

The app listens on localhost only and PostgreSQL has no published port. Data lives
in a named volume that survives `docker compose down`. **Never use `down -v` on
real data.** Both Compose files share the same project and volume name. Use
`-p <name>` for an isolated test stack.

## Configuration

| Variable                  | Default                 | Purpose                                                                         |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | required                | Database password                                                               |
| `APP_PORT`                | `3420`                  | Host port (bound to 127.0.0.1)                                                  |
| `APP_ORIGIN`              | `http://localhost:3420` | Must exactly match the browser origin; HTTPS enables Secure cookies             |
| `APP_ORIGIN_ALIASES`      | empty                   | More accepted origins, comma-separated (e.g. domain aliases)                    |
| `ALLOW_REGISTRATION`      | `false`                 | Allow new accounts                                                              |
| `ADMIN_EMAIL`             | empty                   | First admin, created on start while no admin exists                             |
| `ADMIN_PASSWORD`          | empty                   | That admin's password (12–4096 characters), used only to create it              |
| `PRIVACY_CONTROLLER_NAME` | empty                   | Who runs the site; seeded on first start, then edited in Admin → Privacy        |
| `PRIVACY_CONTACT_EMAIL`   | empty                   | Privacy contact; registration stays closed until both are set                   |
| `VOCABULARY_IMAGE`        | `…:latest`              | Image for `compose.images.yaml`; pin a `sha-<commit>` tag                       |
| `SETTINGS_ENCRYPTION_KEY` | empty                   | 32 random bytes (base64) that encrypt the Requesty keys saved in the admin area |

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
npm test                  # unit tests
npm run test:integration  # HTTP + PostgreSQL against the running dev server
```

Registration is enabled inside the dev container so the integration test can
create throwaway accounts; the dev container seeds a clearly fake privacy contact
for that, unless `.env` sets real ones. AI keys and models are set in the admin area, also in
dev. Automated tests use dummy keys and never call Requesty: with AI configured, the
integration test skips its "AI disabled" checks instead of making paid calls.
Dependencies are reinstalled automatically on start when `package-lock.json`
changes. On Windows, **Dev Containers: Clone Repository in
Container Volume** gives faster file watching than a folder on a Windows drive.

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
typecheck, unit tests and build, then a Docker Compose integration and restart test.
Passing `main` pushes build, re-test and publish the image to GHCR.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md): outside PRs are only
reviewed for `help wanted` issues or for plans approved in an issue first.
Code conventions are in [CLAUDE.md](CLAUDE.md). Planned work and
open decisions are tracked in
[GitHub issues](https://github.com/GothenburgOffice/vocabulary-training/issues).

## Before deploying to the internet

This is an early self-hosted version. Put HTTPS in front, set `APP_ORIGIN` to the
public origin, keep registration closed unless needed, and test backup and
restore. There is no email verification, password recovery or MFA yet.
See [security and operations](docs/security.md) and [architecture](docs/architecture.md).

## License

MIT. See [LICENSE](LICENSE). The Requesty logo in `public/` belongs to its owner
and is not covered by the MIT license.
