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

- [ ] EPUB export
- [ ] Kindle / MOBI export
- [ ] HTML / web-book export
- [ ] ISBN + barcode field and placement on the copyright/back-cover page
- [ ] Print-on-demand validation profiles (Amazon KDP, IngramSpark spec checks)
- [ ] True justified text in PDF export (currently CSS-only on screen, left-aligned in PDF)
- [ ] Per-image rotation in PDF export (screen preview already supports it)
- [ ] Italic and hyperlink styling distinguished in exported PDF (only bold is today)
- [ ] Table cell text wrapping in PDF export (screen preview already wraps)
- [ ] Real font subsetting (currently embeds full font files, ~170KB overhead/export)
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
- [ ] Template/theme gallery with visual preview before applying
- [ ] More built-in themes beyond the current 5
- [ ] Custom theme editor — user-defined colours/fonts/margins saved as a new theme
- [ ] Dedicated cover/back-cover designer — layout templates, draggable element
      positioning, spine-width calculation from page count + trim + paper for a
      real wraparound cover (Cover/Back Cover today are both one fixed layout:
      centred text over a background image)
- [ ] Stock image / illustration library integration
- [ ] AI image generation for covers and illustrations
- [ ] Community/shareable template gallery

## Phase F — Planning & Writing Tools

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
- [ ] Fix/confirm the stray partially-installed `node_modules` artifact
- [ ] Line-level text flow (paragraphs currently move to the next page as a whole block)
- [ ] Full virtualisation of `LazySpread` (currently mount-only, never unmounts)
- [ ] Profile and fix the structural-page mutation freeze (15–30s on a 17-chapter project)
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
