# Main flows

## Current verification outcome

The LLM/audio update has 36 passing unit tests, passing TypeScript and production
builds, and passing local HTTP/PostgreSQL integration tests. Browser checks cover
local and deployed private-preview speech/feedback, account CSP playback using a
synthetic WAV, cache replay without another generation, no feedback on correct
or skipped answers, hidden/revealed answer controls, 429 fallback, stop-on-advance
and late-response cancellation. Desktop and 375-pixel layouts were inspected.
See `docs/verification.md` for the dated evidence and limitations. Docker and the
post-transfer GHCR publication were unverified at this pre-push checkpoint.
The owner subsequently approved committing/pushing this scope; release results
are established by the corresponding GitHub Actions run, not this local QA record.

## Current demo update: shared key, direct free model and pronunciation

- Keep all existing account, list, pair, grading, CSV and practice flows intact. No schema change or user-tier implementation.
- Default text feedback to the currently key-visible, zero-priced, non-retention `novita/ling-3.1-flash`. No text-feedback call for accepted or skipped answers, even if speech is used.
- Use one server-only `REQUESTY_API_KEY` for text and speech; leave the real value out of source, examples, browser bundles, container images and documentation.
- Show small, keyboard-accessible speech controls beside both displayed library word columns, beside the current prompt, and beside the revealed reference after grading. Reverse direction must use the correct text and language. Never render an answer pronunciation control before grading.
- Only a user click may generate/play speech. Replaying a cached word must not generate again. Stop audio and discard late responses when changing word/view or starting another playback.
- Verify loading, playback/stop, unavailable, missing key, quota, unknown/nonzero pricing, invalid/oversized audio and double-click/concurrent request deduplication. Speech failures must not change a grade or block typing/Next.
- Use MiMo/Mia as an explicitly imperfect demo voice, best for English. Models and voice remain environment-configurable, with no automatic paid fallback.
- Add a `.code-workspace` with the three requested extension recommendations and Docker-first tasks. Do not require extensions for built-in TypeScript support.
- Verify tests/typecheck/build, focused desktop/mobile browser flows and real bounded provider calls. Docker execution remains a separately reported CI check if unavailable here.
- GitHub writes, commits, pushes and the workflow's automatic GHCR publication require the user's confirmation after review.

## Optional Requesty language note

- Request a separate AI note only for an incorrect, non-skipped answer. Correct answers show the normal grade only: no AI box, session fetch, catalog check or generation call. Enforce this in UI, both HTTP backends and the shared provider adapter, before quota acquisition.
- Use the existing deterministic matcher, including accepted alternatives, apostrophe normalization and configured case/accent rules, to suppress feedback even if a caller incorrectly sends `correct:false`. Never change scoring, scheduling, accepted answers or saved words.
- Ask for one or two sentences in the base language; enforce 240 characters. No model call for skipped answers.
- Test loading/success, missing configuration, timeout, HTTP 429, malformed/oversized responses, prompt injection, and late responses after moving on. Next word remains immediate.
- Keep keys/model selection server-side; authenticate and check origin, bound inputs and limit calls. No app-level retries or direct-model escape hatch. Requesty's dedicated policy manages free fallbacks.
- The current demo uses a direct configured model. Optional `policy/VocabFree` configuration remains supported: for free-only policy requests, verify every concrete model in the authenticated key-visible chat catalog has known zero pricing; mixed paid/free, empty or unknown concrete-model catalogs must fail before generation. Unpriced policy aliases are not pricing evidence.
- The existing private design preview now needs real Requesty feedback, with its saved test credential injected only into a private backend. Sample lists/profile/history remain session-only. No key in browser code, GitHub or a container image.
- Preview calls use the configured direct free model, enforce its free-only catalog guard, and require a visitor-bound server session proof. No model call for skipped answers; advancing remains immediate.
- Test a real hosted feedback response, malformed/oversized input rejection, missing/wrong session proof, disallowed origin and rate limits. Do not treat separate API tests as verification of the preview.
- Recheck editing, CSV, pair/profile switching, practice/results/history, skip/exit, desktop/mobile. No GitHub write, public publishing or production database changes.

## Library and language context

- Start: main page. Previously three mixed-pair lists and global totals.
- Requested: book icon restored beside vocabulary.training in sidebar and mobile header. Compact base-language/profile control and learning-language dropdown in sidebar (mobile: Menu), no horizontal language bar above main content. Base language remains configured in Profile.
- Sidebar language switching disabled during editor, quiz and results to prevent active content changing underneath. Switch remains available in library/history.
- Expect after update: Swedish/French has two lists, 20 words, 5 due, 4 established. Swedish/Spanish has one list, 6 new words and no learned/due words. English/Spanish has its own separate list. Search changes rows, not pair totals. Reverse direction updates directional stats, never the language-pair scope.

## Add a language and edit lists

- Start: Learning language > Add a language. Choose German, see empty dashboard. Cancel or switch away before saving: German does not become a saved option.
- Create list: name and complete pairs required; pair and bulk modes; add/remove rows. Save: the list belongs to the profile base and selected learning language; German becomes a saved option. Cancel must not add a list.
- Changing profile base never relabels, deletes or migrates saved lists. Switch back to recover existing lists. Base and target must differ.

## Import and export

- Import CSV accepts original language codes, quoted cells and file input; reject malformed/incomplete rows. Matching base opens editor; different base reports a clear mismatch instead of changing profile or relabeling words. Save follows imported target pair and adds it to the selector.
- Export downloads current selected list's language header and pairs.

## Practice and results

- Pick a list in current pair, select mode/session length and answer settings; forward/reverse, typed answer, skip, feedback, Enter-next, completion score, mistakes retry.
- No list in current pair: no stale practice/editor/export from another pair. Practice navigation returns to empty dashboard.
- Active session: scope cannot change; profile save blocked until session ends. Exit confirm/cancel works.
- Apostrophe matching: straight apostrophe, backtick, spacing acute accent and curly apostrophes compare equally in typed and saved answers, for every language pair and both practice directions.
- Keep accents required by default: î/i, é/e and plaît/plait remain different; canonically equivalent composed/decomposed accents match. Apostrophe normalization must not change saved text, remove punctuation, fold letter-like marks, or accept semantic alternatives automatically.
- Verify the new matching in an edited sample list, the answer-settings explanation, results/history and a fresh hosted preview. No GitHub write, public publishing, database change or LLM integration is part of this change.

## History

- Completed sessions show only for active pair, keep from/to snapshot. Unfinished sessions do not become history.
- Empty pair history offers return to lists. Profile base switch excludes unrelated history.

## Other surfaces and responsive QA

- Profile saves base and closes, retains explicit session-only mockup notice. Help formulas, original-design link, Escape and dismiss work.
- Sidebar navigation and mobile menu remain functional. Screenshot desktop, 375px and tablet; check no horizontal overflow, console errors and keyboard flows.
- Fresh hosted context: brand, profile, pair selection, zero-state, save new language, quiz and export work. Same preview artifact updated.
