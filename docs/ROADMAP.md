# Book Studio — Roadmap to "Canva for Book Publishing"

Master build checklist, ordered roughly by priority/dependency. Tick a box when a
milestone genuinely ships (build/lint/test clean, verified live) — the detailed
technical log for *how* still belongs in `STATUS.md`; this file just tracks *what's
left*. Items already shipped are pre-checked based on `STATUS.md` as of 2026-07-31.

---

## Phase A — Core Publishing Engine (v1) ✅ Complete

- [x] App shell, dark/light theme, Zustand stores per layer, Project Settings
- [x] Manuscript import: Markdown, TXT, HTML, DOCX
- [x] Asset library (IndexedDB-backed image storage)
- [x] Automatic pagination / layout engine (real measured block heights)
- [x] 5 themes (Classic Novel, Premium Nature, Coffee Table, Educational, Children's)
- [x] Typography: hyphenation, ligatures, drop caps, justified/ragged-right
- [x] Two-page spread / single-page preview, zoom, thumbnail rail
- [x] Print-ready PDF export: bleed, crop marks, embedded fonts, WYSIWYG
- [x] Performance: lazy-mounted spreads, code-split PDF/DOCX libraries
- [x] Keyboard shortcuts, undo/redo, version history (snapshot + restore)
- [x] Inline manuscript text editing (no re-import needed to fix a typo)
- [x] Modular page system: structural pages (cover, title, copyright, TOC, etc.) +
      8 in-chapter content block types
- [x] Fixed Markdown import bug (2026-07-31, Phase 50): a manuscript that opens
      with a title-page-style H1 + a hand-typed "Contents" section (a common
      real-world manuscript shape — reported by the user importing a real
      16-chapter book) produced a bogus first "chapter" and a second, broken,
      permanently-stale table of contents alongside the app's own real one,
      and shifted every real chapter's auto-generated opener number one
      higher than the number already in its own title. `parser/markdown.ts`
      now drops a manually-authored Contents section and any purely
      heading-only leading chapter. See docs/STATUS.md Phase 50.

## Phase B — Editor UX: Content Editing & Block Management

*(Added 2026-07-31, from real usage: "we can edit text, but it needs improving with
a small editor or something... page titles end up in a funny place... only paragraphs
[are editable], no way to delete a paragraph." Confirmed in the code — inline editing
and block deletion are real but inconsistent: only the original 6 block types
(heading/paragraph/quote/list/table/image) reliably support inline text edits;
structural-page text (Title Page, Half Title, Cover, Dedication, etc.) is only
editable through the Inspector's Page settings panel, not on the canvas itself; and
`deleteBlockWithHistory` is only wired up for image blocks — every other block type
has no delete UI at all. This is core to `CLAUDE.md`'s "true WYSIWYG editing" and
"visual rather than settings-based" rules, so it's placed right after the core engine
— ahead of finishing the Virtual Editor — since a shaky editing experience undermines
daily use of everything built so far.)*

- [x] Inline text editing for paragraph/heading/quote/list/table blocks (Phase 10)
- [x] Chapter title renaming (sidebar pencil icon + double-click the chapter-opener H1)
- [x] Floating format toolbar on text selection (bold/italic/link) — shipped 2026-07-31
      (Phase 26), paragraph blocks only (the one field using `mode: 'html'`)
- [x] Structural-page text editable directly on the page canvas — shipped 2026-07-31
      (Phase 26) for the short fields (Cover/Title Page/Half Title's title-subtitle-
      author, ISBN Page, Barcode, Foreword's attribution, Appendix's heading). The
      longer multi-paragraph `text` fields (Copyright, Dedication, Foreword/Preface/
      Acknowledgements/Conclusion/Appendix/About the Author body text) are a
      deliberate exception, staying Inspector-panel-only — see docs/STATUS.md Phase 26.
- [x] ~~Inline editing for the newer content block types~~ — **correction, 2026-07-31:**
      this was already fully shipped (Modular Page System Milestone 5); all 8 newer
      block types already had working `useEditableField` wiring. The original claim
      above ("several render read-only") was wrong — caught while starting this phase.
- [x] Per-block hover toolbar: delete, duplicate, move up/down — shipped 2026-07-31
      (Phase 26), every block type. "Change type" deliberately not built — the 14
      block types' shapes are too heterogeneous for a well-defined lossless conversion.
- [x] Delete/Backspace removes the selected block (undo-safe) — shipped 2026-07-31 (Phase 26)
- [x] "+" inserter to add a new block of any type at any position — shipped 2026-07-31
      (Phase 26), 12 of 14 types (image/gallery excluded — both need a real asset
      picked first, which the inserter doesn't do yet)
- [x] Fix: brand-new empty chapters had no insert affordance at all (zero blocks meant
      `renderBlocksWithDropZones` returned nothing) — a first-time author had no way
      to write their first paragraph. Found via live UX audit, fixed with a visible
      "Start writing" prompt for the empty-chapter case. Phase 77 (2026-08-02).
- [ ] Drag-to-reorder for all blocks — deprioritised in favour of the move-up/down
      buttons above, which solve the same need with less risk (full drag-and-drop
      across `LazySpread`'s lazily-mounted spreads is a materially bigger change)
- [x] Structural-page delete discoverability — Phase 27 (2026-07-31) made the
      Sidebar's icons less easy to miss (`opacity-0` → `opacity-35`), but that
      wasn't the real gap: the user reported it again afterward. Fixed
      properly in Phase 29 (2026-07-31): `PageToolbar.tsx` puts move/
      duplicate/delete directly on the page canvas itself (same hover-reveal
      pattern as `BlockToolbar`), not just in a separate sidebar tab. Sidebar
      controls kept as a second entry point — see docs/STATUS.md Phase 29.
      Also caught and fixed a related regression in Phase 32 — hovering
      anywhere on the page revealed every block's own toolbar too, due to
      Tailwind's unnamed `group` not being scoped to the nearest ancestor.
      Both the toolbar and the fix confirmed working live by the user,
      2026-07-31.
- [x] Delete for chapter-content/-start pages (imported manuscript pages) —
      shipped 2026-07-31 (Phase 33), after the user correctly pointed out
      Phase 29 only fixed structural pages ("I can now delete pages I've
      added through structure, but not pages that have been imported").
      These pages have no single stored object to delete (they're whichever
      blocks pagination flowed onto them) — `PageToolbar` now offers a
      delete-only action for them that bulk-deletes exactly those blocks,
      undo-safe in one commit. See docs/STATUS.md Phase 33.
- [x] Delete a whole chapter (title + content) — shipped 2026-07-31 (Phase 34),
      immediate follow-up after Phase 33: "the text deletes but not the
      chapter titles." Deliberately a separate action from page-content
      delete (which never touches the title on purpose) rather than
      overloading that button with ambiguous "does this nuke the title too?"
      behaviour. Two entry points: a delete icon in the Sidebar's Chapters
      tab (next to the existing rename pencil) and a hover-reveal icon on
      the title itself on the chapter's opening page. See docs/STATUS.md
      Phase 34.
- [x] Add a new chapter — shipped 2026-07-31 (Phase 51), closing the other
      half of a user report ("there should be a way to add/remove new
      chapters" — delete already existed, add didn't). A "+" button in the
      Sidebar's Chapters tab header appends a new empty chapter after the
      current last one (or starts a brand-new manuscript from scratch if
      there are none yet) and drops straight into rename mode. See
      docs/STATUS.md Phase 51.
- [x] Reorder chapters (up/down) — shipped 2026-07-31 (Phase 52), immediate
      follow-up after add/delete shipped. Up/down chevrons on each chapter
      row in the Sidebar, mirroring the existing block-level and
      structural-page reorder buttons; undo/redo-safe. See docs/STATUS.md
      Phase 52.
- [x] Click an image-kind placeholder to upload/replace it with a real photo
      — shipped 2026-07-31 (Phase 51), plus the same upload flow added to
      the "+" block inserter's new "Image" option. See docs/STATUS.md
      Phase 51.
- [x] Paragraph text editor in the Inspector sidebar — shipped 2026-07-31
      (Phase 51): selecting a paragraph shows an always-editable box under
      the Type tab, a second entry point alongside the existing on-canvas
      double-click editing. See docs/STATUS.md Phase 51.
- [x] Manual page-break-after toggle — shipped 2026-07-31 (Phase 51): a
      per-block toolbar button forces whatever follows onto a fresh page,
      e.g. a chapter-opener that's just a title + photo with the body text
      always starting on the next page. Wired into screen pagination, PDF
      export (shared `paginate.ts` pipeline) and EPUB (CSS page-break hint).
      See docs/STATUS.md Phase 51.
- [x] Save/load a project as a portable file — shipped 2026-07-31 (Phase 51):
      "Save"/"Load" in the top toolbar (plus "Load Project" on the Projects
      page) pack manuscript + structural pages + notes + custom theme +
      every image asset into a `.bookstudio` archive and back. See
      docs/STATUS.md Phase 51.
- [x] Real thumbnail previews — shipped 2026-07-31 (Phase 30): `ThumbnailPage.tsx`
      renders a genuine, lazily-mounted, CSS-scaled miniature of the real `Page`
      component (not a text-density approximation) — true WYSIWYG, stays in
      sync with every block type/theme/structural page automatically. See
      docs/STATUS.md Phase 30 for the `decorative` prop that keeps this both
      correct (no duplicate DOM ids breaking scroll-to-block) and cheap across
      long books (lazy-mounted, same IntersectionObserver pattern as `LazySpread`).
      Shipped invisible at first — flexbox centered the pre-scale page before
      the CSS transform painted it, pushing the rendered content outside the
      clipped thumbnail. Fixed with absolute positioning and confirmed working
      live by the user, 2026-07-31; see docs/STATUS.md Phase 32.
- [x] Fix awkward heading placement from pagination — shipped 2026-07-31 (Phase 26):
      the orphan guard now reserves the *entire* following block's height, not a
      32px slice, closing the exact bug where a heading was kept on a page whose
      next block still got flushed away from it anyway
- [x] Fix paragraphs getting clipped mid-page — shipped 2026-07-31 (Phase 28):
      root cause was a font-loading race, not pagination math — `HeightMeasurer`
      measured once before self-hosted fonts' `font-display: swap` finished, so
      pagination used fallback-font metrics and the real (taller) font then
      overflowed the page's clipped container. Fixed by re-measuring once
      `document.fonts.ready` resolves. See docs/STATUS.md Phase 28 — flagged as
      needing manual cold-cache verification since it's timing-sensitive.
- [x] Fix chapter-opener pages clipping content — a second, distinct clipping
      bug reported after Phase 28 ("chapters are still getting cut off
      occasionally"), worse with longer/wrapping chapter titles. Fixed
      2026-07-31 (Phase 31): `paginate.ts` previously only reserved the
      theme's fixed `topSpacer` above a chapter's opener content, never the
      number-label + title's own rendered height, which grows with title
      length. Now measured off-screen (`HeightMeasurer.tsx`) and subtracted
      from the opener page's available space, same pattern as block
      measurement. See docs/STATUS.md Phase 31 — flagged as needing manual
      verification with a real long/wrapping chapter title.
- [x] Live word count in the Toolbar — shipped 2026-08-01 (Phase 64), after
      the user pointed out its absence alongside search/spellcheck/
      thesaurus below. `wordCount()`/`blockPlainText`-style text extraction
      already existed internally (used by `TypographyPanel.tsx` and several
      Virtual Editor checkers) but was never surfaced to the user — this is
      just finally showing it, next to the project name. Deliberately NOT
      the same thing as the still-open Phase F "word-count goals and
      writing-session tracking" item below (a session-length daily-goal
      tracker) — this is only the live running total.
- [x] Find (and find-and-replace) across the whole manuscript — shipped
      2026-08-01 (Phase 75). New Sidebar tab ("Search", alongside Chapters/
      Structure/Assets) rather than a Toolbar button or a Ctrl/Cmd+F
      shortcut — the Toolbar is already flagged as crowded
      (`docs/SUGGESTIONS.md`'s Phase 67 entry), and `useKeyboardShortcuts
      .ts`'s own doc comment states this codebase deliberately never
      intercepts Ctrl/Cmd+anything except undo/redo, so overriding the
      browser's native find wasn't on the table. `src/search
      /manuscriptSearch.ts` is the pure logic — `findMatches` reuses
      `virtualEditor/textExtract.ts`'s `extractTextSpans` directly (the
      "walk every block's text" cost this item already flagged as solved),
      plain substring matching (not word-boundary — "Find" means
      "contains," unlike the Continuity checker's whole-name matching).
      Jump-to-match reuses `selectionStore.requestScrollToBlock` exactly as-
      is — the Virtual Editor's Locate/Edit actions already solved the
      "`LazySpread` hasn't mounted a page further down the book yet"
      problem this item flagged as the main cost, so Search needed zero new
      scroll/mount machinery. Replace reuses `virtualEditor/textPatch.ts`'s
      `getRawFieldText`/`patchTextField` (the same helpers every checker's
      `suggestedFix` already uses) plus a new occurrence-index scheme
      (`SearchMatch.occurrenceIndexInField`) so a single match's Replace
      button touches only that one occurrence, not every occurrence in its
      field; both `replaceMatchWithHistory` and `replaceAllMatchesWithHistory`
      (`editorActions.ts`) apply through the existing history-aware
      `editBlock`, so every replacement is undoable exactly like any other
      content edit. No confirm dialog on Replace All — undo covers it, the
      same "no confirm needed, undo covers it" policy this codebase already
      states explicitly (`Sidebar.tsx`'s `StructuralPageRow` doc comment).
      Extended 2026-08-02 (Phase 76) to also search/replace chapter titles —
      flagged the same day in `docs/SUGGESTIONS.md`'s Phase 75 entry as the
      most likely real gap, since a chapter title isn't a `ContentBlock` and
      was invisible to `extractTextSpans`. `SearchMatch` gained a `kind:
      'block' | 'chapterTitle'` discriminant; a chapter-title match routes
      through `renameChapterWithHistory` instead of `patchTextField`+
      `editBlock`.
- [x] Real (dictionary-backed) spell-check (Phase 109, 2026-08-02) —
      unblocked once the user installed `nspell` + `dictionary-en` from
      their own terminal (this sandbox has no npm registry access, so
      neither package could be added from here). New `spellingChecker` in
      `virtualEditor/checkers/proofreading.ts`, backed by
      `spellcheckDictionary.ts`'s async-loaded, module-cached `nspell`
      instance — see that file's doc comment for how an async dictionary
      load fits a checker architecture whose `run()` is required to be
      synchronous (gated through `isApplicable`, the same pattern
      `pipeline.ts` already uses for `pages`-dependent checkers). Two
      deliberate false-positive reductions aimed specifically at this app's
      audience: words matching a Layer 0 Character/Location name are
      excluded (an invented character name isn't a typo), and all-caps
      tokens are treated as acronyms, not misspellings. **American English
      only** — `dictionary-en` doesn't contain "colour"/"realise", and this
      app's Style Guide defaults to British, so the checker only runs when
      a project's Style Guide explicitly sets `englishVariant: 'american'`;
      every other project honestly stays "Not yet analysed" for this one
      checker rather than flooding a British-default project with false
      positives. Verified end-to-end against the real bundled dictionary in
      a standalone Node script (real typos flagged with correct suggestions,
      invented names and acronyms correctly excluded) — see STATUS.md.
- [x] British-English spelling (Phase 110, 2026-08-02) — user installed
      `dictionary-en-gb`; data copied to `public/dictionaries/en-gb/`,
      `spellcheckDictionary.ts` rewritten to key its cache by
      `StyleGuide.englishVariant` (`'american'` → `en/`, `'british'` →
      `en-gb/`) instead of always loading the one American dictionary. The
      `spellingChecker`'s earlier "American-only, everyone else stays Not
      yet analysed" gate is gone — every project now gets real spell-check
      in whichever variant its own Style Guide (or the British default)
      actually uses. Verified both dictionaries independently against real
      variant-pair spellings ("colour"/"color", "realise"/"realize" each
      correct in exactly one dictionary, wrong in the other) plus a shared
      real typo caught correctly by both — see STATUS.md.
- [x] Enter starts a new paragraph (Phase 111, 2026-08-02, user: "when
      writing a paragraph and pressing enter shouldn't it by default start a
      new paragraph?") — previously every inline-editable field (paragraph
      included) treated Enter as "commit and exit editing," with no way to
      split a paragraph in place. New `splitElementAtCaret`
      (`blocks/splitAtCaret.ts`, DOM `Range`-based) + `useEditableField`'s
      new optional `onSplit` callback, wired only for the `paragraph` block
      type (headings/list items/quotes/etc. keep today's commit-and-exit
      Enter, where "split into two" doesn't make sense). Persisted via new
      `editorActions.splitParagraphWithHistory` — one `replaceChapterBlocks`
      call, one undo step, matching this codebase's "one user action, one
      undo step" rule. The new second half is auto-selected for editing with
      the caret placed at its *start* (`selectionStore.editRequestCaretPosition`),
      not its end, so typing continues naturally. Verified via `tsc`; not
      yet live-verified in Chrome (see Phase K's standing verification gap
      for why — this sandbox can't push/preview). Follow-up same day: fixed
      a reported "new block appears but needs a manual click to type" race
      — the new block's auto-focus now retries across pagination-driven
      remounts instead of consuming its one-shot edit request before focus
      actually lands (see STATUS.md).
- [x] Enter-splits-paragraph in the Inspector's sidebar paragraph editor too
      (Phase 113, 2026-08-03) — found by actually looking at the live
      deployment (screenshot), which showed the user typing in
      `TypographyPanel.tsx`'s "Type" tab paragraph box, not the on-canvas
      editor Phase 111 fixed. That box's own help text used to say "Enter
      saves" — a completely separate `useEditableField` instance that never
      got `onSplit`/`onMergeWithPrevious` wired up. Now uses the same
      `splitParagraphWithHistory`/`mergeParagraphWithPreviousHistory` the
      canvas uses. See STATUS.md for why this editor doesn't need the
      canvas's "retry until focus sticks" complexity (it isn't subject to
      the paginated layout engine's async remounts). Verified via `tsc`.
- [x] Typewriter mode (Phase 111, 2026-08-02, user: "how about adding an
      option for typewriter mode(sound)") — new `useTypewriterMode` hook,
      active only in Focus Mode's `write` view. Keeps the caret's line
      vertically centred as the user types (driven by `selectionchange` +
      the caret's `Range.getBoundingClientRect()`, scrolled via the nearest
      `overflow-y: auto/scroll` ancestor — DOM-driven rather than plumbed
      through every block type, since centring only needs "where's the
      caret" generically). Optional key-click sound is synthesised with Web
      Audio (short filtered noise burst, no external asset to license or
      fetch), with a distinct lower "thunk" for Enter. Two independent
      toggles (`uiStore.typewriterMode`/`typewriterSound`, persisted like
      `showThumbnails`) surfaced as pill buttons in `FocusModeLayout`'s
      floating toolbar, visible only in `write` mode. Verified via `tsc`;
      sound/scroll behaviour needs live-browser verification (Web Audio and
      real scroll geometry can't be meaningfully unit-tested headlessly).
- [x] Enter-to-split for list items (Phase 115, 2026-08-03) — the item this
      entry used to describe as "not yet asked about" (only `paragraph` got
      `onSplit`, so pressing Enter mid-item in a list just committed/exited,
      the same "feels broken" gap the user actually flagged for paragraphs).
      `useEditableField`'s `onSplit`/`onMergeWithPrevious` no longer require
      `mode === 'html'` — a new `splitPlainTextAtCaret` (`splitAtCaret.ts`)
      covers `mode: 'text'` fields (list items have no inline formatting to
      preserve, so `Range.toString()` is enough, no HTML round-trip needed).
      New `editorActions.splitListItemWithHistory`/
      `mergeListItemWithPreviousWithHistory` splice one list block's `items`
      array directly (no new sibling block, unlike the paragraph version —
      a list item split stays within the same `<ul>`/`<ol>`). Reliable
      auto-focus of the new/merged item needed one genuinely new piece:
      `selectionStore.editRequestItemIndex`, the item-granularity
      counterpart to `editRequestId`/`editRequestCaretPosition`, so the
      "consume on real DOM focus, not on mount" retry pattern (Phase 111's
      fix) survives a pagination-driven remount of the whole list block, not
      just local component state that a remount would silently wipe.
      Verified via `tsc`; not yet live-verified in Chrome (see Phase K's
      standing verification gap).
- [x] Live spell-check underlining (Phase 116, 2026-08-03, user: "yes it
      should have live spell check" — after clarifying that the existing
      dictionary-backed spell-check, Phase 109/110, only ever surfaced as
      Virtual Editor review findings, never as underlines while typing).
      Scope confirmed with the user: underlines only in the paragraph
      currently being edited (not every paragraph on the page at all
      times), with a "Fix spelling" suggestion dropdown when a misspelled
      word is selected. New `useLiveSpellcheck.ts` hook, wired into
      `paragraph.tsx` alongside its existing `useEditableField`; debounced
      re-scan on every `input` event walks the field's text nodes (never
      its HTML string, so `<strong>`/`<em>`/`<a>` markup survives) and wraps
      each misspelled word in a `<span class="book-spell-error">` (wavy
      underline, `--color-danger` token, `src/index.css`). Reuses the exact
      same nspell dictionary + false-positive rules
      (`virtualEditor/spellcheckWords.ts`, extracted from
      `checkers/proofreading.ts` so both surfaces can never drift apart) as
      the Virtual Editor's `spellingChecker` — a word that's fine there is
      fine here. Caret position is saved/restored across each re-wrap
      (`blocks/caretOffset.ts`) so typing through a misspelled word never
      visibly kicks the cursor — the same class of race this session
      already hit twice with focus (Phase 111/115). `FloatingFormatToolbar`
      gained a "Fix spelling" button (shown only when the selected single
      word is actually misspelled) offering `nspell.suggest()` corrections,
      applied via the same `execCommand('insertText', ...)` pattern as
      Synonyms. Verified via `tsc`; not yet live-verified in Chrome (see
      Phase K's standing verification gap) — flagged as the one item this
      phase most needs real browser testing for, since caret-preservation
      during live DOM mutation is exactly the kind of thing that looks
      right in code review and wrong on a real keyboard.
- [x] Fix: live spell-check showed the browser's own native squiggles with
      no way to correct them (Phase 117, 2026-08-03, user: "its showing red
      lines under every word, and no way to correct. check in google
      chrome" — a real, live-Chrome-caught bug on the deployed build, not a
      report about test/gibberish content). Live-tested in Chrome and found
      the actual cause: selecting a paragraph (including via the on-canvas
      double-click meant to start editing *there*) always mounts
      `TypographyPanel.tsx`'s sidebar `ParagraphTextEditor` fresh, whose own
      mount effect immediately calls `startEditing()` — in practice this
      usually wins real DOM focus over the on-canvas field's own
      `startEditing()` call. Since Phase 116's live spell-check was only
      wired into the on-canvas field, a user typing in the sidebar box (most
      of the time, without realising it) saw only the *browser's own*
      native spellchecker underlining everything it didn't recognise, with
      none of the new "Fix spelling" UI. Fixed by giving both editing
      surfaces the identical behaviour instead of trying to win the focus
      race: `useLiveSpellcheck` and `FloatingFormatToolbar` (Synonyms + Fix
      spelling) are now wired into `ParagraphTextEditor` too, and both
      contentEditable fields get `spellCheck={false}` so the browser's own
      spellchecker can never show a second, disconnected set of squiggles
      alongside the real one again. Verified via `tsc`; the underlying
      focus race itself is left as-is (Phase 51 designed the sidebar box to
      always grab focus on selection, on purpose) since both surfaces now
      behave identically regardless of which one wins.
- [x] Fix: Enter-split left neither editing surface focused (Phase 118,
      2026-08-03, user: "When I double click it just shows red squiggles
      again on all words. I also have to double click to start typing. If
      at the end of a paragraph the user hits enter shouldn't it start a new
      paragraph and immediately let them type without having to click
      again?"). Live-Chrome-diagnosed a second, distinct focus-race bug that
      survived Phase 117's fix: after a split, `document.activeElement` fell
      all the way back to `<body>` with zero `contenteditable="true"`
      elements anywhere on the page — neither the on-canvas field nor the
      sidebar box ended up focused. Root cause: `TypographyPanel.tsx`'s
      `ParagraphTextEditor` mount effect always calls `startEditing()`
      unconditionally, but never told `selectionStore` its focus had landed
      — so `editRequestId` stayed live indefinitely after a split.
      `paragraph.tsx`'s on-canvas field keeps retrying `startEditing()` on
      every pagination-driven remount of the freshly-split paragraph *as
      long as `editRequestId` is still set* (its own documented "retry until
      focus genuinely sticks" behaviour, Phase 111). With nothing ever
      clearing that flag from the sidebar's side, the on-canvas field could
      win a later remount, steal focus back from the sidebar, consume the
      request on that transient (soon to be superseded) focus, and then lose
      focus itself on the *next* remount with no live request left to retry
      against — leaving nobody focused. Fix: the sidebar's contentEditable
      div now calls `consumeEditRequest()` `onFocus` too. Since that box
      isn't subject to the layout engine's async remounts, its focus is the
      one genuinely stable point in the whole race — clearing the flag there
      stops the on-canvas field from ever trying to reclaim it on a later
      remount. Verified via `tsc`; diagnosed live in Chrome (confirmed the
      exact before/after DOM state via `document.activeElement`/
      `contenteditable` inspection) but the fix itself needs a fresh deploy
      + live re-test to confirm it resolves the reported symptom end-to-end.
- [x] Fix: nspell dictionary silently parsed as garbage, flagging every word
      (Phase 119, 2026-08-03, user: "ALL words, even words typed like hello
      have red lines underneath" / "no way to even change the misspelt
      words automatically" — reported after Phase 118 was live). Live-tested
      by replacing test content with real English ("hello world") and
      checking both the live underline hook *and* the Virtual Editor's own
      `spellingChecker` (same shared dictionary) — both flagged "hello" and
      "world" as unrecognised, proving the earlier "2 words flagged"
      readings on gibberish content (Phase 116/117) were never actually
      evidence the checker worked; gibberish gets flagged whether the
      checker is correct *or* completely broken, so this bug had been
      latent and unverified since Phase 109. Root cause, found by reading
      `nspell`'s own source: its dictionary/affix parsers call
      `buf.toString('utf8')`, which only decodes real text for a Node
      `Buffer` — a plain browser `Uint8Array` ignores the encoding argument
      and falls back to `Array.prototype.toString`, producing a
      comma-joined list of byte numbers instead of the actual word list.
      `spellcheckDictionary.ts` was passing `new Uint8Array(arrayBuffer)`
      straight to `nspell(...)`, so every affix rule and every dictionary
      word was being parsed from that garbage, leaving the speller with
      effectively nothing in it — `.correct()` returned `false` for every
      word, real or not, which is also why "Fix spelling" had no usable
      suggestions to offer. Fix: decode both fetched buffers with
      `TextDecoder('utf-8')` into real strings before handing them to
      `nspell` — a plain string's own `.toString()` ignores the encoding
      argument too, but harmlessly, since it just returns itself unchanged.
      Verified via `tsc`; root-caused live in Chrome by cross-checking two
      independent surfaces that share the same dictionary and reading
      nspell's actual source rather than assuming — needs a fresh deploy +
      live re-test (type a real sentence, confirm no false-positive
      underlines, confirm "Fix spelling" offers real suggestions for an
      actual typo).
- [x] Fix: tab froze when selecting a misspelled word to fix it (Phase 120,
      2026-08-03, user: "still no way to change the incorrect spellings" —
      reported right after confirming Phase 119's dictionary fix worked).
      Live-tested: double-clicking a misspelled word (the normal way to
      select it and reveal the "Fix spelling" button) hung the tab —
      screenshot and JS-evaluation calls both timed out. Root cause:
      `FloatingFormatToolbar`'s `spellingSuggestions`/`synonyms` were
      computed unconditionally on *every render* the instant a
      misspelled/single word was selected — including every intermediate
      `selectionchange` a click or drag fires — not memoised, and not
      gated on the suggestion dropdown actually being open.
      `speller.suggest()` is an edit-distance search over the whole
      dictionary, not a cheap lookup; this was invisible while Phase 119's
      bug meant the dictionary was effectively empty (nothing to search),
      but now that it's a real, full-size dictionary, repeatedly re-running
      that search synchronously on the main thread on every render was
      genuinely capable of hanging the tab. Fix: wrapped both in `useMemo`
      and gated them on `spellingOpen`/`synonymsOpen` — the expensive call
      now only runs once, when the user actually clicks the button to see
      suggestions, not speculatively on every selection change beforehand.
      May also be a contributing factor to the still-open Enter-split
      freeze below (not confirmed as the same root cause, but the same
      class of "expensive synchronous work on every render" problem).
      Verified via `tsc`; root-caused by reproducing the freeze live and
      reasoning through `FloatingFormatToolbar`'s render path — needs a
      fresh deploy + live re-test (select a misspelled word, confirm no
      hang, click "Fix spelling", confirm real suggestions appear and
      applying one works).
- [x] Fix: clicking a word to fix its spelling crashed to a blank page
      (Phase 121, 2026-08-03, user: "when I click on a word to try and
      change it it ends up going to a blank unrendered page. there is no
      dropdown" — reported immediately after Phase 120 deployed). Own
      regression: Phase 120 converted `spellingSuggestions`/`synonyms` into
      `useMemo` calls but left them positioned *after* this component's
      `if (!rect) return null` early return. That's a Rules-of-Hooks
      violation — React calls zero hooks here while nothing is selected and
      two extra hooks the instant a selection appears, which throws
      "Rendered more hooks than during the previous render" and crashes the
      whole render tree the moment a click creates a selection — exactly a
      "blank page on click." Fix: moved both `useMemo` calls (and the
      `isSingleWord`/`speller`/`ignoreWords`/`isMisspelled` consts they
      depend on) above the early return, so every hook in this component
      runs unconditionally on every render like the rules require; their
      own internal conditions (`spellingOpen`/`synonymsOpen`/etc.) already
      handle "nothing to compute yet" correctly, so no behaviour changes
      besides no longer crashing. Verified via `tsc`; root-caused by
      reading the component's own hook-call order against React's rules
      rather than guessing — needs a fresh deploy + live re-test (click a
      misspelled word, confirm the toolbar renders with no crash, confirm
      "Fix spelling" opens a real dropdown).
- [x] Fix three real spelling-fix UX gaps + a persistent sidebar spelling
      list (Phase 122, 2026-08-03, user: "the green plus symbol covers
      spellings and synonyms so user cant click them. Also doesn't work if
      you double click the word to highlight it, only if user drags. There
      should also be a fix spelling button in the right sidebar below the
      paragraph text"). Three distinct fixes, all in the same batch:
      (1) The gap's "+" insert-block button (`InsertBlockButton.tsx`) sits
      directly above a block and can occupy the exact same screen position
      `FloatingFormatToolbar` renders its buttons — `opacity-0` only hides
      it *visually*, an invisible element still receives pointer events by
      default, so clicks aimed at the toolbar underneath were landing on
      this hidden button instead. Fixed with `pointer-events-none`
      (re-enabled on hover/open), so it's truly inert while invisible.
      (2) `paragraph.tsx`'s on-canvas `onDoubleClick` called
      `primary.startEditing()` unconditionally, including on a double-click
      that happens *while already editing* — `startEditing()`'s own layout
      effect reassigns `innerHTML` and force-places the caret every time,
      silently destroying the native "double-click selects the word"
      selection the browser had just made a moment earlier. A manual
      click-drag selection never had this problem since dragging never
      fires `dblclick`. Fixed by gating on `!primary.isEditing`, so this
      only fires once, on the transition into edit mode, exactly like the
      analogous `onClick`s elsewhere in this codebase already do.
      (3) Added a persistent, always-visible "Spelling" chip row below
      `TypographyPanel.tsx`'s sidebar paragraph box, one chip per distinct
      misspelled word currently in the paragraph (via a `MutationObserver`
      reading the same `.book-spell-error` spans `useLiveSpellcheck`
      already maintains — no second word-scanning implementation), each
      opening the same `WordSuggestionsDropdown` (now exported from
      `FloatingFormatToolbar.tsx`) with the same click-gated, memoised
      `speller.suggest()` call Phase 120 already established — no
      selection required at all, closing the gap that made (1) and (2)
      necessary to interact with in the first place. Verified via `tsc`;
      not yet live-verified in Chrome — this session's own Chrome tooling
      became unreliable while investigating this report (repeated tab
      freezes/timeouts on plain clicks and scrolls, unrelated to any of
      today's source changes, likely environmental) — needs a fresh
      deploy + live re-test once that settles: click a misspelled word
      directly (should render, not crash, thanks to Phase 121), double-
      click a word while already editing to confirm it now stays selected,
      confirm the "+" button no longer blocks toolbar clicks, and confirm
      the new sidebar spelling chips appear and apply corrections.
- [x] Enter-split focus bug — FIXED 2026-09-04 (Phase 139), after Phase 118's
      partial fix. Three causes, not one: random `page.id` per pagination run
      remounted the whole page DOM; the Inspector's Typography box stole the
      caret on every selection change; and mobile never wired `onSplit`.
      Original note kept below for the record.
- [x] (superseded) Enter-split focus bug persisted after Phase 118's fix — needs deeper
      investigation (found 2026-08-03, still open). Live-re-testing the
      exact same Enter-at-end-of-paragraph flow against the Phase 118
      bundle (confirmed genuinely deployed via bundle marker check) showed
      the identical symptom: `document.activeElement` fell back to `<body>`
      with zero `contenteditable="true"` elements after the split. Phase
      118's diagnosis (on-canvas field winning a later remount after the
      sidebar's focus had already been consumed) does not fully explain
      this, since the sidebar's own `onFocus` fix should have prevented
      exactly that. While re-testing a second time, the tab became
      genuinely unresponsive — screenshot and JS-evaluation calls both
      timed out (one JS call hung the full 45s) — suggesting something
      more serious than a one-shot focus race: possibly a non-converging
      remount/remeasure loop triggered by the interaction between the
      pagination engine and the new (empty) split paragraph, or an
      interaction with `useLiveSpellcheck`'s rescan cycle. On a fresh page
      load afterward, the split itself hadn't even persisted (the paragraph
      was back to its single, pre-split state), suggesting the freeze
      happened before autosave completed. This needs dedicated, careful
      investigation — instrumenting the actual render/effect sequence
      (temporary logging shipped in a build, read back live) rather than
      another guess from source reading alone, since two attempts
      (Phase 111's original fix, Phase 118) have each addressed a real but
      incomplete piece of this without resolving the user-visible symptom.
- [x] Backspace-at-start-of-paragraph-merges-with-previous-paragraph (Phase
      112, 2026-08-03) — the natural companion to Enter-splits-paragraph:
      pressing Backspace with the caret at the very start of a paragraph
      (and the immediately preceding sibling block is also a paragraph)
      merges its content into the previous paragraph, deletes this block,
      and places the caret exactly at the old seam — one undo step. Only
      paragraph-into-paragraph, mirroring `onSplit`'s scope (merging text
      into a heading/list item isn't well-defined the same way). No new
      dependency. Verified via `tsc`; not yet live-verified in Chrome (see
      STATUS.md).

## Phase C — Editorial Intelligence (Virtual Editor) — In Progress

- [x] Checker framework (pure `Checker` interface, pipeline, scoring) + dashboard UI
- [x] Proofreading checker (double spaces, repeated words, quotes/brackets, punctuation)
- [x] Grammar / copy-editing checker (heading capitalisation)
- [x] Consistency + Readability checkers
- [x] Publishing Standards + Layout checkers (sparse pages, empty chapters, image balance)
- [x] Style Guide settings UI (englishVariant/oxfordComma/measurementUnits/dateFormat fields)
- [x] Non-destructive fixes: Accept/Reject/Ignore, revision log, restore original
- [x] Style Guide values actually *enforced* by a checker — see STATUS.md Phase 35
- [x] Typography checker — see STATUS.md Phase 36
- [x] Accessibility checker — see STATUS.md Phase 36
- [x] Print Readiness checker — see STATUS.md Phase 36
- [x] Commercial Quality checker — see STATUS.md Phase 36
- [x] Developmental checker — see STATUS.md Phase 36
- [x] Field-guide checker — see STATUS.md Phase 36
- [ ] Real `AiReviewer` (LLM-backed judgement calls, currently a null stub) —
      deliberately deferred, see docs/STATUS.md Phase 37's note
- [ ] AI Learning — a personal editorial profile that adapts to accepted/rejected fixes —
      deliberately deferred alongside the above (depends on it)
- [x] Original / RevA / RevB / RevC side-by-side revision compare view —
      see STATUS.md Phase 38
- [x] Persist revision log across a reload — see STATUS.md Phase 37. Reports/
      finding-statuses deliberately stay in-memory-only, not a partial miss —
      see Phase 37's entry for why persisting them would be meaningless

## Phase D — Publishing Output Expansion

- [x] EPUB manuscript import — shipped 2026-09-03 (Phase 124): Book Studio could
      already export EPUB but not read one, so a book couldn't be reopened from
      its own output. `src/parser/epub.ts` reuses `epub/zipReader.ts` (a generic
      ZIP reader) and `parser/html.ts`'s `parseHtmlDocument`, adding no new
      dependency; images are extracted into the asset library like the DOCX
      importer does. Verified against a real 268KB Project Gutenberg EPUB
- [ ] EPUB import: preserve verse as a distinct block type — verse lines are
      currently imported as one paragraph each, which keeps the line structure
      but loses the semantic distinction (the Content layer has no verse block)
- [ ] EPUB import: reattach footnotes to the document that references them —
      some EPUB toolchains gather a book's footnotes at the end of a later
      file, so they currently import as trailing text on the wrong chapter
- [ ] PDF manuscript import — deliberately not attempted: PDFs carry no
      reliable structure, so chapter detection is guesswork

- [x] EPUB export — see STATUS.md Phase 40
- Kindle / MOBI export — **decided 2026-08-01: not building.** Confirmed with
      the user: Amazon's KDP pipeline now primarily ingests EPUB and converts
      it internally, so a separate legacy MOBI writer isn't worth the effort.
      Removed from Phase D's scope rather than left as an open checkbox.
- [x] HTML / web-book export — see STATUS.md Phase 42
- [x] ISBN + barcode field and placement — already shipped as dedicated
      `isbn-page`/`barcode` structural page types (Phase 21) with real PDF
      rendering, and now also EPUB export (Phase 40, ISBN as text — a
      scannable barcode has no meaning in reflowable ebook text). The
      barcode's bars are still an honest, documented non-scannable visual
      placeholder (Phase 21) — a real EAN-13 symbology renderer remains a
      distinct, larger future task
- [x] Print-on-demand validation profiles (Amazon KDP, IngramSpark spec
      checks) — see STATUS.md Phase 41: a pre-export warning dialog reusing
      the Print Readiness/Commercial Quality checkers (Phase 36), not a new
      rule set
- [x] True justified text in PDF export — see STATUS.md Phase 39
- [x] Per-image rotation in PDF export — see STATUS.md Phase 39
- [x] Italic and hyperlink styling distinguished in exported PDF — see
      STATUS.md Phase 39 (italic via a standard-font fallback since no
      italic .woff2 exists and this sandbox has no network access to fetch
      one; hyperlinks get underline+accent colour, deliberately not a
      clickable annotation — see Phase 39's reasoning)
- [x] Table cell text wrapping in PDF export — see STATUS.md Phase 39
- [ ] Real font subsetting — **re-diagnosed, Phase 109 (2026-08-02): the
      earlier note above was wrong.** `@pdf-lib/fontkit` has been a real
      dependency of this app since Phase 7 (needed for any custom-font
      embedding at all, not just subsetting) and pdf-lib's `embedFont`
      already accepts `{ subset: true }` — no new package needed, nothing
      was ever actually blocked by npm access. The real blocker is
      different and worse: `@pdf-lib/fontkit`'s subsetting encoder has a
      genuine, longstanding, documented reliability bug (multiple open
      GitHub issues — malformed/unsorted font `loca`-table offsets,
      content-dependent crashes). Reproduced here directly: the exact same
      font + text, subsetted repeatedly in a standalone script, sometimes
      succeeded instantly, sometimes threw "Index out of range" mid-encode,
      and sometimes hung indefinitely — real non-determinism, not a
      one-off. A PDF export that randomly fails or freezes is a far worse
      regression than a somewhat larger embedded font file, so `subset:
      true` was tried in `src/pdf/fonts.ts`'s `embed()` and then explicitly
      reverted rather than shipped — see that function's own comment and
      STATUS.md's Phase 109 entry for the full reproduction. Revisit only
      alongside a fixed `@pdf-lib/fontkit` release or a different
      subsetting approach, not by re-flipping this flag.
- [x] CMYK-aware export workflow for commercial print — shipped 2026-08-02
      (Phase 100+1): `ProjectSettings.colorProfile` ('rgb' default | 'cmyk'),
      naive RGB→CMYK conversion via pdf-lib's built-in `cmyk()` (no new
      dependency), threaded through every `drawPdf` call site via
      `DrawCtx.colorMode`, toggle in Project Settings. Embedded photos stay
      RGB regardless — see STATUS.md for the full scope writeup

## Phase E — Design & Templates (the "Canva" layer)

- [x] Back Cover page type — shipped 2026-07-31 (Phase 27): back-cover copy +
      optional short author bio over a full-bleed image-or-tinted background,
      mirroring the front Cover's treatment
- [x] Structural-page image picker — shipped 2026-07-31 (Phase 27): drag an
      asset from the Sidebar onto Cover/Back Cover/About the Author to set or
      replace its image (previously there was no way to set these at all,
      despite the field existing). Still missing: an explicit "remove image"
      action (only replace-by-dragging-another works)
- [x] Template/theme gallery with visual preview before applying — shipped
      2026-07-31 (Phase 43): `ThemeGallery.tsx` real resolved-theme mockups
- [x] More built-in themes beyond the current 5 — shipped 2026-07-31 (Phase
      43): added Modern Minimalist + Academic Journal (7 built-ins total)
- [x] Custom theme editor — user-defined colours/fonts saved as a new theme —
      shipped 2026-07-31 (Phase 44): `CustomThemeEditorDialog.tsx` +
      `customThemeStore.ts`. Margins deliberately excluded — margins are
      Project settings (Layer 1), already customisable per-project regardless
      of theme
- [x] Dedicated cover/back-cover designer — shipped 2026-07-31 (Phase 45):
      3 layout presets (Top/Centered/Bottom) + a draggable fine-tune handle
      for vertical position, plus a live spine-width calculator from real
      page count + trim + paper stock. Scoped deliberately smaller than a
      full multi-element x/y canvas or true wraparound-cover file
      generation — see Phase 45's STATUS entry for the reasoning; Cover and
      Back Cover remain two independent pages, not one spread
- [x] Cover/Back Cover: click-to-upload image, focal-point + zoom cropping,
      adjustable overlay (flat tint or a fade-only-behind-the-text
      gradient), decoupled font/weight/italic/size for the cover text
      (independent of the book's interior theme), and a toggleable
      safe-text-zone guide — shipped 2026-07-31 (Phase 46). Also fixed a
      real EPUB bug: the exported cover image was never flagged with
      EPUB3's `cover-image` manifest property, so e-readers/library grids
      likely never showed the real artwork as the book's thumbnail
- [x] `public/fonts/custom/` — a folder + README for dropping in more font
      files later (this sandbox has no network access to fetch new fonts
      itself); only Inter/Source Serif 4 are embedded today
- [x] Cover/Back Cover: per-field text visibility (hide title/subtitle/
      author or blurb/author-bio for a photo-only cover, without deleting
      the text) + a title/blurb colour and a secondary subtitle/author/bio
      colour override — shipped 2026-07-31 (Phase 49), prompted by real
      published-cover examples the user shared. Also fixed two related
      export bugs: the PDF previously printed a literal "Untitled"/blurb
      placeholder string when those fields were left empty, which a
      genuinely photo-only cover would otherwise have shipped with
- [x] Free-form drag-and-drop cover elements (Canva-style rectangles/
      ellipses/lines/text boxes) — Milestone 1 shipped 2026-08-01 (Phase
      54): `CoverPage`/`BackCoverPage` gained an additive `elements` array,
      drag-to-move + corner-drag-to-resize on canvas, an Inspector property
      panel, and matching PDF export. See `docs/COVER_CANVAS_PLAN.md`.
      Deliberately deferred out of Milestone 1 (tracked below): rotation,
      icons/badges, secondary images, smart alignment/snap guides,
      grouping, on-canvas double-click text editing, and the wrap-aware
      front+spine+back view.
- [x] Cover elements: icons/badges — Milestone 2 shipped 2026-08-01 (Phase
      55): a 14-icon curated set (star, award, crown, leaf, feather, open
      book, shield, sparkles, quote, heart, medal, trophy, verified badge,
      gem) plus a circle/ribbon text badge (e.g. "Bestseller", "2nd
      Edition"). See docs/STATUS.md Phase 55 — also documents a real
      stroke-width double-scaling bug caught by rendering and visually
      inspecting a test PDF before shipping.
- [x] Cover elements: rotation — shipped 2026-08-01 (Phase 62): `rotation?`
      on `BaseCoverElement`, a drag-to-rotate handle above the selected
      element (Shift snaps to 15°) in `coverElementLayer.tsx`, and matching
      PDF export via a `translate→rotate→translate` graphics-state wrap
      around the whole per-element draw dispatch in `coverElements.ts` —
      verified with rasterized test PDFs (bounding-box swap, asymmetric-
      marker rotation-direction, and a rect+image-clip integration test)
      before shipping, per the item's own "not without a rotate handle in
      the same milestone" note above
- [x] Cover elements: secondary images (author photo, publisher/series
      logo) as their own element kind — shipped 2026-08-01 (Phase 59), reusing
      `coverImageFit.ts`'s cover-fit math scoped to the element's own box, with
      a real pdf-lib clip so an oversized cover-fit image can't overflow its
      box. Focal point + zoom followed 2026-08-01 (Phase 60) — X/Y + zoom
      sliders in the Inspector, deliberately not an on-canvas click-to-set
      picker (would conflict with the element's own drag-to-move gesture)
- [x] Cover elements: smart alignment/snap guides — snap-to-page-centre
      (both axes, with a guide line) shipped 2026-08-01 (Phase 57).
      Snap-to-other-elements' edges/centres and the safe-zone inset shipped
      2026-08-01 (Phase 62), reusing the same guide-line rendering. Grouping
      remains open — deliberately not attempted in the same pass
- [x] Cover elements: fix the element-drag/image-focal-point pointer
      conflict — fixed 2026-08-01 (Phase 57), see docs/STATUS.md. Phase 58
      shipped a lighter-weight middle ground first (2D drag for
      title/subtitle/author as one group via `CoverNudgeHandle`); Phase 59
      then went further, per explicit user request, and gave title/subtitle/
      author each independent free-drag positioning (`CoverFieldPosition` +
      `DraggableCoverField`) — Front Cover only, Back Cover's blurb/author-bio
      deliberately left as flowing blocks (open decision below)
- [x] Cover elements: duplicate button, arrow-key nudge, align-to-page
      buttons (left/centre/right, top/middle/bottom) — shipped 2026-08-01
      (Phase 58), user-requested canvas conveniences alongside the 2D-drag
      item above
- [x] Fix "Drop a cover image here" / drag-to-reposition being unreachable,
      and "Add cover image"/"Add element" buttons being unclickable once an
      element sat on top — both shipped 2026-08-01 (Phase 59); root cause was
      pointer-events/z-index conflicts, see docs/STATUS.md
- [x] Cover elements: on-canvas double-click text editing — shipped
      2026-08-01 (Phase 62) for text/badge elements, via an `EditingTextField`
      overlay with Enter-to-commit/Escape-to-cancel (a `cancelledRef` guard
      prevents the unmount-triggered blur from re-committing after Escape).
      Fixed a pre-existing bug found along the way: every plain click on an
      element was writing a spurious no-op "move" entry to undo history
- [x] Cover elements: Delete/Backspace keyboard shortcut for the selected
      element — shipped 2026-08-01 (Phase 60), same keydown handler as
      arrow-nudge, same input/textarea/contenteditable guard
- [x] Cover elements: "remove image" action on image elements (revert to the
      empty placeholder) — shipped 2026-08-01 (Phase 60)
- [x] Cover elements: opacity control — shipped 2026-08-01 (Phase 60) as a
      single `opacity` field on `BaseCoverElement`, applying uniformly to
      every kind (composes with rect/ellipse's existing fill-only
      `fillOpacity` rather than replacing it)
- [x] Cover elements: focal point + zoom for secondary image elements —
      shipped 2026-08-01 (Phase 60), see the secondary-images item above
- [x] Cover elements: layers list/panel for selecting elements buried under
      others, plus incremental (one-step) forward/backward z-order nudges —
      shipped 2026-08-01 (Phase 61). Multi-select/grouping remains open —
      deliberately not attempted in the same pass, see docs/STATUS.md
- [x] Cover elements: per-element accessibility/contrast checking — shipped
      2026-08-01 (Phase 62): a new `accessibility.cover-element-contrast`
      checker does real WCAG 1.4.3 contrast-ratio math (relative luminance,
      no third-party library) for Cover/Back Cover's `text`/`badge`
      elements against a computable background (a solid shape/badge
      beneath it, or the page's own flat tint when no image is set),
      flagging failures at `major` and reporting text-over-a-photo or a
      translucent element as unverifiable at low confidence rather than
      guessing — see `src/virtualEditor/checkers/accessibility.ts`. Title/
      subtitle/author/blurb/author-bio's own automatic-colour-fallback rule
      is a separate follow-up, not covered by this pass
- [x] Back Cover: decided — free-positioning parity shipped 2026-08-01
      (Phase 62): `blurbPosition`/`authorBioPosition` on `BackCoverPage
      .content`, wired through `DraggableCoverField`/`ResetFieldPositionButton`
      on screen and a `fieldPdfXY`-equivalent anchor in `drawBackCoverPdf`,
      closing the asymmetry noted above
- [x] Wrap-aware front+spine+back cover view — shipped 2026-08-01 (Phase 62):
      a "Preview cover wrap" dialog (`WrapCoverPreviewButton`) in the Cover/
      Back Cover Inspector panel renders Back Cover, a spine strip sized
      from `cover/spineWidth.ts`'s live page-count calculation, and Cover
      side by side (scaled down, read-only) — reuses `coverPageType.Render`/
      `backCoverPageType.Render` directly rather than merging any data
- [x] More cover font families beyond Inter/Source Serif 4 — shipped
      2026-07-31 (Phase 50): the user downloaded and dropped in 7 Google
      Fonts families (Anton, Bebas Neue, Oswald, Playfair Display, DM
      Serif Display, Abril Fatface, Fraunces); wired into `CoverFontChoice`,
      `src/index.css`, `pdf/fonts.ts`, and the Inspector's font picker —
      cover-only, deliberately not offered for the book's interior theme
      (most are display faces unsuited to running body text). `pdf/fonts.ts`
      was refactored from two hardcoded families to a generic per-family
      `FontWeightSet` + cascading weight/italic fallback so future families
      are a ~15-minute addition, not a rewrite
- [ ] Stock image / illustration library integration — deferred: needs a
      real third-party stock-photo API + licensing/attribution handling this
      client-only architecture doesn't have yet
- [ ] AI image generation for covers and illustrations — deferred: needs a
      real image-generation API (and a decision on hosted-backend vs.
      bring-your-own-key, same open question already deferred for
      `AiReviewer` in Phase C)
- [x] Book templates — save a project's page setup, theme and full structural-page
      set as a reusable series template, and start a new project from it — shipped
      2026-09-03 (Phase 123): `types/bookTemplate.ts`, `store/templateStore.ts`
      (global, mirroring `customThemeStore`), `templates/buildTemplate.ts` +
      `applyTemplate.ts`, `SaveAsTemplateDialog.tsx`, a "Save as template" Toolbar
      action and a "Start from a template" picker in `NewProjectDialog`. A
      keep-text/clear-text toggle at save time decides whether imprint boilerplate
      travels with the template. Never carries the manuscript.
- [ ] Book templates: carry image assets (publisher mark, series device) with a
      template — deferred: template image references are stripped today because
      assets are per-project IndexedDB blobs, so an id captured in one project
      resolves to nothing in another. Needs template-scoped asset storage
- [ ] Book templates: manage saved templates (rename/delete) from a gallery — today
      they can only be created and picked, not curated
- [ ] Community/shareable template gallery — deferred: needs a real backend
      service to host/browse shared templates, which this client-only app
      doesn't have

## Phase F — Planning & Writing Tools

- [ ] **Open strategic question, not yet decided — read before picking up more
      Planning-mode work.** `docs/PLANNING_EXPERIENCE_REDESIGN.md` (2026-08-02) is a
      first-principles product design review, requested by the user, that argues
      Planning's current database-first shape (eight structured entity categories
      presented up front) may be the wrong foundation entirely — not a UX polish
      problem but an information-architecture one. Proposes inverting it: capture
      ideas with zero structure first, let Characters/Locations/etc. emerge from
      what's written (with the software noticing recurring names, the same
      mention-detection idiom the continuity checker already uses) rather than
      handing a first-time author a blank database on day one. No code was written
      for this and nothing below should be read as superseded until the user decides
      which direction to take — small UX fixes (Phase 77/78) are still real
      improvements to the current shape either way, but the bigger open items further
      down this phase (insert-AI-drafted-prose, category-aware sidebar) may want to
      wait on this decision rather than build further into the current model.
- [x] **Idea System / Develop Milestone 1** — shipped 2026-08-02 (Phase 82), per
      `docs/IDEA_SYSTEM_PLAN.md` (2026-08-02, revised same day — see its own
      Revisions section), the concrete, buildable first slice of the redesign
      above: a new `Idea` capture type + store, a small persistent capture
      affordance in Write (not a rail, not an always-visible wall), and Planning mode
      renamed **Develop** (display label only — see Phase 82's STATUS.md entry for
      why the internal `appMode` value stays `'planning'`) with Ideas as its own
      landing view rather than eight equal categories. Corrects the redesign
      conversation's own earlier overreach: Book Studio stays a two-area product (the
      existing unified write/design/publish editor, plus one optional Develop
      workspace), not four separate top-level destinations. Everything bigger
      (Board/Canvas views, automatic recurrence-based promotion suggestions,
      drag-to-associate) is explicitly deferred past this milestone, per the spec's
      own Deferred section — the agreed plan is to put this minimal slice in front of
      a couple of real first-time authors and let that reaction decide what (if
      anything) gets built next. Purely additive; every existing Layer 0 UI kept
      working unchanged throughout — confirmed by re-reading `EntityListPanel.tsx`'s
      only change (a shared field-rendering component, no behaviour change).
- [x] **Idea System / Develop Milestone 1.1** — shipped 2026-08-02 (Phase 83),
      user design-review pass on the live Milestone 1 build (screenshot-driven —
      Generate Prompt/Paste Response read as clutter, Timeline/Outline Templates
      didn't generalise to non-fiction, ideas had no visible link to the paragraph
      they came from). Added: (1) `Project.bookForm` (`'fiction' | 'nonfiction' |
      undefined` — a real third "not sure yet" state, never a forced choice),
      chosen via a required-but-skippable three-card picker in New Project and
      changeable later from Project Settings; (2) `getLayer0KindLabel`, the one
      read site every Develop label goes through — relabels Characters→People,
      Locations→Places, Timeline→Chronology for non-fiction projects, same
      underlying `Layer0Bible` collections; (3) `Idea.linkedBlockId` +
      `IdeaIndicatorBadge` (mirrors `Note.blockId`/`NoteIndicatorBadge` exactly) —
      a quiet margin badge on any block with a linked idea, expanding inline
      in Write mode instead of jumping to Develop; (4) `OutlineTemplate.form` +
      `getOutlineTemplatesForForm` — Outline Templates now filters to the
      project's `bookForm` (two new non-fiction templates added: Step-by-Step
      Guide, Chronological Account — Problem→Solution already existed but was
      shown alongside Hero's Journey/Save the Cat regardless of form); (5)
      `TimelineEvent.linkedChapterId` + a chapter-`Select` on each Timeline/
      Chronology row in `EntityListPanel.tsx` — an Outline Template beat can now
      point at a real chapter instead of floating unconnected next to the
      manuscript. Idea capture button position and the Generate Prompt/Paste
      Response nav rows were deliberately left unchanged this pass — user
      explicitly asked to keep the capture button where it is, and the
      Tools-section nav cleanup discussed in review wasn't part of the agreed
      build list. A full book-wide "mind map" (ideas *and* every Layer 0 entity
      *and* chapters, icon-coded, as one connected graph) was discussed and
      judged genuinely worthwhile, sequenced as its own follow-up: it needs
      chapter-association fields on entities beyond Timeline Events (characters/
      locations currently have none) before the graph could be accurate, not
      just a rendering change.
- [x] **Idea System live-verify fixes** — shipped 2026-08-02 (Phase 84), after the
      user pushed Milestone 1.1 live and clicked through it in Chrome. Fixed:
      `IdeaIndicatorBadge` rendering exactly on top of `BlockToolbar`'s delete
      button (both at `-top-3 right-2`); Timeline/Chronology event descriptions
      never displaying (`layer0FormConfig.ts`'s `secondaryKey` pointed at `when`,
      which templates never set, instead of `description`, which they always
      do); Outline Templates having no way to see or remove already-applied
      beats (new `TimelineEvent.sourceTemplateId` + an "Already added" list with
      remove under each template card). Also added: linked Ideas now surface in
      the Inspector's Notes tab too (`NotesPanel.tsx`'s `IdeasLinkedHere`),
      folded into the existing tab rather than a sixth one, to avoid repeating
      the tab-row overflow this Inspector has already needed fixing once.
- [x] Live first-time-author UX audit of Planning mode's full fiction and
      non-fiction workflows, in Chrome against the deployed build — 2026-08-02
      (Phase 77/78). Full findings, prioritised, in
      `docs/PLANNING_MODE_UX_AUDIT.md`. Found and fixed one severe bug (empty
      chapters had no way to add a first block) and two real UX bugs (pre-filled
      example text not selecting on focus; paste-back mention detection missing
      first-name-only mentions); confirmed one already-known gap (no assisted
      manuscript-insertion flow) as the actual highest-priority item, not just a
      theoretical one.
- [x] Editorial notes — select any paragraph/block or structural page and
      leave a note in the Inspector's "Notes" tab; shipped 2026-07-31
      (Phase 47). A small badge on the block/page shows while it has
      unresolved notes. Authoring-only — never exported to PDF/EPUB/HTML.
      Not the same feature as Phase G's real-time collaboration comments
      below (this is single-user, local, no sharing/permissions involved)
- [x] Placeholder content blocks ("photo goes here", with a short
      description) so a draft can be laid out before every asset exists —
      shipped 2026-07-31 (Phase 48). New `placeholder` block type (image/
      chart/table/diagram/other kinds), insertable via "+", rendered as a
      real dashed box on-screen, in the exported PDF, and in EPUB/HTML —
      deliberately never hidden, so a remaining placeholder is always an
      obvious marker, never a silent gap. A `commercial` Virtual Editor
      checker flags every unresolved placeholder as `critical`, which
      auto-blocks the pre-export readiness dialog with zero extra UI wiring.
- [x] AI Publishing Workspace ("Layer 0 — Planning") — entity schema + store —
      shipped 2026-08-01 (Phase 63): `types/layer0.ts` (8 entity interfaces —
      Character, Location, Timeline Event, Glossary Term, Reference,
      Illustration Brief, Style Rule, Research Note — sharing a `BaseLayer0Entity`
      id/timestamp shape), `store/layer0Store.ts` (one `Layer0Bible` per
      project, generic add/update/delete methods parameterized by collection
      rather than eight near-duplicate CRUD triplets), and generic history-
      wrapped actions in `editorActions.ts` so every Layer 0 edit is undoable
      exactly like manuscript edits. A new top-level "Planning" mode/tab
      (`uiStore.appMode`, `layout/planning/PlanningShell.tsx`, rendered by
      `EditorPage.tsx` instead of `AppShell` — resolving `AI_WORKSPACE_VISION
      .md`'s "new top-level mode/tab" decision) with a category list + a
      generic list/add/edit/delete form pane covering all eight kinds. No AI
      involved yet — this is the foundation every AI-Workspace item below
      depends on. See `docs/AI_WORKSPACE_VISION.md` for the full decision
      record. Deliberately deferred, flagged explicitly rather than
      overlooked: NOT yet wired into `exportProjectFile.ts`/
      `importProjectFile.ts` (a saved `.bookstudio` file won't include Layer 0
      data yet — it still persists locally via the store's own
      `localStorage` persistence, just not in the portable file), and
      `TimelineEvent` reordering (new events append at the end; no drag-
      reorder UI yet). `ClipboardProvider`, the paste-response-back diff,
      and the Continuity checker below all need no API/backend/billing (the
      user copies the prompt to their own Claude/ChatGPT and pastes the
      response back) — only `ApiKeyProvider` is genuinely API-gated.
- [x] Layer 0: wire the entity bible into `exportProjectFile.ts`/
      `importProjectFile.ts` so "Save to file"/"Load" round-trip Planning
      data along with the manuscript/structural pages/notes — shipped
      2026-08-01 (Phase 65), closing the gap flagged when the store shipped
      (Phase 63). A new `layer0.json` archive entry, read leniently (defaults
      to an empty bible, not an error) so older `.bookstudio` files without
      it still open fine — no `PROJECT_FILE_VERSION` bump needed, same
      additive-field convention as `CoverElement.rotation`.
- [x] Layer 0: `TimelineEvent` manual reorder UI — shipped 2026-08-01 (Phase 69).
      `layer0Store.moveTimelineEvent` swaps an event with its by-`order`
      neighbour and renumbers sequentially, mirroring
      `structuralPageStore.movePage`'s adjacent-swap-then-renumber shape (per
      category there, across the whole timeline here); `moveTimelineEventWithHistory`
      in `editorActions.ts` wraps it the same symmetric way
      `movePageWithHistory`/`moveChapterWithHistory` already do. `EntityListPanel.tsx`
      now sorts by `order` for this one kind and adds Up/Down buttons — the
      established `ChevronUp`/`ChevronDown` reorder pattern already used for chapters
      and structural pages, not new drag-and-drop machinery.
- [x] Project-creation wizard (genre/audience-driven starting template) — shipped
      2026-08-01 (Phase 70). Deliberately the lightest version that satisfies this
      ticket, not the full per-genre relabeling `docs/AI_WORKSPACE_VISION.md`
      explicitly defers to its own design pass — no new dialog step, no per-project
      Layer 0 category visibility toggling. Extends the existing `NewProjectDialog`'s
      category picker (which already doubles as the genre/audience axis via
      `ProjectCategory`) to imply two things on create: a sensible starting trim size
      (`data/projectTemplates.ts`'s `CATEGORY_TEMPLATES`, e.g. children's → `8.5x11`,
      novel → `6x9`, nature/scientific → `7x10`) and one clearly-marked example entity
      per genre-relevant Layer 0 kind (a novel seeds Character/Location/Style Rule;
      nonfiction seeds Reference/Research Note/Glossary Term; etc.) — this is the
      literal "decides which Layer 0 entity subset a new project starts with," without
      inventing new schema. Every seeded entity's own text says "starter example, edit
      or delete," and Layer 0 is never read by export, so an unedited example can
      never leak into a shipped book.
- [x] Outlining / story-structure templates — shipped 2026-08-01 (Phase 71).
      `data/outlineTemplates.ts` holds five well-known structures (Three-Act
      Structure, The Hero's Journey, Save the Cat Beat Sheet, Problem → Solution for
      non-fiction, Picture Book Arc for children's) as plain beat-title/description
      data — `applyOutlineTemplate` seeds each beat as a new `TimelineEvent`, always
      appended after whatever's already on the timeline (never overwrites or
      reorders existing events), through the same `addLayer0EntityWithHistory` a
      manual add uses, so applying (and undoing) a template works exactly like any
      other Layer 0 edit. `layout/planning/OutlineTemplatesPanel.tsx` is the picker
      UI — a card per template with an "Apply to Timeline" button — wired into
      `PlanningShell.tsx` as a third tool nav entry alongside "Generate Prompt"/
      "Paste Response" (which also got refactored into a shared `ToolNavButton`
      once a third copy-pasted nav block would have repeated itself). Directly
      reuses Phase 69's Timeline reorder UI for fine-tuning the seeded beats
      afterward.
- [x] Word-count goals and writing-session tracking — shipped 2026-08-01 (Phase 72).
      `store/writingSessionStore.ts` keeps one small per-project record (`dailyGoal`
      + a per-calendar-date net-words-written `log`), fed by `recordWordCount`'s
      running-baseline-diff — day-boundary-aware, so opening an existing manuscript
      or crossing midnight never backdates the whole total as "written today."
      `hooks/useWritingSessionTracking.ts` feeds the live total (`useManuscript
      WordCount`, Phase B) into it on every change, mounted once in `Toolbar.tsx`.
      `components/common/WritingGoalDialog.tsx` — today's net words + optional
      goal + a `Progress` bar + the last 7 days (gaps shown, not hidden) — opens by
      clicking the word count itself (no new toolbar button, given the crowding
      already flagged in `docs/SUGGESTIONS.md`).
- [x] Thesaurus / synonym lookup (Phase 114, 2026-08-03) — flagged
      2026-08-01 alongside search and spellcheck. The `moby` package the
      user installed turned out to be the wrong one (`zeke/moby`, a CLI +
      Express + Jade webserver tool, not a bundleable dataset) — swapped for
      its own dependency `thesaurus` (`daizoru/node-thesaurus`), a plain
      `word -> synonyms[]` JS object with no `fs`/Node APIs at module scope.
      Converted to `public/thesaurus/en/data.json` (~12 MB, same "static
      asset fetched lazily, not bundled" pattern as the spell-check
      dictionaries — see that folder's README). New
      `src/renderer/thesaurusDictionary.ts` (async-loaded, module-cached,
      fails closed) + a "Synonyms" button in `FloatingFormatToolbar.tsx`,
      shown only when the selection is a single word. Picking a synonym
      replaces the selection via `execCommand('insertText', ...)` — the
      same native-command approach Bold/Italic/Link already use, so it
      participates in the browser's undo stack for free, no custom DOM
      splicing. Verified via `tsc`; not yet live-verified in Chrome (see
      Phase K's standing verification gap — this sandbox can't push/
      preview). `package.json` corrected: `moby` removed, `thesaurus` added
      directly.
- [x] Distraction-free writing mode, plus a reading mode (user-requested
      alongside it, 2026-08-01) — shipped 2026-08-01 (Phase 73). One shared
      `uiStore.focusMode: 'none' | 'write' | 'read'` rather than two independent
      flags (a user is never in both at once). `FocusModeLayout.tsx` renders
      instead of the three-column `AppShell` whenever `focusMode !== 'none'` —
      just `BookRenderer` full-screen, no Sidebar/Toolbar/Inspector, plus a small
      floating pill (mode label + Esc hint + an explicit exit button). `write`
      keeps every page fully editable (today's normal behaviour, minus the
      chrome); `read` passes `decorative={true}` through the newly-threaded
      `BookRenderer` → `LazySpread` → `Page` prop chain, reusing `Page.tsx`'s
      existing thumbnail-only interactivity flag at full size instead of
      inventing a second non-interactive rendering path — no `BlockToolbar`, no
      insert-block drop zones, no contentEditable, nothing clickable but plain
      scrolling. Entry point is one combined `DropdownMenu` (`Focus` icon) in
      `Toolbar.tsx`, not two more buttons, given the crowding already flagged in
      `docs/SUGGESTIONS.md`'s Phase 67 entry. Escape exits (wired into
      `useKeyboardShortcuts.ts`, which stays mounted in focus mode since it lives
      in `AppShell.tsx` above the branch) and takes priority over its existing
      deselect behaviour while focus mode is active.
- [x] Reading Mode: real page-turning instead of continuous scroll —
      shipped 2026-08-02 (Phase 79, user-requested). `BookRenderer` gets a
      new `paginated?: boolean` prop, wired only from
      `FocusModeLayout.tsx`'s `read` mode (`paginated={mode === 'read'}`);
      every other caller is unaffected and keeps today's scrolling column
      exactly as before. When paginated, `BookRenderer` renders exactly one
      spread via `LazySpread` (`forceVisible`), tracked by local
      `currentSpreadIndex`/`turnDirection` state (view-transient, not
      persisted to any store — reopening a book starts at spread 0, like
      opening a physical book), floating Previous/Next chevron buttons
      matching `FocusModeLayout`'s existing pill chrome, a "Page X of Y"
      counter (skips unnumbered front-/back-matter pages per
      `composeBookPages`'s `number: 0` convention), and Left/Right + Page
      Up/Down keyboard navigation. Transitions use `tailwindcss-animate`'s
      `animate-in fade-in-0 slide-in-from-{left,right}-8` (the same utility
      already used by `dialog.tsx`/`select.tsx`) — a short slide+fade, not a
      literal 3D page-flip, per `CLAUDE.md`'s "subtle and purposeful"
      animation guidance.
- [x] Fix: Search Sidebar tab invisible due to flex-row overflow — shipped
      2026-08-02 (Phase 80, user-reported with a screenshot). `TabsTrigger`
      (`components/ui/tabs.tsx`) had `whitespace-nowrap` with no `min-w-0`;
      flex items default to `min-width: auto`, so once Search became a
      fourth tab the row silently overflowed the Sidebar's fixed 264px
      width instead of wrapping/scrolling/truncating — the tab rendered
      fully off-screen with zero visual sign anything was wrong. Fixed the
      shared primitive (`min-w-0` + `truncate`, app-wide defensive fix) and
      re-sized Sidebar's row to `Inspector.tsx`'s already-proven tight
      density (`px-1.5 text-xs`) so all four tabs actually fit.
- [x] AI Workspace: scoped prompt generator (`ClipboardProvider`) — shipped
      2026-08-01 (Phase 66). `types/aiProvider.ts` defines the swappable
      `AiProvider` interface (`sendPrompt(text)`) plus the v1
      `clipboardProvider` implementation (Clipboard API, no backend/billing).
      `layout/planning/promptContext.ts` is the actual context-curation logic
      — deterministic, no-dictionary/no-NLP word-boundary name matching
      (`detectMentionedEntityIds`) against a chapter's plain text to
      pre-select "mentioned" characters/locations/glossary terms, plus
      `buildPromptText` which assembles task + selected entities only (never
      the whole bible) + an optional previous-chapter tail excerpt (600 chars)
      for continuity. `layout/planning/PromptGeneratorPanel.tsx` is the UI —
      task textarea, chapter picker, per-kind checkbox lists with a
      "mentioned" badge on auto-detected entities, and a live prompt preview
      with one-click copy. Wired into `PlanningShell.tsx` as a new
      "Generate Prompt" nav entry alongside the eight entity categories. User
      copies the prompt into their own Claude/ChatGPT subscription rather
      than a Book-Studio-hosted AI, keeping "AI assists, never replaces" from
      `CLAUDE.md`.
- [x] AI Workspace: paste-response-back with reviewable diff — shipped 2026-08-01
      (Phase 68). `layout/planning/pasteBackSuggestions.ts` scans pasted text,
      sentence by sentence, for whole-word mentions of any existing Character or
      Location (reusing `promptContext.ts`'s escape-and-word-boundary approach —
      no new NLP), and proposes each matching sentence as an append-to-notes
      suggestion. Deliberately scoped to Character/Location only (the two entity
      shapes with a safe, always-appendable free-text `notes` field) and to
      appending only — per `docs/AI_WORKSPACE_VISION.md`'s explicit "free-text
      extraction into structured fields is unsolved and error-prone," this does
      not guess at other fields or invent new entities from prose.
      `layout/planning/PasteBackPanel.tsx` is the review UI, mirroring the Virtual
      Editor's `FindingRow` Accept/Reject card pattern (Phase C) rather than a new
      interaction: each suggestion is editable before accepting, and nothing
      writes to the bible until accepted. Wired into `PlanningShell.tsx` as a
      second AI-Workspace nav entry ("Paste Response") alongside "Generate
      Prompt."
- [x] Fix: mention detection required an entity's exact full stored name, missing
      first-name-only/last-name-only mentions (the large majority of real prose) —
      found via live first-time-author UX audit, fixed with per-word matching plus a
      stopword list. Phase 78 (2026-08-02). See `docs/PLANNING_MODE_UX_AUDIT.md`.
- [x] Fix: pre-filled example text (every seeded Planning entity field, plus a new
      chapter's "Untitled Chapter" title) didn't select on focus, so typing merged
      into it instead of replacing it. Phase 78 (2026-08-02). See
      `docs/PLANNING_MODE_UX_AUDIT.md`.
- [x] **Insert AI-drafted prose into the manuscript with a reviewable diff** —
      shipped 2026-08-02 (Phase 81). Was the highest-priority open gap confirmed by
      the live audit (`docs/PLANNING_MODE_UX_AUDIT.md` finding #2) — Generate
      Prompt's own copy said "paste the result back into your manuscript yourself,"
      a fully manual, unassisted, block-by-block process. New "AI Draft…" item in
      `InsertBlockButton`'s existing "+" menu (every gap between blocks, not a new
      top-level control) opens `AiDraftInsertDialog.tsx`: paste text, preview the
      parsed candidate blocks, confirm — nothing touches the manuscript until
      Insert is clicked. Parses via a new `parseMarkdownDraftBlocks` (`parser/
      markdown.ts`), sharing its token-mapping with the existing manuscript-import
      parser rather than duplicating it; a new `insertBlocksWithHistory`
      (`editorActions.ts`) commits the whole batch as one undo step. Reusing the
      exact gap the user clicked means the dialog needs no separate chapter/
      position picker — see docs/STATUS.md Phase 81 for the full design reasoning.
- [x] AI Workspace: continuity checker over Layer 0 data, extending the Virtual
      Editor's checker architecture (Phase C) — shipped 2026-08-01 (Phase 74).
      New `layer0Bible?: Layer0Bible` field threaded through `CheckerContext`
      (`virtualEditor/types.ts`) → `runPipeline` → `virtualEditorStore.runReview`,
      with `VirtualEditorWorkspace.tsx` reading `useLayer0Store` itself and
      forwarding it — the exact same optional-context-field pattern already used
      for `project`/`structuralPages`/`assets`; the checker file itself only
      imports types from `@/types/layer0`, never the store. `checkers/continuity.ts`
      is deliberately two checks, not the full "Elena's eye colour doesn't match
      her sheet" semantic vision from `AI_WORKSPACE_VISION.md` (that needs real
      language understanding no checker here has) — same "small, honest start" as
      `fieldGuide.ts`: (1) a Character/Location/Glossary Term never mentioned
      anywhere in the manuscript (word-boundary matching, reusing
      `promptContext.ts`'s technique book-wide instead of per-chapter, suppressed
      below 200 characters of real manuscript text so a brand-new project isn't
      flagged wall-to-wall), and (2) two entries of the same kind sharing a name
      case-insensitively (almost always an accidental duplicate). New
      `'continuity'` `IssueCategory`, registered as `CONTINUITY_CHECKERS` in
      `checkers/index.ts` — no dedicated dashboard score tile, same as
      `developmental`/`fieldGuide`. Also moved `escapeRegExp` out of
      `promptContext.ts` into `utils/format.ts` so this checker (a different
      layer) and `pasteBackSuggestions.ts` share one implementation instead of a
      cross-layer import into `layout/planning`.
- [ ] AI Workspace: `ApiKeyProvider` (direct API call, streamed diff) — deferred
      until there's a real story for cost/accounts (Phase G/H)
- [x] Idea/Notes badge clipping — actual root cause fixed (Phase 89, 2026-08-02),
      after four guessed corner/offset fixes (Phases 85-88) each traded one
      collision for another. Real cause: `Page.tsx`'s content-flow container clips
      at exactly the safe margin with zero headroom, so a block first/last in the
      page's flow has any `-top-3`-style overlay poke into the container's own
      negative local coordinates. Gave the container a small buffer, compensated
      with equal padding so text position is unaffected. Not yet live-verified
      (sandbox can't push) — see STATUS.md Phase 89 for full detail.
- [x] Book graph data-model prerequisite: added `linkedChapterId`/`linkedBlockId`
      to Character/Location/GlossaryTerm/Reference/IllustrationBrief/ResearchNote
      (Phase 90, 2026-08-02) — the exact six-kind gap this item used to flag.
      Cleared as a side effect of building selection-to-Develop capture below, not
      as standalone work.
- [x] Selection-to-Develop capture (Phase 90, 2026-08-02, user-proposed): highlight
      a name or sentence in the manuscript, get a "+" affordance offering
      Character/Location/Illustration Brief/Glossary Term/Research Note/Save as
      Idea, created directly (no capture-then-promote detour) and linked back to
      the exact chapter+block it came from. `renderer/SelectionDevelopMenu.tsx`.
      Not yet live-verified (sandbox can't push) — see STATUS.md Phase 90.
- [x] Show "linked from Chapter X" on entities created via Phase 90's selection
      capture (Phase 91, 2026-08-02) — `EntityListPanel.tsx` now shows a
      read-only "Linked from <chapter>" row with a jump action (reuses
      `IdeaDetailDialog.tsx`'s exact mode-switch + scroll-request pattern,
      preferring the precise `linkedBlockId` over the chapter when both are
      set) for every kind except Timeline Event, which already has its own
      manual chapter-assignment `Select` for this same field.
- [x] Idea System Milestone 2: Ideas mind-map view (Phase 94, 2026-08-02, built
      after the user asked for it to be thought through properly rather than
      built to the one-line spec as-is). One deliberate change from the
      original design note: edges are manual `relatedIdeaIds` only, not shared
      tags too — a popular tag on a dozen ideas would draw dozens of crossing
      lines and be unreadable. Tags instead drive a cheap per-tag centroid-
      attraction force each layout iteration, clustering same-tagged ideas
      spatially and by a coloured ring, with no line drawn for the pairing.
      Hand-rolled force-directed layout in `IdeaMindMapView.tsx` — no graph/
      viz library (confirmed this sandbox has no npm registry access, so one
      wasn't on the table regardless). Pan (drag) + zoom (scroll/pinch) via a
      plain CSS transform on the `<svg>` itself. List/Board/Map now share one
      segmented toggle in `IdeaInboxPanel.tsx`.
- [x] Book graph (Idea System Milestone 3, Phase 97, 2026-08-02): the mind-map
      concept extended past Ideas to the whole book — chapters, every Layer 0
      entity kind, and Ideas, all in one connected, icon-coded graph
      (`BookGraphView.tsx`), filterable by kind (chip row above the canvas).
      Built at the user's explicit request ("map view should be better")
      rather than waiting for Milestone 2 reaction as originally planned.
      Edges: `linkedChapterId` (entity/idea → chapter), `relatedIdeaIds`
      (idea ↔ idea), `promotedTo` (idea → the entity it became). Same hand-
      rolled force layout as `IdeaMindMapView.tsx`, generalised to cluster by
      `kind` instead of `tag`.
- [x] Per-kind icons in Develop mode (Phase 97, 2026-08-02, user: "man icon by
      character for example"): `graphIcons.ts`'s `GRAPH_NODE_ICONS` gives every
      kind (the eight Layer 0 kinds + Idea + Chapter) one fixed lucide icon —
      `User` for Character, `MapPin` for Location, etc. Wired into the Develop
      nav's entity-kind rows, every `EntityListPanel` row (small icon badge),
      and the Book Graph's nodes — one registry, three call sites, not three
      separate icon choices to keep in sync.
- [x] Book Graph: draggable nodes / manual mind-map arrangement (Phase 98,
      2026-08-02, user: "they should be dragable on the page to make a mind
      map"). New `graphLayoutStore.ts` persists manual per-node positions per
      project; the force layout treats a dragged node as a fixed anchor
      (still repels/attracts everything else, just never drifts itself) so
      the rest of the graph keeps arranging sensibly around whatever you've
      placed by hand. "Reset layout" button clears manual positions.
- [x] Fix Structure-tab "+ button pushed out of view" bug (Phase 98,
      2026-08-02) — a long structural-page label (e.g. "Acknowledgements")
      never actually truncated, forcing the whole Structure sidebar content
      wider than 264px and pushing the row's own icons and the section's "+"
      button out of view. Root-caused via live Chrome reproduction (missing
      `min-w-0` on the label's flex-item span) and fixed with one class.
- [x] Labeled relationships between any two Layer 0 entities/Ideas (Phase 99,
      2026-08-02, user: "if the characters are related it could show what
      that is with the line connection eg daughter/mother"). New
      `Layer0Relationship` collection + `Layer0RelationshipsSection.tsx` add/
      remove UI in the entity edit dialog; Book Graph draws each as a dashed,
      captioned line at the edge's midpoint.
- [x] Central "Book" hub node in the Book Graph (Phase 99, 2026-08-02, user:
      "in the center should be the book?") — a permanently-pinned, non-
      draggable node labeled with the project title, with every chapter
      spoking off it as the spine.
- [x] Consolidated the Ideas-only "Map" view into Book Graph (Phase 99,
      2026-08-02, user: "How is this different from book graph and are both
      needed?") — removed `IdeaMindMapView.tsx` and its List/Board/Map
      toggle entry, replaced with an "Open Book Graph" button.
- [x] Fix Toolbar buttons (Hide Inspector/Keyboard shortcuts) visually
      bleeding onto the Inspector column (Phase 99, 2026-08-02) — same
      missing-`overflow-hidden` family of bug as the Structure-tab fix,
      one column over. **Incomplete** — see Phase 104 below: this stopped
      the bleed but not the underlying cause, so the same buttons still
      went missing, just clipped instead of overlapping.
- [x] Toolbar: actually fix the Hide Inspector/Keyboard shortcuts/Export
      crowding (Phase 104, 2026-08-02, user: "still cant see keyboard
      shortcuts or hide inspector as right sidebar overlaps them. and half
      of the export button is cut off.") — root cause was never the missing
      `overflow-hidden` alone, it was eleven controls permanently competing
      for one `shrink-0` row with no give; Phase 99's fix only stopped the
      overflow from bleeding onto the Inspector, it clipped the row's tail
      instead, which is exactly what the user kept losing. Real fix: Hide
      Inspector moved onto the Inspector panel's own header (next to its
      tabs — more discoverable there anyway, and structurally can't be
      squeezed out by unrelated toolbar buttons again); Focus mode, Version
      history, Save, Load, Project Settings, and Keyboard shortcuts folded
      into one "More" overflow menu. The always-visible row is now Undo/
      Redo, project name, theme toggle, Virtual Editor, Develop, Export,
      More — down from eleven controls to five plus one menu.
- [x] Book Graph: chapters connect in reading order (Phase 105, 2026-08-02,
      user: "should chapters link in order in the book graph") — a second
      edge alongside each chapter's existing spine link to the Book, drawn
      as a thin arrowheaded line distinct from the spine and from labeled
      relationships (one-line legend added under the header to keep all
      three unambiguous). Not just visual: these are real edges in the same
      force layout, so chapters now also pull toward their neighbours in
      sequence, not only toward the Book — the auto-arrangement itself
      improves. Chapter node labels also gained a number prefix ("1. The
      Whispering Forest"). Considered and rejected: forcing chapters into a
      literal straight-line layout — that would fight the "drag anywhere"
      mind-map premise the whole view is built on, and duplicate what the
      Chapters sidebar list already is.
- [x] Book Graph: spine attaches only to Chapter 1 (Phase 106, 2026-08-02,
      user: "i think only the first chapter should attach to the central
      book by default?") — Phase 99–105 spoked every chapter directly off
      the Book *and* chained it to its neighbour, which was redundant for
      every chapter but the first once Phase 105's sequence chain existed,
      and undersold "spine": a burst of N lines radiating from one point
      doesn't read as a spine the way one continuous chain running through
      the Book does. Now only Chapter 1 → Book is a direct edge; Chapter 2
      onward reach the Book transitively through the existing reading-order
      chain (Book → Ch.1 → Ch.2 → … ).
- [x] Fix Structure-tab "Acknowledgements pushes copy/delete off the
      sidebar" — still reported broken (Phase 107, 2026-08-02, user:
      "adding acknowledgements in front matter still pushes copy/delete etc
      off the sidebar so it cant be used"), despite Phase 98's `min-w-0`
      fix. Real root cause was one level up from where Phase 98 looked:
      Radix's `ScrollAreaPrimitive.Viewport` (`src/components/ui/scroll-
      area.tsx`, used by every scrollable list in the app) wraps its
      children in its own internal div styled `{ minWidth: '100%', display:
      'table' }`. Table auto-layout sizes to the *max-content* width of its
      contents, which for a `truncate` label (`white-space: nowrap`) is its
      full unwrapped width — so the table wrapper grew the row wider than
      the 264px sidebar regardless of the row's own `min-w-0`, and because
      the Viewport's `overflow-x` is `hidden` (not `scroll`), the overflow
      wasn't reachable by scrolling either — just silently clipped.
      Fixed once, app-wide, in the shared primitive: `[&>div]:!block`
      overrides Radix's inline `display: table` on that one generated
      wrapper (Tailwind's `!important` beats an inline style), restoring
      normal block sizing so `min-w-0` + `truncate` behaves the way every
      row already assumed it did. Same "fix the cause, not the symptom a
      second time" discipline as Phase 104's Toolbar fix — Phase 98's class
      wasn't wrong, it just wasn't sufficient, and re-inspecting the same
      row a second time (rather than trusting the earlier fix) is what
      surfaced the actual constraint being violated one level up.
- [x] Book Graph layout-performance profiling (Phase 108, 2026-08-02) —
      resolved the long-standing "reasoned to be fine, never measured"
      deferral. Ran the actual algorithm (copied byte-for-byte into a Node
      script, constants cross-checked against the real source) against a
      synthetic 100-chapter novel with a full Layer 0 bible: a single
      recompute took ~180-290ms; a stress case (~510 nodes) took ~440ms —
      confirmed real lag, not a hypothetical one. Fix was the Web Worker
      option the item's own text already named: extracted the unmodified
      algorithm into `graphLayoutEngine.ts` (a pure module, same numbers,
      same visuals) and moved its execution into `graphLayout.worker.ts`, so
      the ~200-450ms of CPU work happens off the main thread instead of
      freezing the UI mid-recompute. See STATUS.md Phase 108 for the request-
      id staleness handling and why a persistent worker (not one-per-request)
      was used.
- [x] Book Graph: discoverable zoom controls, node-size control, and
      click-to-connect (Phase 102, 2026-08-02, user: "should be able to zoom
      in zoom out, make each node larger/smaller, connect easily by clicking
      one node to another") — wheel-zoom already existed but had no on-screen
      affordance; added zoom in/out buttons + a live percentage readout next
      to the existing Reset-view button. Node size is a persisted per-project
      multiplier (`graphLayoutStore.getNodeScale`/`setNodeScale`, 70–160%).
      Connect mode is a real mode switch (`Link2` toggle): click a source
      node, click a target node, name the relationship in the right panel —
      writes the same `Layer0Relationship` record `Layer0RelationshipsSection
      .tsx` already did, just without leaving the graph to do it.
- [x] Book Graph: selection-driven focus + right-hand details/stats panel
      (Phase 102, 2026-08-02) — answered the user's own UX-review questions
      directly: clicking a node now selects it (dims every non-connected
      node/edge, highlights direct connections) and shows its details —
      label, kind, word count for chapters, a clickable connection list — in
      a persistent right panel, replacing the old "single click always
      navigates away" model. Nothing selected (or the Book node clicked)
      shows whole-book stats (chapter count, total words, idea count,
      relationship count, per-kind entity counts) in the same panel slot.
      Navigating away is now an explicit "Open" button in the panel, or a
      double-click kept as the accelerator for the old muscle memory. Full
      interaction-model reasoning, including what was deliberately *not*
      built (a minimap) and why, lives in `BookGraphView.tsx`'s own doc
      comment.
- [ ] Book Graph minimap — deliberately deferred in Phase 102 (see
      `BookGraphView.tsx`'s doc comment): "Reset view" already auto-fits
      every visible node via the SVG's dynamic `viewBox`, which covers a
      minimap's actual job at the node counts this app targets today.
      Revisit if a real project's graph ever gets large enough that "reset
      view" stops being a satisfying answer.
- [x] Book Graph: per-node colour + size, chapter-connection parity, node
      search, entity role subtitle (Phase 103, 2026-08-02, user: "change
      colour of individual nodes and make individual nodes larger and
      smaller. And connect chapters to nodes. Primary and secondary
      nodes?"). `graphLayoutStore.ts` gained `nodeColorByProject`/
      `nodeSizeByProject` (per-node overrides, editable from the detail
      panel, stacking with Phase 102's global node-size control). "Primary
      and secondary nodes?" answered with the per-node size control itself
      rather than a new boolean field — reasoning in `BookGraphView.tsx`'s
      doc comment. Chapters added to `Layer0RelationshipsSection.tsx`'s
      "Connect to…" picker (the graph's own click-to-connect never excluded
      them, only the dialog-based picker did — now consistent). A
      `secondaryKey` field already existed per Layer 0 kind (Character's is
      literally `role` — "Protagonist", "mentor", etc.) and now surfaces as
      a subtitle in the detail panel. New "find a node" search box pinned
      atop the right panel dims non-matching nodes/edges, for locating one
      node in a large graph.
- [x] Visual moodboard / Pinterest-style board for example ideas and reference
      images (Phase 93, 2026-08-02) — resolved the design question with a new
      optional `Idea.imageAssetIds?: string[]` (reusing the existing
      `assetStore`, no new Layer 0 kind, no duplicated storage — same pattern
      `IllustrationBrief.referenceAssetId` already used for one image,
      generalised to a list). `IdeaDetailDialog.tsx` gets an "Add reference
      image" upload; `IdeaInboxPanel.tsx` gets a List/Board toggle — Board is
      a CSS multi-column masonry grid (no new dependency; sandbox has no npm
      registry access regardless), List stays the default so nobody who never
      adds an image sees any change.
- [x] Develop nav cleanup (Phase 92, 2026-08-02): folded "Generate Prompt" +
      "Paste Response" under a small muted "Tools" section header, separated
      from the Ideas-promotion categories above it. Discussed in the Phase 83
      design review, deliberately not built then.

## Phase G — Accounts, Cloud & Collaboration

*(Currently 100% client-side: no accounts, no backend, projects live only in this
browser's `localStorage`/IndexedDB. This is the biggest structural gap between
Book Studio today and an actual multi-device Canva-style product.)*

- [ ] User accounts / authentication
- [ ] Backend + cloud project storage (sync, not just local persistence)
- [ ] Cross-device access to the same project
- [ ] Sharing a project via link with view/comment/edit permission levels
- [ ] Real-time or async collaboration (comments, co-editing)
- [ ] Team / publisher organisation workspaces

## Phase H — Commercialization & Growth

- [ ] Pricing tiers and feature gating (free vs. paid)
- [ ] Billing integration (e.g. Stripe)
- [ ] First-run onboarding flow / interactive tutorial
- [ ] Starter example projects / templates in the gallery
- [ ] Usage analytics
- [ ] Public marketing site (separate from the app itself)

## Phase I — Marketing Toolkit

*(Per `VISION.md`'s full loop: Idea → Planning → Writing → Design → Editing → Review
→ Publishing → **Marketing** — this stage doesn't exist yet at all.)*

- [ ] Blurb / back-cover copy AI writer
- [ ] Social media graphic templates generated from the book's cover/theme
- [ ] Amazon/KDP metadata and keyword helper
- [ ] Press kit / author one-sheet generator
- [ ] Author landing page generator

## Phase J — Platform Hardening & Technical Debt

- [x] Repair the test suite — shipped 2026-09-03 (Phase 125). `npm test` had been
      crashing partway through, so only 94 of 408 assertions ever ran. Four
      independent root causes, one of them a live production bug: PDF export was
      broken for every user because Bebas Neue cannot be embedded by
      `@pdf-lib/fontkit`. 408 passing, exit 0
- [x] CI pipeline — shipped 2026-09-04 (Phase 140). `.github/workflows/ci.yml`
      runs `npm ci`, build, lint and tests on every push and pull request,
      with in-progress runs cancelled when a branch is pushed again. This is
      what actually enforces CLAUDE.md's "every commit compiles and lints
      clean" instead of relying on remembering
- [x] Real browser end-to-end tests — shipped 2026-09-04 (Phase 140).
      `scripts/e2e/` holds a Playwright suite covering the writing experience
      on both shells (`npm run test:e2e`), proven to fail when Phase 139's
      fix is reverted. Playwright stays out of `package.json` on purpose —
      it pulls a browser download — so the runner resolves it from wherever
      it is installed and says so plainly when it isn't
- [ ] Add Playwright as a devDependency and run `test:e2e` in CI too — needs
      a decision on the install-time cost, since every other check runs
      without a browser
- [x] Error boundaries — shipped 2026-09-03 (Phase 133). The app previously had
      **none**, so any render error unmounted the whole tree to a blank page
      with no message and no way back. Now a root boundary, a per-route
      boundary around the editor, and a targeted one around Book Graph that
      degrades just that panel. Each shows the real error text and offers Try
      again / Reload / Copy details
- [x] Fix the mobile Book Graph white-screen crash — shipped 2026-09-04 (Phase
      134). Root cause: `onBackgroundPointerMove` read `panState.current`
      inside the `setTransform` updater, which React runs at render time, not
      at call time. `pointermove` is continuous-priority so its render can be
      deferred past the discrete `pointerup` that nulls the ref, giving
      `TypeError: Cannot read properties of null (reading 'origX')`. Only
      reproducible with real touch, where finger jitter emits moves too
      densely for React to flush between them
- [x] Add nodes from the Book Graph canvas — shipped 2026-09-04 (Phase 135).
      An "Add" button on the canvas creates any of the eight Layer 0 kinds or
      an Idea, places it clear of existing nodes and pins it there, and
      optionally links it to the selected node in the same step. Chapters are
      deliberately excluded — Layer 2 data, added in Write mode
- [ ] Let the graph create a chapter too, if the Layer 0 -> Layer 2 boundary
      is ever deliberately opened (needs a decision, not a patch)
- [x] Front/back matter on mobile — shipped 2026-09-04 (Phase 136). More ->
      Book pages adds, reorders, duplicates, deletes and edits every
      structural page type, including setting a cover image from the camera
      roll. Mobile could previously render structural pages in Preview but
      never create one, so a book started on a phone could not get a cover
- [x] `assetStore.importFiles` no longer loses good files to one bad one —
      shipped 2026-09-04 (Phase 137). It was worse than the unhandled
      rejection first logged: one undecodable file threw out of the whole
      loop, discarding every file picked alongside it AND orphaning the ones
      already written by `putAsset` (stored in IndexedDB, never registered in
      `byProject`, so unreachable and undeletable forever — measured at 1
      orphan per failed batch). Now per-file isolated, object URL released on
      failure, and it returns `{ imported, failed }` so the UI can name the
      file that failed
- [x] Cover image can be set from the page panel — shipped 2026-09-04
      (Phase 137). Replaces the desktop-only hint text ("drag one from the
      Assets tab") with a real control that works on both platforms, for
      Cover and Back Cover
- [x] Mobile parity pass — shipped 2026-09-04 (Phase 138). Capture a thought
      while writing (linked to the open chapter, as on desktop); a Review tab
      running the real Virtual Editor; find and replace; the image library
      (browse + delete, not just add); chapter reorder; and the export
      readiness warning mobile used to skip straight past
- [ ] Mobile: block-level Inspector surfaces — Notes on a block, the
      Typography panel and the Image panel. All three depend on a block
      selection model mobile Write doesn't have yet (it now publishes the
      chapter, not the block), so this is a design pass, not a port
- [x] Mobile distraction-free writing — shipped 2026-09-04 (Phase 140), and
      the earlier "probably correct to leave out" call was wrong: a phone
      being single-column is not the same as being distraction-free. Takes
      the book's typographic identity (theme fonts, size, leading, drop cap,
      paper and ink) rather than its page geometry, because a 6x9in page
      scaled to a 390px phone is unwritable
- [x] Fix the writing experience — shipped 2026-09-04 (Phase 139). Enter
      genuinely continues writing now, on both desktop and mobile: it splits
      the paragraph at the caret and the caret follows into the new one.
      Three root causes, all fixed: `paginate` handed React a fresh random
      `page.id` every run so every repagination rebuilt the page DOM and
      destroyed the focused element; the Inspector's Typography box grabbed
      the caret off the page whenever the selection changed; and mobile never
      wired `onSplit` at all. Enter at the end of a heading now starts the
      paragraph beneath it, and Backspace at the start of a paragraph joins
      it upward, on mobile too
- [ ] PDF export could not be exercised end-to-end in the headless harness
      (no download event fires, identically before and after Phase 139) —
      needs either a harness fix or a manual check
- [x] Spell-check actually works — fixed 2026-09-04 (Phase 141). It had been
      dead for every user since Phase 125: that phase resolved the dictionary
      URL against `document.baseURI`, but the editor always lives on
      `/project/:projectId`, so the fetch asked for
      `/project/dictionaries/en-gb/index.aff` and 404'd. nspell threw
      "Missing `aff` in dictionary", the console message scrolled past, and
      every caller fell back to "not yet analysed" — with native spellcheck
      deliberately off, users got nothing at all. Now resolved against Vite's
      `BASE_URL`, which is what Phase 125 actually wanted
- [x] Spell-check on/off control — shipped 2026-09-04 (Phase 141), in the
      desktop More menu and mobile More. Scoped to the live underlining; the
      Virtual Editor's spelling review is a deliberate action and stays
- [x] Clicking a flagged word selects it — shipped 2026-09-04 (Phase 141), so
      the red underline leads somewhere: a single-word selection is what the
      existing Fix-spelling list already keys off
- [x] Mobile: the structural page editor shows the page — shipped 2026-09-04
      (Phase 141). Editing a cover was a blind form; it now renders the real
      `Page`, scaled and height-bounded so the cover and the fields are
      visible together
- [ ] Mobile: position cover elements by touch (drag, resize, focal point) —
      still desktop-only. A canvas-interaction design pass, not a port
- [x] "Drop an image here" no longer shows on touch — fixed 2026-09-04
      (Phase 141). There is no drag source on a phone and the label is
      pointer-events-none, so mobile Preview was showing an instruction the
      user physically could not follow
- [x] Whole-app runtime audit — shipped 2026-09-04 (Phase 142).
      `npm run test:audit` walks ~25 surfaces across both shells and fails on
      any uncaught error, unhandled rejection, console error or failed
      request. Built specifically for the spell-check bug class: a feature
      that fails at runtime while the UI still looks correct. Currently CLEAN
- [x] User-facing copy audit — shipped 2026-09-04 (Phase 142).
      `npm run audit:copy` (in CI) flags copy describing a pointer-only
      interaction in a component that can render on a phone. Found three real
      instances on its first run, including the back-cover twin of the hint
      fixed in Phase 137
- [x] About the Author: set the photo without dragging — shipped 2026-09-04
      (Phase 142). There was no upload control at all, so a phone could never
      set an author photo; the panel only described dragging one from the
      Assets tab
- [ ] Add Playwright to CI so `test:audit` and `test:e2e` run there too —
      same dependency decision as Phase 140
- [x] Spell-check is actually visible — fixed 2026-09-04 (Phase 143). Phase
      141 made the dictionary load; the underlining was still wrong in two
      ways. It was scoped to the focused paragraph, so exactly ONE
      misspelling was ever visible and none at all once you stopped typing;
      and the underlines are DOM React knows nothing about, so its next
      render wiped them. Every editable paragraph now decorates itself and a
      MutationObserver re-applies it whenever anything replaces the content
- [x] Mobile spell-check — shipped 2026-09-04 (Phase 143). `MobileTextField`
      never called `useLiveSpellcheck`, so mobile had none at all and the
      on/off control added for it in Phase 141 governed nothing there
- [x] Spell-check regression suite — shipped 2026-09-04 (Phase 143),
      `scripts/e2e/spellcheck.e2e.mjs`, proven to fail against both
      historical bugs
- [x] Add a chapter from mobile distraction-free writing — shipped
      2026-09-05 (Phase 144). Two routes, no permanent chrome: a "+" in the
      controls that already reveal on tap (the mobile equivalent of
      appear-on-hover), and a quiet "Start the next chapter" line at the end
      of the last chapter, set in the book's own type. Both create the
      chapter, give it a first paragraph and land the caret in it
- [x] Focus mode: "Start writing…" now focuses the paragraph it creates —
      fixed 2026-09-05 (Phase 144). It inserted a block without a caret, so
      everything typed next went nowhere. Present since Phase 140 and masked
      by a test with fallback selectors
- [ ] Production error monitoring / crash reporting
- [ ] Resolve the conflicting `react-router` npm audit advisories
- [ ] Fix/confirm the stray partially-installed `node_modules` artifact —
      confirmed concretely in Phase 53 (2026-07-31): `@tailwindcss/node/dist/
      index.mjs` is truncated mid-file (17,347 bytes, cuts off mid-string).
      Re-confirmed 2026-08-03 by inspecting the file directly — this is a
      real on-disk corruption in the live-mounted project, not sandbox-only,
      which is why `vite build`'s config load and `oxlint`'s native binding
      have never actually been verified working this whole project. No
      registry access to `npm install` a repair from this sandbox — the fix
      (`npm ci`) is written up in `docs/TERMINAL_SETUP.md` for the user to
      run from their own terminal. Leave unchecked until confirmed fixed.
- [ ] Line-level text flow (paragraphs currently move to the next page as a whole block)
- [ ] Full virtualisation of `LazySpread` (currently mount-only, never unmounts)
- [ ] Profile and fix the structural-page mutation freeze (15–30s on a
      17-chapter project) — Phase 53 (2026-07-31) added a "Reviewing…"
      loading state to the Virtual Editor's "Review Entire Book" button so
      the freeze is at least visible/honest instead of looking hung, but
      the underlying synchronous main-thread block is unfixed; this item
      stays open
- [ ] Automated accessibility (WCAG) audit beyond Radix's built-in semantics
- [ ] UI internationalisation / localisation

## Phase K — Mobile / On-the-go Mode

*(Added 2026-08-02: "the site currently works for desktop but there should be an
on the go mode for mobile users." User chose "Writing + Idea capture only" over
two broader options (adapt everything responsively; Idea-capture-only with no
writing) — the fixed-size, bleed/trim-precise page canvas, cover/back-cover
designer, and precision layout tools are staying desktop-only by design, not
a gap to close later.)*

- [x] `useIsMobile` viewport-breakpoint hook (640px, matches Tailwind `sm`) +
      `EditorPage` branch to `MobileWorkspace` instead of `AppShell`/
      `PlanningShell` below that width (Phase 95, 2026-08-02). Live/resize-
      reactive, not a one-time check — a window resized across the
      breakpoint switches shells immediately.
- [x] `MobileWorkspace` shell: header (back-to-projects, project name, theme
      toggle) + bottom Write/Ideas tab bar, no Sidebar/Toolbar/Inspector
      (Phase 95).
- [x] `MobileWriteView`: chapter-switcher bottom sheet + continuous single-
      column block flow for the active chapter, reading/writing the same
      `contentStore` data as desktop through the same history-wrapped
      `editBlock`/`insertBlockWithHistory` actions (undo/redo + autosave
      behave identically, no parallel edit path). Inline tap-to-edit for the
      six plain-text block types (heading/paragraph/quote/pull-quote/
      callout/case-study); everything else (list/table/timeline/faq/
      statistics/checklist/image/gallery/placeholder) renders as a read-only
      preview card — a phone-keyboard mini-form for a table or FAQ list is
      real scope, deliberately deferred rather than half-built (Phase 95).
      "+" adds a paragraph or heading at the end of the chapter.
- [x] `MobileIdeasView`: thin wrapper around the existing `IdeaInboxPanel`
      (List/Board, Map removed Phase 99) — no fork needed, it was already
      reasonably narrow-friendly (Phase 95).
- [x] Mobile chapter management: add/rename/delete from the chapter-switcher
      sheet, not just switch-between (Phase 100, 2026-08-02).
- [x] Mobile block reorder + delete: always-visible per-block "⋮" menu
      (Move up/down, Delete), same history-wrapped actions desktop's block
      hover-toolbar uses (Phase 100).
- [x] Mobile photo insertion: "+" menu's "Add photo" opens the device's
      native picker and inserts a real `ImageBlock` via `assetStore
      .importFiles` (Phase 100, user: "it should feel like a mini version of
      book studio on the go... still being able to edit content and make a
      book").
- [x] Mobile Undo button in `MobileWorkspace`'s header (Phase 100) — needed
      once mobile gained real destructive actions (delete block/chapter).
- [x] Live-verified in Chromium — shipped 2026-09-03 (Phase 126). Verified at real
      device viewports: mobile shell renders and switches, Add Chapter, the "+"
      FAB menu (Add paragraph/heading/photo), tap-to-edit inline with the text
      persisting to `contentStore`, the per-block "⋮" menu (Move up/down,
      Delete), header Undo, and the Ideas tab. Zero console or page errors.
      Two defects found and fixed in the same phase — see the two entries below
- [x] Phone in landscape no longer drops out to the desktop shell — fixed
      2026-09-03 (Phase 126). `useIsMobile` keyed on width alone, so a rotated
      phone (~844×390) cleared the 640px test and got the three-column desktop
      shell inside 390px of height: toolbar clipped mid-word, page canvas an
      unusable sliver. Now also matches a short viewport with a coarse pointer,
      which leaves tablets and short desktop windows exactly as they were
- [x] Mobile "+" FAB had no accessible name (icon-only button) — fixed 2026-09-03
      (Phase 126)
- [ ] Remaining live-verification owed:
      resize-triggered shell switch, chapter-switcher sheet (including the
      new add/rename/delete), inline edit of each of the six text-bearing
      block types, the new per-block "⋮" menu, "Add photo" actually
      triggering the OS picker, the new header Undo button, autosave firing
      from mobile edits, and Ideas List/Board on a narrow viewport. See
      STATUS.md Phase 95/100's verification caveats — Phase 100 additionally
      hasn't even had a local `tsc` pass yet due to a sandbox VM outage.
- [x] Mobile book preview — shipped 2026-09-03 (Phase 127): a third bottom-tab
      surface showing the real paginated book read-only (chapter flow, front/back
      matter, running heads, folios, drop caps, generated Contents). Reuses
      `HeightMeasurer` → `paginate` → `composeBookPages` → `Page` unchanged
      rather than adding a second layout engine; the page is rendered at true
      size and CSS-scaled to fit, so page breaks match what prints
- [x] Mobile "More" tab — export (PDF/EPUB/HTML), import a manuscript, save/open
      a .bookstudio project file, version history, theme gallery and project
      settings, all on a phone — shipped 2026-09-03 (Phase 128). Reuses the same
      hooks and components the desktop Toolbar and Inspector drive. **This
      deliberately reverses Phase K's original "Writing + Idea capture only"
      scope at the user's explicit request**; what stays desktop-only is now an
      interaction boundary (the bleed/trim-precise page canvas and drag-to-
      position cover tooling) rather than a feature one
- [ ] Mobile PDF export currently requires opening the Preview tab once first,
      so the book gets paginated — pagination only runs while Preview is
      mounted. Acceptable (and explained in the row itself) but worth removing
- [x] Mobile front/back-matter management — shipped 2026-09-04 (Phase 136),
      More -> Book pages. Add/reorder/duplicate/delete/edit every structural
      page type, cover image included. (add/reorder title page, copyright,
      dedication...) — Structure is still desktop-only
- [x] Mobile manuscript search — shipped 2026-09-04 (Phase 138), More -> Find
      and replace, hosting the desktop `SearchPanel` directly
- [x] Mobile Virtual Editor access — shipped 2026-09-04 (Phase 138) as its own
      Review tab, running the real `VirtualEditorWorkspace` so a review on a
      phone applies the same checkers and scoring as on desktop
- [x] Book Graph on mobile, with touch node dragging — shipped 2026-09-03
      (Phase 130). Phase 129 had excluded it on the assumption a drag-and-zoom
      canvas needed a pointer; that was wrong about this canvas, which was
      already built on pointer events with `touch-none` and
      `setPointerCapture`. Only the container needed loosening, via a new
      `compact` prop. Touch drag verified to move a node by the same
      displacement as mouse
- [ ] Book Graph renders no nodes under the Vite **dev server** (`npm run dev`)
      — the layout Web Worker loads and the request is posted, but no response
      ever arrives, so `layout.positions` stays empty and every node is
      skipped. NOT a production defect: the same code in a production build
      renders and drags correctly, and the layout engine itself returns
      correct positions in 3ms when called directly. A Vite dev module-worker
      quirk; it makes the graph impossible to develop locally, so worth fixing
- [x] Book Graph full-screen mode — shipped 2026-09-03 (Phase 131). Reported
      from a real phone: the canvas was collapsed to a strip barely taller than
      its own zoom controls. Two fixes — the canvas now has a real minimum
      height (55dvh) instead of relying on `flex-1`, and a "Full screen" button
      hands it the whole viewport, hiding the heading, legend, filters and
      selection panel. Escape or "Exit full screen" returns
- [x] Fix: touching the mobile Book Graph jumped the user to another tab —
      fixed 2026-09-03 (Phase 132). The canvas carried `flex-1`, which grew it
      past its declared height (782px inside a 600px viewport) so it was drawn
      under the bottom tab bar; a tap on the lower part of the graph hit a nav
      button. Reported as the graph "crashing" on touch
- [ ] Structured-block mobile editing (list/table/timeline/faq/statistics/
      checklist) — currently read-only cards on mobile; would need small
      per-type mini-forms, not a plain contentEditable field.
- [x] Mobile Develop mode — shipped 2026-09-03 (Phase 129): `MobileDevelopView`
      renders desktop's `PlanningShell` information architecture as a
      drill-down — a category list (Ideas + all eight Layer 0 kinds + Outline
      Templates + AI Prompt, with counts) that pushes the real desktop panel.
      Panels are reused unmodified. The Ideas tab was folded into Develop,
      mirroring desktop where Ideas is a category inside Planning, keeping the
      tab bar at four.
- [ ] Mobile image/gallery block insertion (asset picker UI) — desktop-only
      today, same underlying gap `defaultContent.ts` already documents for
      the desktop "+" inserter.
- [x] Decided 2026-09-03 (Phase 129): Develop's non-Idea categories DO belong on
      mobile — the user asked for them directly. Book Graph is the one part that
      stays desktop-only, on interaction grounds rather than scope.

---

### How to use this file
1. Before starting a milestone, confirm it's still accurate against `STATUS.md` and
   the current code — this roadmap can drift if `STATUS.md` isn't kept in sync.
2. When a box is ticked here, the corresponding detailed entry belongs in `STATUS.md`
   (what shipped, how it was verified, any deferred edge cases).
3. Order within a phase is a suggestion, not a hard dependency graph — re-prioritise
   freely, but don't skip Phase G forever: most of Phases E/H/I assume accounts and
   cloud storage exist.
