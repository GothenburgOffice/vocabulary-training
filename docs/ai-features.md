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

- Only for wrong answers. Correct answers, including normalized variants and a
  word's other accepted answers, never trigger a request. The UI, the HTTP route and the
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
A word with several accepted answers speaks its primary answer.

- Sends only the selected phrase (max 200 characters).
- Audio is cached in memory per account, model, voice, language and phrase for
  one hour (max 128 entries and 16 MB in total). It is never written to disk.
  Identical concurrent requests are generated only once.
- Model, voice and instructions are set per language. A language without a
  speech model has no speaker buttons. Voice and instructions are optional and
  sent only when set, because not every model accepts them.
- Generated voices are not reliable pronunciation teachers, especially outside
  English.

## Reporting a problem

The lower sidebar has one **Report an issue** entry. Choose a speech or
language-note action from the last hour and a fixed reason. Recent activity stores
the text read or word, language, configured model and voice, tier and time, tied to
the account. Expired activity is cleaned up when activity is used. It stores no
audio, provider keys or generated language notes.

A report keeps a copy of those details for **Admin → Reports**, even after the
recent activity expires. The admin can permanently prune reports older than
15 days. Reports and activity are deleted with the account. Reporting makes no
provider request and never affects grading. See `/privacy` for retention details.

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

## Per-account limits

Both features take a word id, never text: the server reads the word from the
account's own lists, so only a learner's typed answer comes from the browser.
Each account has a letter budget per feature, counted on what is sent to the
provider and kept in PostgreSQL (`ai_usage`), so it holds across restarts:

| Limit                       | Language notes    | Audio                      |
| --------------------------- | ----------------- | -------------------------- |
| Letters per minute          | 3,000             | 1,200                      |
| Letters per day, basic/plus | 100,000 / 300,000 | 100,000 / 300,000          |
| Cooldown                    | 3 s               | 500 ms                     |
| Requests in flight          | 1                 | 1 (replaceable after 10 s) |
| Response cap                | 240 characters    | 4 MB                       |

These are defaults. The limits are site settings (`limits.*`), editable in
Admin → Limits or the database; a letter limit of 0 means no limit, for a site
that caps spending only in Requesty. Cached audio costs no letters. The cooldowns
and the one-request-at-a-time rule live in the server process, which is fine as
the app runs as one. Admin → Overview shows site-wide usage totals.

## Referral attribution

While an AI feature is on, the sidebar credits Requesty with a referral link
(`https://app.requesty.ai/join?ref=b1f2b1e1`), marked "Referral link"; its
accessible name and tooltip add "signups may earn us AI credits". It opens in a new tab with
`rel="sponsored noopener noreferrer"`. The logo (`public/requesty-logo.png`) is
adapted from requesty.ai and remains Requesty's property.
