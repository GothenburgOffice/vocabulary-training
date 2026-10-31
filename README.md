# vocabulary.training

Personal word lists and focused vocabulary practice, modernized from the
[original vocabulary tester](https://github.com/hkarn/vocabulary-tester-site).
Next.js, TypeScript and PostgreSQL, with Docker Compose for development and running
the application. Core practice needs no AI service; optional Requesty comments
use an operator-owned server-side key.

## Features

- Accounts with email/password sign-in and server-managed sessions.
- Saved profile language, word-pair lists, independent forward/reverse review
  statistics and completed-session history.
- Language-pair dashboards, paired and bulk editing, CSV import/export.
- Weighted or random sampling, configurable round sizes, case/accent handling,
  accepted alternatives, mistakes retry and keyboard-friendly answering.
- Responsive book/wordmark variants selected by the sidebar's available width.
- Explicit saving/error states and optimistic concurrency checks across tabs.
- Optional short AI language notes for wrong answers, separate from grading.
- Click-to-play pronunciation for questions, revealed answers and displayed words.

## Optional Requesty language notes

This source version adds a small AI comment below right/wrong feedback. It does
not change grades, statistics, accepted answers or saved words, and does not block
the next question. Comments use the profile's base language, are requested as one
or two sentences, and are bounded to 240 characters as plain text. They are not
stored in the workspace or sent for skipped answers.

Only rejected, non-skipped answers request an AI comment. Correct answers,
including normalized apostrophe/case/accent variants and accepted alternatives,
make no feedback request. Both HTTP backends and the provider adapter repeat
that check before acquiring quota or contacting Requesty.

Configure `REQUESTY_API_KEY` in your local `.env` and recreate the app container.
Never use a `NEXT_PUBLIC_` variable for the key. `REQUESTY_MODEL` selects the model
or policy; the demo default is `novita/ling-3.1-flash`. The existing ZDR-restricted
key exposed this model with zero chat pricing and `data_retention:false` during
the 31 October 2026 check. This is a dated observation, not a promise of ongoing
availability or pricing. The app does not alter key permissions, ZDR settings,
Access Lists or account budgets.

With `REQUESTY_ALLOW_PAID_MODELS=false`, the server fetches the authenticated
key-visible chat catalog before generation. For a policy, every concrete visible model
must have known zero pricing; an empty, unknown or mixed paid/free catalog is
refused. Unpriced `policy/` aliases in that catalog are routing metadata, not
models or proof of free pricing. Direct-model configuration
instead checks that exact model's pricing. See [the optional policy setup and
historical tests](docs/requesty-policy.md). There are no app-level retries, tools
or automatic model fallbacks; an explicitly configured policy can manage its
own fallbacks.

Requesty documents its OpenAI-compatible API at
[Quickstart](https://docs.requesty.ai/quickstart), its current free-model limits at
[Free Models](https://docs.requesty.ai/features/free-models), and current model
pricing at [List Models](https://docs.requesty.ai/api-reference/endpoint/models-chat-list).
Pricing can change. Restrict approved models and spending in Requesty itself;
application checks do not replace provider-side account controls.
The price check and inference are not atomic: do not edit key permissions or
model pricing assumptions during an in-flight request.

Later, choosing a paid model requires changing `REQUESTY_MODEL` and explicitly
setting `REQUESTY_ALLOW_PAID_MODELS=true`; no UI or prompt rewrite is needed.
No paid calls are authorized merely by building this integration.

The single-process guard permits 20 requests/minute, two concurrent requests, one
request per account every three seconds, and `REQUESTY_DAILY_LIMIT` (default 200)
app requests per UTC day. Policy fallbacks can consume additional provider
attempts. App attempts that fail still count. These in-memory limits reset
on restart and are not shared across replicas; use provider limits if scaling.
Requests and provider response bodies are bounded, with a 30-second provider
deadline across the catalog check and generation. This also bounds how long a
fallback chain may take; it does not promise every fallback will be reached.
The generation cap is 768 tokens (including any provider reasoning), while the
display cap remains 240 characters. The prompt requests plain text; the adapter
also accepts a strict JSON object containing only `comment`, never grading fields.
Missing configuration, provider errors and malformed output show a
quiet unavailable state while normal practice continues.

Only the current phrase, language names, reference, attempted answer and comparison
settings are sent to Requesty and the selected provider, not account identifiers
or complete lists. Provider retention/training policies vary; inspect the model
metadata and [Requesty's data-policy guidance](https://www.requesty.ai/guides/eu-ai-data-residency-sovereign-ai).
Avoid sensitive material in exercises. The private Computer design preview can
connect to a separate private feedback backend using the owner's saved test
credential. Its banner explicitly labels live AI; sample lists and progress
remain session-only. A disconnected preview shows a clearly labelled
non-live state rather than inventing comments.

## Optional word audio

Text feedback and audio share the one server-only `REQUESTY_API_KEY`. The demo
defaults to `REQUESTY_SPEECH_MODEL=deepinfra/XiaomiMiMo/MiMo-V2.5-tts` and
`REQUESTY_SPEECH_VOICE=Mia`. Both are environment settings so they can be changed
without editing the UI. There is no automatic paid fallback. The server checks
the authenticated speech catalog for known zero pricing before each uncached
generation when `REQUESTY_ALLOW_PAID_MODELS=false`.

Use the speaker icon beside a question, a revealed reference answer, or either
displayed library word. The answer button appears only after grading or skipping.
Nothing plays or generates automatically; the first saved `|` alternative is
spoken. Starting another word, changing the view, or advancing stops playback.
The selected demo voice is best for English and is not a reliable pronunciation
teacher for every language. MiMo documents English/Chinese support on its
[model page](https://deepinfra.com/XiaomiMiMo/MiMo-V2.5-tts).

Audio is private, never written to disk, and cached in memory per account,
model, voice, language and exact phrase for one hour, subject to 128 entries
and a 16 MB process-wide budget. Cache replay and concurrent identical requests
do not generate again. Restart, expiry or eviction requires regeneration.
`REQUESTY_SPEECH_DAILY_LIMIT` defaults to 200 attempts per process per UTC day;
the separate single-process guard also applies a 500 ms account cooldown,
20 requests/minute and two concurrent requests. Failures still count. These
limits are not durable or shared across replicas. Each generation has a 30-second
deadline, a 200-character phrase cap and a 4 MB WAV-response cap.

Clicking sends only the selected phrase to the speech provider, not your profile,
list, attempted answer or account ID. Audio is a separate, explicitly clicked
request; the rule of no text-feedback calls for correct answers still applies.
If either service is unavailable, normal practice continues.

## VS Code workspace

Open `vocabulary.training.code-workspace`. It recommends `anthropic.claude-code`,
`ms-azuretools.vscode-docker`, `ms-vscode-remote.remote-containers` and
`github.vscode-github-actions`, and includes
Docker development, unit-test, typecheck and lint tasks. For a full in-editor
toolchain, use the Dev Container described under Container-first development. Create `.env` first, then
start the Docker development task before running its test/typecheck tasks.
No additional extension is required: TypeScript support is built into VS Code.
The editor uses its bundled TypeScript when host dependencies are absent;
the container runs the project's locked toolchain. No host Node install is needed.

The previously published image does not gain these features until a new release
is explicitly approved, built and published.

## Test the published image

The repository is [GothenburgOffice/vocabulary-training](https://github.com/GothenburgOffice/vocabulary-training).
The image-only configuration targets `ghcr.io/gothenburgoffice/vocabulary-training`.
Confirm that namespace has an approved, successful publication after the transfer;
do not assume a prior personal-namespace package transferred or that a new package
is anonymously pullable. Verify package visibility and CI results before using it.
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

### VS Code Dev Container (recommended)

Install the Dev Containers extension, copy `.env.example` to `.env` and set
`POSTGRES_PASSWORD`, then run **Dev Containers: Reopen in Container**. VS Code
starts PostgreSQL, the migration job and the Next.js dev server
(<http://localhost:3000>), and attaches to the `app` container. The editor then
uses the container's `node_modules`, so TypeScript, ESLint and Prettier work fully.
Run checks from the integrated terminal:

```sh
npm run lint          # ESLint
npm run format:check  # Prettier (npm run format to fix)
npm run typecheck
npm test              # unit tests
npm run test:integration  # real HTTP + PostgreSQL against the running dev server
```

Inside the dev container registration is enabled so the integration test can
create throwaway accounts in the local database. On Windows, file watching is
faster if you use **Dev Containers: Clone Repository in Container Volume**
instead of opening a folder on a Windows drive.

### Plain Docker Compose

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
docker compose -f compose.yaml -f compose.dev.yaml exec app npm run lint
```

GitHub Actions runs format, lint, typecheck, unit and build checks and a separate real Docker Compose integration
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
The explicitly enabled live-preview variant uses a private, visitor-bound
feedback bridge with a server-held test credential, a three-minute background
deadline and the same free-only policy/input/output guards. This is preview
infrastructure, not production hosting or account persistence. Credential
renewal and unattended long-term availability are not established by an
immediate successful test.

Neither test nor production keys belong in source control or image layers.
Production operators supply a separate key through hosting secrets/runtime
environment; the preview's saved credential is not a production default.

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
