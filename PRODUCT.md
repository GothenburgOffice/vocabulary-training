# vocabulary.training

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Modernize the original vocabulary tester into a personal workspace where people
store word-pair lists in their accounts and practise with statistical sampling.
The design preview remains separate from the account-backed application.

## Capabilities and Constraints

- Native/base language belongs to the profile. The learning-language selector
  contains targets with saved lists, plus an explicitly unsaved new target.
- Dashboard, list counts, review statistics and history belong to a language pair.
- Forward and reverse answers maintain independent review history.
- Sampling and review scheduling use formulas, not AI.
- Optional Requesty comments explain an attempt beneath the existing right/wrong
  feedback, without changing grading or review history. Keep comments to one or
  two short sentences, with a hard 240-character limit.
- Answer comparison treats straight/curly apostrophes, backticks and spacing acute
  accents equally in every language pair. Accented letters remain strict by default;
  stored words and distinct letter-like marks are not rewritten.
- Accepted application direction: Next.js and PostgreSQL in Docker.
- Public repository `GothenburgOffice/vocabulary-training`, MIT license, explicitly authorized
  by the owner on 30 October 2026.

## Brand Commitments

The owner supplies the name vocabulary.training and owns the domain.
Keep the book mark beside the product name. Support one-line and two-line wordmarks
without clipping when the sidebar width changes. Preserve the approved interface
rather than introducing a new visual direction.

## Evidence on Hand

The original tester is available at https://github.com/hkarn/vocabulary-tester-site.
Sample lists and review counts in the preview are illustrative, not real activity.
No testimonials, retention claims or usage metrics are established.

## Open Decisions

Production host, email service, verification, password recovery, external identity
providers, public registration policy and operational support remain undecided.

## AI Scope

AI feedback is only for rejected, non-skipped answers. The owner explicitly
excluded syntactically accepted answers to avoid unnecessary current or future
paid usage. The existing comparison rules decide acceptance, not an LLM.

The owner authorized a simple Requesty integration for short explanatory comments,
not AI grading, list generation or automatically accepting alternatives. Model
selection is operator-configurable for a later paid upgrade, but paid models are
disabled by default. A server-side credential is required for real comments.
The owner clarified that live AI was intended for the design preview, not
merely separate adapter tests, and explicitly approved connecting the existing
private preview using the saved test credential. The preview therefore uses a
separate private feedback backend; lists, profile and progress remain
session-only. No test or production key is placed in source, browser bundles or
container images.

The owner previously requested a dedicated Requesty fallback policy, separate
from the general approved-model list. Optional `policy/VocabFree` support remains,
but the current demo request supersedes that default with one directly configured
free model under the existing ZDR restriction: `novita/ling-3.1-flash`.
The implementation never changes the provider's key policy or spending settings.

## Demo pronunciation and workspace

The owner requested small click-to-play controls for both the question and
answer using the previously free speech model, accepting its English-oriented
limitations for a demo. The selected default is MiMo/Mia. The answer control is
hidden until grading or skipping; displayed library words also have controls.
Both speech and feedback use one server-side `REQUESTY_API_KEY`, with separate
model environment settings and no automatic paid fallback. Account-scoped,
bounded in-memory audio caching avoids repeated generation while cached.

The requested VS Code workspace recommends Claude Code, Docker and GitHub Actions
extensions and includes Docker-first tasks. Future tiers, separate tier keys,
paid models, repository deletion/replacement, and key-policy edits are not part
of this implementation. GitHub commits/pushes still need separate confirmation.
