# vocabulary.training

Personal word lists and focused vocabulary practice, modernized from the
[original vocabulary tester](https://github.com/hkarn/vocabulary-tester-site).
Built with Next.js, TypeScript and PostgreSQL, and run with Docker Compose.

## Features

- Email/password accounts with server-side sessions.
- Word-pair lists per language pair, with paired and bulk editing and CSV import/export.
- Practice in either direction with independent review statistics per direction.
- Weighted (spaced review) or random sampling, configurable round size,
  case/accent options, accepted alternatives (`a|b`) and mistakes retry.
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
`ALLOW_REGISTRATION=true` while you create your account.

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

Open <http://localhost:3000>. After creating your account, set
`ALLOW_REGISTRATION=false` and run the `up` command again.

The app listens on localhost only and PostgreSQL has no published port. Data lives
in a named volume that survives `docker compose down`. **Never use `down -v` on
real data.** Both Compose files share the same project and volume name. Use
`-p <name>` for an isolated test stack.

## Configuration

| Variable                      | Default                              | Purpose                                                                            |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`           | required                             | Database password                                                                  |
| `APP_PORT`                    | `3000`                               | Host port (bound to 127.0.0.1)                                                     |
| `APP_ORIGIN`                  | `http://localhost:3000`              | Must exactly match the browser origin; HTTPS enables Secure cookies                |
| `ALLOW_REGISTRATION`          | `false`                              | Allow new accounts                                                                 |
| `VOCABULARY_IMAGE`            | `…:latest`                           | Image for `compose.images.yaml`; pin a `sha-<commit>` tag                          |
| `REQUESTY_API_KEY`            | empty                                | Server-only basic-tier key; empty disables AI notes and audio                      |
| `REQUESTY_MODEL`              | `novita/ling-3.1-flash`              | Model or `policy/<name>` for language notes                                        |
| `REQUESTY_SPEECH_MODEL`       | `deepinfra/XiaomiMiMo/MiMo-V2.5-tts` | Text-to-speech model                                                               |
| `REQUESTY_SPEECH_VOICE`       | `Mia`                                | Text-to-speech voice                                                               |
| `REQUESTY_ALLOW_PAID_MODELS`  | `false`                              | When false, refuses models without known zero pricing                              |
| `REQUESTY_DAILY_LIMIT`        | `200`                                | Language notes per process per UTC day                                             |
| `REQUESTY_SPEECH_DAILY_LIMIT` | `200`                                | Audio generations per process per UTC day                                          |
| `REQUESTY_PLUS_*`             | basic value                          | Plus tier: `API_KEY`, `MODEL`, `SPEECH_MODEL`, `SPEECH_VOICE`, `ALLOW_PAID_MODELS` |

## Development

**VS Code Dev Container (recommended).** Create `.env` as above, then run
**Dev Containers: Reopen in Container**. VS Code starts PostgreSQL, runs
migrations, starts the Next.js dev server on <http://localhost:3000> and attaches
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
create throwaway accounts. The dev container ignores `REQUESTY_API_KEY`, so tests
never call the provider. To try the AI features there, set `DEV_REQUESTY_API_KEY`
in `.env` (the integration test then fails, because it expects AI to be disabled).
Dependencies are reinstalled automatically on start when `package-lock.json`
changes. On Windows, **Dev Containers: Clone Repository in
Container Volume** gives faster file watching than a folder on a Windows drive.

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
