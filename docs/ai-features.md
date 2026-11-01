# AI features (optional)

Two optional features use [Requesty](https://docs.requesty.ai/quickstart)'s
OpenAI-compatible API through server-only keys, one per [tier](#tiers). An admin
sets them in the admin area (**AI settings** and **Languages**); changes apply
without a restart. A feature without a key and a model is hidden, and practice
works normally. **Grading, statistics and scheduling never use AI.**

Keys are stored encrypted (AES-256-GCM, with `SETTINGS_ENCRYPTION_KEY` from
`.env`) and never sent back to the browser: the admin page only shows whether a
key is set and its last four characters. Never put a key in a `NEXT_PUBLIC_`
variable, source, image layers or docs.

## Language notes for wrong answers

After a rejected, non-skipped answer, a one- or two-sentence note in the
profile's base language appears below the right/wrong feedback.

- Only for wrong answers. Correct answers, including normalized variants and
  accepted alternatives, never trigger a request. The UI, the HTTP route and the
  provider adapter (`lib/server/requesty-client.ts`) each repeat this check
  before using any quota.
- Sends only the phrase, language names, reference answer, the attempt and the
  comparison settings. It sends no account identifiers and no lists.
- The output is plain text capped at 240 characters, or a strict JSON object
  with only `comment`. Anything else is discarded. Notes are never stored.
- One request, a 30-second deadline, a 768-token generation cap, and no retries
  or app-level fallbacks.

## Word audio

Speaker buttons appear beside the question, beside the revealed answer (only
after grading or skipping) and beside library words. Nothing plays automatically.
For alternatives (`a|b`) only the first is spoken.

- Sends only the selected phrase (max 200 characters).
- Audio is cached in memory per account, model, voice, language and phrase for
  one hour (max 128 entries and 16 MB in total). It is never written to disk.
  Identical concurrent requests are generated only once.
- Model, voice and instructions are set per language. A language without a
  speech model has no speaker buttons. Voice and instructions are optional and
  sent only when set, because not every model accepts them.
- Generated voices are not reliable pronunciation teachers, especially outside
  English.

## Tiers

Each account has an `ai_tier`, `basic` (default) or `plus`. Each tier has its own
Requesty key and settings, so each tier's budget and fallback routing are set on
its key in Requesty (see [Cost control](#cost-control)).

| Setting        | Where                   | Basic                      | Plus                                                             |
| -------------- | ----------------------- | -------------------------- | ---------------------------------------------------------------- |
| Key            | AI settings             | Basic key                  | Plus key, else the basic key                                     |
| Language notes | AI settings             | Basic model                | Plus model, else the basic model                                 |
| Word audio     | Languages, per language | Model, voice, instructions | Plus model with its voice and instructions, else the basic three |

A blank basic model turns that feature off for basic accounts (for word audio:
for that language). The admin pages can load Requesty's model list with a key
and suggest chat models for language notes and speech models for audio, with
voice suggestions per model; typed values such as `policy/<name>` also work.
Set an account's tier in the database:

```sh
docker compose exec db psql -U vocabulary -c "UPDATE users SET ai_tier='plus' WHERE email='you@example.com'"
```

## Cost control

The app has no price checks. Cost is controlled on each tier's key in Requesty:
use a `policy/<name>` model for fallback routing, an
[Access List](https://docs.requesty.ai/features/access-lists) to limit which
models the key may use, and a budget on the key. When a key runs out or is
refused, the feature shows its quiet "unavailable" state and practice continues.

## Per-account guards

| Guard              | Language notes | Audio    |
| ------------------ | -------------- | -------- |
| Cooldown           | 3 s            | 500 ms   |
| Requests in flight | 1              | 2        |
| Response cap       | 240 characters | 4 MB WAV |

These protect against a runaway client or repeated clicks. Failed attempts count.
They live in memory per process, so they reset on restart. There are no
server-wide or daily quotas: spend limits and fallbacks belong to each tier's key
in Requesty, and heavy load should show up as load rather than be hidden.

## Referral attribution

The footer links to Requesty with a referral code
(`https://app.requesty.ai/join?ref=b1f2b1e1`), and says so: "Referral link.
Signups may earn us AI credits." The link opens in a new tab with
`rel="sponsored noopener noreferrer"`. The logo (`public/requesty-logo.png`) is
adapted from requesty.ai and remains Requesty's property.
