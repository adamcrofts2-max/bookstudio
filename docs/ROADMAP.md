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
- [ ] Kindle / MOBI export — worth confirming priority first: Amazon's KDP
      pipeline now primarily ingests EPUB and converts it internally, so a
      separate legacy MOBI writer may not be worth building
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
- [ ] Cover elements: rotation (data model deliberately has no `rotation`
      field yet — see `docs/COVER_CANVAS_PLAN.md` for why one shouldn't be
      added without a rotate handle in the same milestone)
- [x] Cover elements: secondary images (author photo, publisher/series
      logo) as their own element kind — shipped 2026-08-01 (Phase 59), reusing
      `coverImageFit.ts`'s cover-fit math scoped to the element's own box, with
      a real pdf-lib clip so an oversized cover-fit image can't overflow its
      box. Focal point + zoom followed 2026-08-01 (Phase 60) — X/Y + zoom
      sliders in the Inspector, deliberately not an on-canvas click-to-set
      picker (would conflict with the element's own drag-to-move gesture)
- [ ] Cover elements: smart alignment/snap guides — snap-to-page-centre
      (both axes, with a guide line) shipped 2026-08-01 (Phase 57). Still
      open: snapping to the safe-zone guide, trim/bleed edges, and other
      elements' edges, plus grouping
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
- [ ] Cover elements: on-canvas double-click text editing (Milestone 1
      edits text content via the Inspector panel only — see
      `docs/COVER_CANVAS_PLAN.md`'s interaction section for why)
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
- [ ] Cover elements: layers list/panel for selecting elements buried under
      others, plus incremental (one-step) forward/backward z-order nudges and
      multi-select/grouping — flagged in Phase 59's brainstorm as the biggest
      open gap
- [ ] Cover elements: per-element accessibility/contrast checking — the
      existing Accessibility checker doesn't know free-form cover text
      elements exist yet — flagged in Phase 59's brainstorm
- [ ] Back Cover: deliberate decision on whether blurb/author-bio ever get the
      same free-positioning Front Cover's title/subtitle/author gained in
      Phase 59, rather than leaving it an unstated asymmetry
- [ ] Wrap-aware front+spine+back cover view — a toggle showing Cover/
      spine-gutter/Back Cover side by side (using the spine width already
      calculated live) so a user can eyeball whether an image or rule
      would look continuous across the wrap, without merging the two
      pages' underlying data
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
- [ ] Project-creation wizard (genre/audience-driven starting template)
- [ ] Outlining / story-structure templates
- [ ] Word-count goals and writing-session tracking
- [ ] Distraction-free writing mode
- [ ] AI writing assistance for drafting/brainstorming (separate from Virtual Editor's
      review-only role — keep the "AI assists, never replaces" rule from `CLAUDE.md`)

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
