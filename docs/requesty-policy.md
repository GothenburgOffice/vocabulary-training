# Requesty vocabulary feedback policy

## Current demo default

The demo now defaults to direct `novita/ling-3.1-flash`, checked against the
existing restricted key on 31 October 2026 with zero catalog pricing and
`data_retention:false`. No new policy or Access List is required for that direct
selection. The server refuses generation if the model's current pricing is
unknown or nonzero. Availability and pricing may change.

The policy guidance below describes an earlier setup and experiments, not a
current recommended model list. `policy/VocabFree` remains an optional explicit
configuration; it is no longer the app default. Do not alter a provider policy
or key permissions merely to follow this historical guide.

## Earlier policy experiment

Use a dedicated key, Access List and fallback policy for vocabulary.training.
The app requests short comments only for rejected, non-skipped answers:
accepted answers never contact Requesty. Grades, accepted answers and review
statistics remain deterministic.

## Console setup

- **Access List:** Create `Vocabulary feedback free` with only the concrete
  free models you choose below, no wildcard or automatic model approval. Attach
  it to the vocabulary API key instead of inheriting the general Approved Models
  list. Requesty says the key-specific list controls which models that key may
  call ([Access Lists](https://docs.requesty.ai/features/access-lists)).
- **Policy:** Create `VocabFree`, choose Fallback Chain and add
  the models in the order below. Use Requesty's provided keys, not paid BYOK
  fallbacks. Keep retries minimal. Requesty documents ordered fallback on
  provider errors, timeouts and rate limits, using `policy/<name>` in the model
  field ([Fallback Policies](https://docs.requesty.ai/features/fallback-policies)).
- **App configuration:** Set `REQUESTY_MODEL=policy/VocabFree`,
  retain `REQUESTY_ALLOW_PAID_MODELS=false`, and supply your key only in the
  local server environment. Recreate the app container after changing its
  environment. Nothing in this document creates or edits your Requesty account.

## Recommended starting order

This is a task-fit recommendation, not a measured leaderboard for this app.
Only Gemma has been live-tested here; evaluate the other candidates on the same
Swedish/French/English examples before treating their relative order as settled.

| Position | Requesty model ID                   | Reason for this recommendation                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `google/gemma-4-31b-it`             | Broad multilingual coverage makes it my starting choice. Google describes 35+ supported languages and pretraining on 140+; the Muse paper's translation comparisons favor Gemma4-31B over Muse across its aggregate translation directions ([Google model card](https://ai.google.dev/gemma/docs/core/model_card_4), [Muse technical report](https://arxiv.org/html/2610.24628v1)). |
| 2        | `nvidia/muse-glimmer-30b`           | My first backup for Swedish-based learning. Its paper explicitly places Swedish and Standard French in its strong-support set, although that classification uses translation rather than vocabulary-tutor evaluation ([Muse technical report](https://arxiv.org/html/2610.24628v1)).                                                                                                |
| 3        | `nvidia/nemotron-3-ultra-550b-a55b` | A plausible general multilingual backup. NVIDIA lists French and English among supported languages and describes multilingual reasoning/translation training; Swedish occurs in pretraining data but is not in its explicit supported-language list ([NVIDIA model card](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard)).                                    |
| 4        | `nvidia/nemotron-3-super-120b-a12b` | An additional backup, not a demonstrated Swedish tutor. NVIDIA lists English, French, German, Italian, Japanese, Spanish and Chinese as supported languages ([NVIDIA API model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b)).                                                                                                                 |

Start with those four rather than adding every free model. Optionally test
`nvidia/nemotron-3.5-lightning-30b-a3b` last: its explicit supported-language list
does not include Swedish ([NVIDIA model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b)).

I would leave Leanstral and both Laguna models out of this policy: their
published specializations are proof engineering and agentic coding, respectively
([Mistral](https://mistral.ai/news/leanstral-1-5/), [Poolside](https://poolside.ai/blog/laguna-a-deeper-dive)).
Ling 3.1 Flash is a reasonable experiment later, but its published model card
does not establish Swedish or natural-language translation quality; SWE-bench
Multilingual measures software engineering, not spoken-language teaching
([Ling model card](https://huggingface.co/inclusionAI/Ling-3.1-flash)).

## Free-only enforcement and limits

The server checks the authenticated `/v1/models` catalog before each comment.
Requesty documents this as the chat models approved for the organization and
allowed by the exact key's Access List
([List Models](https://docs.requesty.ai/api-reference/endpoint/models-list)).
For policy calls, the app refuses to generate if any concrete visible model has nonzero
or unknown pricing, or if the concrete-model catalog is empty. Unpriced
`policy/` entries are ignored as routing metadata, never accepted as pricing
evidence. Thus a general key that can see
paid models must be narrowed before this policy can run.

This is not an atomic pricing lock or an inspection of the policy configuration.
Keep the key-specific list free-only and check Requesty-side restrictions when
editing it. A paid model later requires deliberate changes to both the key's
permissions/policy and `REQUESTY_ALLOW_PAID_MODELS=true`.

The app makes one generation request to the policy, with a 30-second total
deadline and no app-level retries. A long fallback chain may not finish within
that deadline. Policy fallback responds to infrastructure failure, not an
unhelpful but HTTP-successful explanation or a malformed JSON comment; the app
shows a quiet unavailable state instead. The comment is always capped at 240
characters and never changes the score.
