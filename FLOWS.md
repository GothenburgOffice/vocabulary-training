# Main flows

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

## History
- Completed sessions show only for active pair, keep from/to snapshot. Unfinished sessions do not become history.
- Empty pair history offers return to lists. Profile base switch excludes unrelated history.

## Other surfaces and responsive QA
- Profile saves base and closes, retains explicit session-only mockup notice. Help formulas, original-design link, Escape and dismiss work.
- Sidebar navigation and mobile menu remain functional. Screenshot desktop, 375px and tablet; check no horizontal overflow, console errors and keyboard flows.
- Fresh hosted context: brand, profile, pair selection, zero-state, save new language, quiz and export work. Same preview artifact updated.
