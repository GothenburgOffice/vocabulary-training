# AI features (optional)

Two optional features use [Requesty](https://docs.requesty.ai/quickstart)'s
OpenAI-compatible API through one server-only `REQUESTY_API_KEY`. With no key,
both are hidden or show a quiet "unavailable" state, and practice works normally.
**Grading, statistics and scheduling never use AI.**

Never expose the key through a `NEXT_PUBLIC_` variable, source, image layers or docs.

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
- The default MiMo/Mia voice is best for English and is not a reliable
  pronunciation teacher for other languages.

## Free-only guard

With `REQUESTY_ALLOW_PAID_MODELS=false` (default), the server checks the key's
authenticated model catalog before each uncached generation:

- **Direct model:** that model must have known zero pricing.
- **`policy/<name>`:** every concrete model visible to the key must have known
  zero pricing. An empty, unknown or mixed catalog is refused. Unpriced
  `policy/` entries are not taken as evidence that a model is free.

The check and the generation are not atomic, and pricing can change. Also restrict
models and spending in Requesty itself, for example with a key-specific
[Access List](https://docs.requesty.ai/features/access-lists). To use a paid
model, change the model setting and set `REQUESTY_ALLOW_PAID_MODELS=true`.

## Rate limits

| Limit                | Language notes               | Audio                               |
| -------------------- | ---------------------------- | ----------------------------------- |
| Per account cooldown | 3 s                          | 500 ms                              |
| Global               | 20/min, 2 concurrent         | 20/min, 2 concurrent                |
| Daily (per UTC day)  | `REQUESTY_DAILY_LIMIT` (200) | `REQUESTY_SPEECH_DAILY_LIMIT` (200) |
| Response cap         | 240 characters               | 4 MB WAV                            |

Failed attempts count. These limits are **in memory per process**: they reset on
restart and aren't shared across replicas. Use provider-side limits if you scale.

## Referral attribution

The footer links to Requesty with a referral code
(`https://app.requesty.ai/join?ref=b1f2b1e1`), and says so: "Referral link.
Signups may earn us AI credits." The link opens in a new tab with
`rel="sponsored noopener noreferrer"`. The logo (`public/requesty-logo.png`) is
adapted from requesty.ai and remains Requesty's property.
