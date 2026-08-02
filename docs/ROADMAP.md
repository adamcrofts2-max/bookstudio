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
- [ ] Real (dictionary-backed) spell-check, beyond the browser's native
      `contentEditable` default — flagged 2026-08-01. Every editable field
      in this codebase is a bare `contentEditable` element with the
      `spellCheck` attribute never explicitly set (confirmed by audit), so
      the browser's own default spellcheck likely already applies today —
      not a bug, but also not something Book Studio controls, tests, or can
      rely on consistently across browsers. A *real* checker (a bundled
      dictionary via something like `nspell`/`typo-js` + Hunspell word
      lists, surfaced as a genuine `proofreading`-category Virtual Editor
      finding rather than only a native red squiggle) is a legitimate,
      bigger feature — `virtualEditor/checkers/proofreading.ts`'s own doc
      comment already explicitly scopes spelling out today ("no dictionary
      lookup"), so this closes a gap that was a deliberate decision, not an
      oversight, and should be revisited once there's appetite for the
      bundle-size/licensing tradeoff a real dictionary brings. Not started.

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
- [ ] Real font subsetting — **blocked in this environment**: pdf-lib 1.17.1
      (the installed version) has no subsetting API at all, and getting one
      would need installing a different/forked package, which needs npm
      registry access this sandbox doesn't have
- [ ] CMYK-aware export workflow for commercial print

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
- [ ] Thesaurus / synonym lookup — flagged 2026-08-01 alongside search and
      spellcheck. Lowest priority of the three: needs either a bundled
      synonym dataset (a compact WordNet-derived package, most
      realistically) or an external API call, and this client-only,
      no-backend architecture makes a bundled dataset the more consistent
      choice with everything else in this phase (no accounts/billing
      needed, same reasoning `ClipboardProvider` below uses). Not started.
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
- [ ] Show "linked from Chapter X" on entities created via Phase 90's selection
      capture in `EntityListPanel.tsx` — the data exists on the entity now
      (`linkedChapterId`), the list/detail view doesn't surface it yet.
- [ ] Idea System Milestone 2: Ideas mind-map view (list/mind-map toggle on the
      same Ideas data — nodes are ideas, tag = cluster colour, edges are shared
      tags or manual `relatedIdeaIds`). Design agreed 2026-08-02, not built.
- [ ] Book graph (Idea System Milestone 3, discussed 2026-08-02): the mind-map
      concept extended past Ideas to the whole book — chapters, characters,
      places, ideas, images, and research as one connected, icon-coded graph
      (person/map-pin/lightbulb/photo/file-text per kind, filterable by kind).
      Data-model prerequisite (chapter/block association on every kind) is now
      done (Phase 90) — this item is the graph UI itself, still unbuilt. Do this
      after Milestone 2 ships and gets real reaction, not before.
- [ ] Visual moodboard / Pinterest-style board for example ideas and reference
      images (user, 2026-08-02): today's Ideas and References are text-only —
      no way to pin an inspiration image or lay out visual references as a
      board rather than a list. Needs a real design pass before building:
      where do images actually live (a new optional field on `Idea`, a new
      Layer 0 kind, or a board view layered over `References`/
      `IllustrationBrief`?), and how does a board/grid layout coexist with the
      existing list view rather than replacing it. Not scoped yet.
- [ ] Develop nav cleanup: fold "Generate Prompt" + "Paste Response" (a real
      two-step bulk-AI workflow, not clutter — Phase 143/144) under a small
      muted "Tools" section header at the bottom of the nav, separated from the
      Ideas-promotion categories above it. Discussed in the Phase 83 design
      review but deliberately not built — not part of the agreed build list for
      that pass.

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

- [ ] CI pipeline (GitHub Actions running build/lint/test on every push)
- [ ] Real browser end-to-end tests (today's `smoke-test.ts` is jsdom-only)
- [ ] Production error monitoring / crash reporting
- [ ] Resolve the conflicting `react-router` npm audit advisories
- [ ] Fix/confirm the stray partially-installed `node_modules` artifact —
      confirmed concretely in Phase 53 (2026-07-31): `@tailwindcss/node/dist/
      index.mjs` is truncated mid-file in this sandbox, breaking `vite
      build`'s config load, and `oxlint`'s native binding bus-errors. No
      registry access to `npm install` a repair here — needs a real
      `npm install` in a normal dev environment. See STATUS.md Phase 53's
      verification caveat.
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

---

### How to use this file
1. Before starting a milestone, confirm it's still accurate against `STATUS.md` and
   the current code — this roadmap can drift if `STATUS.md` isn't kept in sync.
2. When a box is ticked here, the corresponding detailed entry belongs in `STATUS.md`
   (what shipped, how it was verified, any deferred edge cases).
3. Order within a phase is a suggestion, not a hard dependency graph — re-prioritise
   freely, but don't skip Phase G forever: most of Phases E/H/I assume accounts and
   cloud storage exist.
