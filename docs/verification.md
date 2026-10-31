# Verification status

## Prepared LLM and audio update, 31 October 2026

Preparation checkpoint: locally implemented and tested, private preview updated,
before the owner approved committing and pushing this scope. These observations
predate CI/publication; check the corresponding GitHub Actions run for release
status. This section supersedes older defaults below; historical checks do not
establish the current provider catalog.

- Feedback: the existing restricted key exposed `novita/ling-3.1-flash` with
  zero chat pricing and `data_retention:false`. A bounded live probe returned
  HTTP 200, a useful Swedish explanation and `usage.cost:0`. The model did not
  follow JSON formatting, so the display-only adapter deliberately supports
  bounded plain text and strict comment-only JSON. The prompt now requests
  plain text. Extra JSON fields, malformed structured output and overlong
  comments remain rejected. Grades never come from this adapter.
- Other free catalog candidates were not selected: Ling 3.0 Tiny returned
  provider 404; Leanstral used its 768-token cap on reasoning with no visible
  comment. Ling's JSON response-format probe returned provider 400. None of
  these caused a paid fallback or key-policy change.
- Speech: the same key's speech catalog exposed MiMo with zero character
  pricing. Actual English playback worked in the local and deployed private
  preview. Audio duration was browser-decoded, not inferred from a MIME header.
  A cached replay returned 38,444 WAV bytes; observed provider speech-generation
  count stayed unchanged across replay. This validates current catalog pricing,
  not a guarantee of future pricing or multilingual pronunciation quality.
  The checked speech catalog also declared `data_retention:false`.
- Automated tests: 36 unit tests passed, TypeScript passed and the account and
  static-preview production builds passed using the existing Node 22 toolchain.
  No host packages were installed.
- Account integration: real HTTP and the existing disposable local PostgreSQL
  test database passed account creation, ownership, revision conflicts,
  persistence, CSRF and logout tests. Added speech checks cover unauthenticated
  401, cross-origin 403, invalid/model-injection input 400 and missing-key 503.
  The HTTP test also checks the audio-specific CSP directive.
- Browser: actual UI import/save, profile and language-pair changes, practice,
  wrong-answer feedback, correct answers, skipping, results/history, voice
  disclosure and sign-out were exercised. Correct and skipped answers did not
  increase live feedback-call counts. Answer audio was hidden before grading
  and visible afterward. A mocked 429 displayed the audio-limit message without
  blocking practice.
- Playback lifecycle: a synthetic ten-second WAV through the account UI verified
  blob playback under the production CSP; advancing paused the element, removed
  its source and reset playing controls. A delayed synthetic audio response was
  aborted on session exit and did not add a playback event. These fixtures tested
  lifecycle/CSP, not model pronunciation.
- Visual: desktop and 375-pixel layouts were inspected, including revealed
  answer controls and feedback. No horizontal overflow or application page
  errors were observed. The unchanged missing `/favicon.ico` produced one 404
  in the account browser check; this was not an audio/CSP failure.
- GitHub main remained `914a626fa617d8024cd390e8e78c7dd0f6e8fb0d` during the
  preparation check. At that checkpoint no commits, pushes, repository replacement, deployment to a
  production host, package visibility edits, provider key changes or tiers were
  performed.

Docker is unavailable in this sandbox, so this is not a fresh container test or
an org-namespace GHCR release verification. The existing CI container/restart
tests must pass in CI. A push to main also triggers the existing
GHCR publication job; package visibility/pullability must then be checked rather
than assumed following the repository transfer.

## Earlier implementation checks

This file records the first implementation's checks and limitations. It is not a
standing product instruction or a guarantee about later revisions.

## Local environment

The initial Computer sandbox has Node 22 and a temporary PostgreSQL 18 test
instance. Docker is not available locally. The application's production
standalone build and HTTP/database integration tests can run directly here;
those checks do not certify Docker behavior.

The supported container stack pins PostgreSQL major version 17. GitHub Actions
is configured to test that actual container stack, including migrations and
application restart. Its result must be checked separately from local tests.

## Check inventory

- Learning: normalization, accepted alternatives, weighting, independent
  directional review intervals and CSV.
- Security: salted passwords, verification, credential normalization, payload
  validation, authenticated ownership and untrusted-origin rejection.
- Persistence: real account creation/sign-in, empty first workspace, saves,
  logout/re-login, revision conflicts and database isolation between users.
- UI: responsive brand at desktop, narrow sidebar and mobile menu; account
  forms; saved lists/profile; complete practice/history; import/export; retry and
  unsaved-state behavior; short desktop window and width-resize cycle.
- Hosted preview: new logo variants and existing list/practice behavior after
  deployment to the same artifact.

## Checks completed in the initial sandbox

- Seven unit-test groups passed; the optimized Next.js build passed.
- Real HTTP/PostgreSQL integration passed for authentication, cookie flags,
  account isolation, logout/re-login persistence, stale revisions, CSRF rejection,
  malformed and oversized requests, sign-out revocation and rate limiting.
- Browser flow passed for registration, creating and reloading a word list,
  completing a quiz, reloading session history, sign-out/re-login, changing the
  profile base language, and an explicitly retried simulated save failure.
- Logo bounds were checked at 1440, 1200, 1024, 900, 768, 681, 680, 390 and
  320 pixels. Account layouts were checked at desktop, tablet, mobile and a short
  desktop window, with no page-level horizontal overflow.
- Taste source lint reported zero failures and warnings. Its rendered app
  inspector reported zero failures and one ragged-row warning: the left column
  is two stacked library sections, not a card intended to end beside practice.
  Desktop, tablet and mobile screenshots were reviewed.
- Impeccable found a low-contrast placeholder, which was darkened. Its font
  warning is retained intentionally to preserve the user's approved design.
  Detector results are not a comprehensive accessibility certification.

## Container execution

The initial [GitHub Actions run](https://github.com/hkarn/vocabulary-training/actions/runs/41125942344)
passed both the unit/build job and the Docker Compose integration job.
That job built the production image, started PostgreSQL 17, applied migrations,
passed the HTTP integration suite and verified the same authenticated session
and saved list after restarting the application.

This verifies the CI container environment, not the user's device, a production
host, or backup restoration. Inspect the latest Actions run for later revisions.

## Explicit limits

Physical iOS/Android devices, Safari, mail delivery, password recovery, public
production deployment, backup/restore and external identity providers are not
verified here. The attached preview is sample-data only.

## Requesty feedback checks, 31 October 2026

- Twenty unit-test groups passed, including apostrophe normalization, unchanged
  strict accents, prompt boundaries, Unicode-safe 240-character output caps,
  free-pricing guards, policy routing, malformed outputs and usage limits.
- TypeScript and the account app's optimized production build passed. The
  synchronized static design preview also built successfully.
- Browser checks used explicitly mocked account/workspace/feedback endpoints,
  not a real database account. They covered loading, an immediately usable
  advance button, discarded late responses, no API call on skip, unavailable,
  disabled, limited, malformed and overlong comments, and reversed direction
  with explanations still requested in the profile base language.
- Desktop and 375-pixel mobile feedback layouts showed no page-level horizontal
  overflow. No page errors were captured in the mocked-account checks.
- Live calls through the actual adapter and the user's saved credential
  verified the free direct model `google/gemma-4-31b-it` could return both a
  Swedish/French near-synonym explanation and a strict accent explanation.
  These comments were 96 and 66 characters, respectively. Other attempts
  returned empty output or timed out and were safely treated as unavailable.
  These observations are not a model-quality benchmark.
- The provider generation cap was raised to 768 tokens because the free model
  spent its smaller allowance on reasoning even with minimal reasoning
  requested. The displayed comment remains independently capped at 240
  characters. The initial 12-second server deadline was later superseded by the
  policy verification below.
- The subsequent policy change defaults to `policy/VocabFree`. Unit tests
  verify that mixed paid/free, unknown, empty and duplicate-ID key catalogs
  cannot generate, and that a permitted request sends the policy name rather
  than escaping to a direct model.
- `policy/VocabFree` subsequently appeared in the live authenticated catalog.
  That catalog also contained paid concrete models, so the generation attempt
  was refused before inference. The policy name's presence does not verify a
  successful policy call. Live policy inference is pending the operator
  attaching a dedicated free-only Access List. Policy aliases are now excluded
  from concrete-model price validation; this behavior passed the unit suite.
- The same preview artifact was updated in place. A fresh hosted-asset context
  passed language-pair filtering, the explicit non-live AI box, zero feedback
  API requests, and the mobile overflow check, with no page errors. The outer
  Perplexity wrapper hit a Cloudflare challenge in automation; the signed
  hosted asset itself loaded with the expected opaque origin. The wrapper was
  not independently verified past that challenge.
- Static-preview regression checks covered completing practice and updating
  history, creating and reopening a list, CSV export, CSV import preview and
  opening the profile. These are session-only demo checks, not database
  persistence verification.
- No Requesty console settings
  were edited. No paid model, GitHub write or image publication was authorized
  or performed for this change. Docker is unavailable in this sandbox, so this
  revision has not been container-tested here.

### Live VocabFree verification

After the operator attached the free-only Access List, the authenticated
catalog passed the price guard. Two requests with the initial short deadline
timed out safely. The shared server deadline was then increased to 30 seconds,
with a 33-second client timeout; moving to the next word remains non-blocking.
The adapter unit test verifies the configured deadline and that the catalog
and generation requests share the same abort signal.

A subsequent real request to `policy/VocabFree` succeeded. Requesty reported
`google/gemma-4-31b-it` as the routed model, a normal completion, and a
94-character Swedish explanation of `à plus tard` versus `à bientôt`.
This verifies successful primary routing through the policy, not forced
failover to every model or consistent response latency.

All twenty unit-test groups, TypeScript, and both production builds passed
after the deadline change. Paid models stayed disabled; no GitHub or GHCR
updates were made. This section supersedes the earlier pending-Access-List
status.

### Extended diagnostic deadline

At the operator's request, the separate live-check runner allows up to 180
seconds per policy test without changing production code, its normal
30-second deadline, the policy order or model access. It still uses the app
adapter's free-price guard and comment validation, with a process-local test
override for its abort deadline.

Two `policy/VocabFree` tests completed: a Swedish/French near-synonym comment
of 125 characters in approximately 12.2 seconds and an English/French accent
comment of 64 characters in approximately 7.3 seconds. Requesty reported
`google/gemma-4-31b-it` in both response model fields. Per-attempt policy logs
were not inspected, so these results do not prove which attempts failed,
whether a fallback occurred, or Gemma-first reliability.

The runner's first timing output accidentally labeled milliseconds as seconds.
The figures above use the correct millisecond-to-second conversion; the runner
has been corrected. There were no further inference calls just to reformat
those measurements. GitHub and GHCR remain unchanged.

### Live design preview, superseding the non-live preview

The owner clarified that the feature was intended to be exercised inside the
design preview, then explicitly approved connecting that same private artifact
to the saved test credential. A separate sandbox-only backend now obtains that
credential through the supported server credential proxy. Neither the upstream
key nor the proxy credential is sent to the browser or included in repository
source or static output.

The bridge requires the private proxy's visitor header plus a random,
visitor-bound session proof for feedback POSTs. Local security checks passed
for missing visitor/proof, wrong visitor, invalid proof, disallowed origin,
malformed JSON, extra model fields, non-JSON content and oversized bodies.
The only permitted provider calls are the fixed Requesty catalog and
completion endpoints, with `policy/VocabFree`, paid models disabled and a
180-second background deadline. The normal account-app deadline remains
30 seconds. Input validation and price/output checks are shared with the app.

A real call through the private backend returned a 64-character accent
explanation. More importantly, a fresh hosted preview with its opaque origin
then displayed an actual Swedish Requesty comment beneath the incorrect
grade. The advance button stayed enabled, and browser instrumentation observed
one feedback POST, zero direct browser-to-Requesty calls and no page errors.
The live banner discloses that answers are sent to Requesty.

Twenty-two unit-test groups, TypeScript and both production builds passed.
The deployed browser assets contained no credential-environment names or
API-key transport code. Lists/profile/history are still illustrative
session-only state. Immediate hosted access was verified, not credential
renewal or durable unattended backend availability. No GitHub or GHCR update
or public publication occurred.

Hosted follow-up checks confirmed that missing `î` was graded incorrect with
a 55-character live accent comment, while the spacing-acute apostrophe in
`s´il vous plaît` was graded correct with a 72-character live comment. Results
remained one correct answer out of two, independent of AI text. Skip actions
made no feedback calls. Desktop/mobile layouts had no horizontal overflow;
CSV import preview and a real CSV download worked, and the profile opened.

A clearly mocked pending response was used only for the cancellation check:
reverse-direction payloads kept Swedish as the explanation language, advancing
did not wait, and a late response did not leak into the next question. After a
fresh hosted reload, sample edits reset as disclosed, the live banner remained,
and the real private session endpoint returned a new/valid visitor-bound proof.
No page errors or direct browser-to-provider requests were observed.

### Incorrect-answer-only feedback

The owner excluded AI calls for syntactically accepted answers to avoid
unnecessary current or future paid usage. The shared decision function now
reuses the ordinary answer matcher, including alternatives, apostrophe styles,
case settings and accent settings. The UI renders no AI box or loading state
and makes no preview-session/feedback request for accepted or skipped answers.
Both HTTP backends skip accepted answers before quota acquisition, while the
provider adapter independently refuses them before any catalog or model call,
even if a caller sends an incorrect `correct:false` flag.

Twenty-four unit-test groups, TypeScript and both production builds passed.
The actual preview backend accepted 22 syntactically correct requests without
using feedback quota, then successfully handled an incorrect accent attempt.
Unit transport spies verified zero provider requests for accepted answers in
both free-only and explicitly paid configurations.

The same artifact was updated in place. In a fresh hosted browser context,
two correct answers (including the spacing-acute apostrophe variant) produced
two correct grades, zero AI panels and zero private-backend requests. This
verifies the client-side suppression, not merely a backend no-op.

A second hosted round made exactly one feedback POST for one rejected accent
attempt and none for its correct answer. The live incorrect-answer comment
was 39 characters, while the deterministic result remained one correct out of
two. Skipping a subsequent whole round also made zero backend requests and
showed no AI panels. Export, CSV import preview, editing/cancel, language-pair
filtering, profile opening and mobile overflow checks passed with no page
errors. GitHub and GHCR remain untouched.
