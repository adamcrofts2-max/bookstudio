# Status

## Version 1 — all eight phases complete

Book Studio now covers the full Development Plan loop: create a project, import a
manuscript, import illustrations, choose a theme, get an automatically generated
professional layout, make adjustments, and export a print-ready PDF.

### Phase 1 — Foundation
React 19 + TypeScript + Vite, Tailwind v4 design tokens (colour/type/spacing/radius/
shadow/motion, see `docs/UI_DESIGN_SYSTEM.md`), hand-built shadcn/ui-style primitives
(Radix + CVA), the three-column app shell, dark mode, Project Settings, and per-layer
Zustand stores persisted to `localStorage`.

### Phase 2 — Editor
- `src/parser/`: Markdown, TXT, HTML and DOCX (via `mammoth`, dynamically imported)
  importers, all producing the same `Chapter[]` shape. DOCX images are extracted
  straight into the asset library instead of staying inline as base64.
- `contentStore` (manuscript per project) and `assetStore` (image library, backed by
  IndexedDB via `src/store/assetDb.ts` — not `localStorage`, which caps out around
  5–10MB and can't hold "thousands of illustrations").
- Sidebar shows real chapter navigation and an asset grid with upload/delete.

### Phase 3 — Layout Engine
- `src/renderer/pageGeometry.ts` turns trim size + margins + bleed into real pixel
  page geometry.
- `src/renderer/HeightMeasurer.tsx` renders every block off-screen at the true page
  width/theme typography to get its real rendered height; `src/renderer/paginate.ts`
  greedily flows blocks into pages from those measurements: chapters always start on
  a recto (right-hand) page, headings never get stranded alone at a page bottom, and
  a table of contents is generated from the real resulting page numbers.
- Pagination is block-level (a paragraph never splits mid-way across a page — see
  "Known simplifications" below).

### Phase 4 — Themes
Five resolved presets in `src/theme/presets.ts` (Classic Novel, Premium Nature, Coffee
Table, Educational, Children's), each controlling page background/ink/accent colours,
heading/body fonts, justification, drop caps, and chapter-opener style. Switching
themes in Project Settings re-renders instantly — no re-import, per the non-negotiable
in `CLAUDE.md`.

### Phase 5 — Typography
Hyphenation (`hyphens: auto` + `lang` attribute), ligatures, drop caps
(`.book-drop-cap::first-letter`), justified vs. ragged-right per theme, language-aware
line breaking.

### Phase 6 — Preview
Two-page spread / single-page toggle, zoom, and a page-thumbnail rail
(`src/renderer/ThumbnailRail.tsx`) with click-to-navigate, all in `Workspace`'s view
controls bar.

### Phase 7 — PDF Export
- Self-hosted Inter + Source Serif 4 (`public/fonts/*.woff2`, extracted from
  `@fontsource` — no external font CDN at runtime).
- `src/pdf/exportPdf.ts` renders the *exact* pagination currently on screen (published
  by `BookRenderer` into the ephemeral `exportStore`, guaranteeing WYSIWYG) to a real
  PDF via `pdf-lib` + `@pdf-lib/fontkit`: bleed, crop marks, embedded fonts, manual
  text-flow with bold inline runs, and images rasterised to PNG via canvas so any
  source format embeds cleanly.
- The Export PDF button saves via the File System Access API where available, falling
  back to a plain download.
- `pdf-lib`/`@pdf-lib/fontkit` and `mammoth` are dynamically imported so they only
  load when actually used — the initial JS bundle is ~484KB (was 2.1MB before
  splitting).

### Phase 8 — Optimisation
- `src/renderer/LazySpread.tsx` defers mounting a spread's real pages until it
  scrolls near the viewport (IntersectionObserver, 1200px margin), so books with
  hundreds/thousands of pages stay responsive on initial load and scroll.
- `useKeyboardShortcuts` (`[` `]` toggle panels, `v` spread/single, `+`/`-`/`0` zoom,
  `Esc` deselect) with a discoverable shortcuts reference dialog in the Toolbar.
- Radix primitives (used throughout `src/components/ui`) give focus management,
  keyboard navigation and ARIA semantics for dialogs/tabs/menus for free.

### Testing
`npm run test` (`scripts/smoke-test.ts`, jsdom) covers: all four manuscript parsers,
the paginator's invariants (no lost/duplicated/reordered blocks, chapters start recto,
TOC matches real page numbers), the inline-HTML-to-styled-runs conversion and greedy
text wrapper used by the PDF exporter, and a full end-to-end PDF export integration
test (pagination → font embedding → valid PDF bytes). All passing. `npm run build`
(typecheck + bundle) and `npm run lint` (oxlint) are clean.

## Phase 9 — Virtual Editor foundation

The first slice of the AI-powered editorial assistant described in
`docs/VIRTUAL_EDITOR.md` (read that document for the full architecture, hybrid
AI workflow, issue taxonomy, and an honest "what's real vs. designed" table —
this entry is the short version).

- **New, independent layer**: `src/virtualEditor/` (types, pure `Checker`
  interface, a synchronous `runPipeline` orchestrator, category/overall score
  aggregation) plus `src/store/virtualEditorStore.ts`. Checkers only ever read
  a `Manuscript` and return `Finding[]` — the store is the only thing that
  turns a finding into a real edit, and it does that exclusively through
  `contentStore.updateBlock`, exactly like `TypographyPanel`/`ImagePanel` do.
- **6 real, deterministic proofreading checkers**: double spaces, repeated
  adjacent words, unmatched quotation marks, unmatched brackets/parentheses,
  missing terminal punctuation, straight-vs-curly quote consistency. All
  produce genuine `Finding`s (location, message, why-it-matters, severity,
  confidence) against the real `Manuscript` shape; three are mechanically
  fixable and carry a `suggestedFix`.
- **Editorial Dashboard**: a new workspace reached via a "Virtual Editor"
  toggle in the Toolbar (the three-column shell never moves — only the centre
  column's contents swap, via `uiStore.workspaceMode`). Shows all 11 named
  scores from the product spec; only Proofreading and an honest Overall show a
  real number today, the other 9 tiles say "Not yet analysed" rather than
  fabricating one. "Review Entire Book" runs the pipeline; findings show
  severity/confidence/location/explanation and working Accept / Reject /
  Ignore / Ignore Similar actions (Edit / Apply to Chapter / Apply to Book are
  visibly present but disabled, with a tooltip saying so).
- **Non-destructive revisions**: accepting a fixable finding snapshots the
  block into a revision log in `virtualEditorStore` (never in `contentStore` —
  the manuscript carries no edit-history baggage) before applying the change;
  a simple list with one-click "Restore original" is provided.
- **Tests**: `scripts/smoke-test.ts` gained real coverage — each checker
  against a fixture with a known issue (asserts it's found) and a clean
  fixture (asserts it isn't, including verifying the exact patched text for
  the two fixable checkers), plus pipeline/score-aggregation checks (dirty
  manuscript scores below 100, clean manuscript scores exactly 100,
  unanalysed categories stay `null`, overall score matches the mean of
  analysed categories).

### Explicitly deferred (see docs/VIRTUAL_EDITOR.md for the full table)
- Every other engine from the product spec — copy editing, developmental,
  publishing-standards, readability, consistency, field-guide, layout,
  typography, accessibility, print, commercial — is designed (types, taxonomy,
  dashboard tile, `NullAiReviewer` stub) but has no real checker yet.
- `AiReviewer` is a real interface with only a null implementation — no LLM
  call happens anywhere in this milestone, by design (hybrid approach: real
  AI review is a future, isolated addition to `runPipeline`).
- Style Guide (`StyleGuide` type + `CheckerContext.styleGuide` plumbing exists)
  isn't enforced by any checker yet, and there's no UI to edit one.
- AI Learning / a personal editorial profile is designed in the doc, not built.
- Apply to Chapter / Apply to Book batch-apply, an Edit-in-place flow, and the
  Original/RevA/RevB/RevC side-by-side compare UI are all deferred — the
  current revision UI is a flat list with restore, not a diff view.
- The revision log and reports are in-memory only (not persisted across a
  reload) — recomputing via "Review Entire Book" is cheap, and a
  `SuggestedFix.apply` function value can't round-trip through
  `localStorage`'s JSON persistence anyway.
- Clicking a finding's location scrolls to its chapter's opening page, not the
  exact block — there's no stable per-block DOM anchor yet (only chapter-start
  pages have one), and `LazySpread` may not have mounted the target block.

## Known simplifications (documented, not hidden)
- **Pagination is block-level.** A paragraph always moves to the next page as a whole
  rather than splitting mid-paragraph. This avoids widows/orphans by construction but
  isn't how real DTP software flows text; line-level flow would be the natural next
  step if tighter page-fill is wanted.
- **PDF export is left-aligned even for "justified" themes.** True justification (even
  word spacing) is implemented on screen via CSS but not yet in the PDF text-wrapper.
- **PDF export doesn't apply per-image rotation** (screen preview does). Table cells
  don't wrap long text in the PDF (screen preview does, via CSS).
- **Italic emphasis (`<em>`) and hyperlink styling aren't distinguished in the
  exported PDF** — only bold is. On screen both render correctly.
- **Font embedding is unsubsetted** (full font files embedded, ~170KB overhead per
  export) after `scripts/smoke-test.ts`'s integration test caught a real
  `@pdf-lib/fontkit` subsetting crash (`RangeError` in `TTFSubset._addGlyph`) on these
  particular font files. Worth revisiting once that's understood upstream.
- **`LazySpread` is "lazy mount," not full virtualisation** — once a spread has been
  visible, it stays mounted rather than unmounting again when scrolled away. This
  keeps scrolling smooth but means a full read-through of an extremely long book will
  eventually have every page mounted. A true windowed list would unmount off-screen
  content too, at the cost of more complex scroll-position bookkeeping.
- **Tables/images/very large blocks can slightly overflow their page** if a single
  block is taller than a full page's content box — the paginator doesn't split
  individual blocks.
- A handful of unused Vite scaffold files and a stray partially-installed
  `node_modules/` may still be sitting in this folder from the very first session (this
  sandbox can't delete files here — see git history). Harmless; delete locally if you
  want a clean tree, then `npm install` again.
- `npm audit` reports two `react-router` advisories whose "fixed" version ranges
  contradict each other (upgrading *and* downgrading both get flagged) — looks like
  overlapping/synthetic advisory data rather than a real actionable CVE for this
  client-only SPA (no RSC/SSR in use). Worth a real second look before shipping.

## Deployment

Live at https://bookstudio-rose.vercel.app/ — Vercel project `bookstudio`, auto-deploys
from GitHub (`adamcrofts2-max/bookstudio`, `main`) on every push. `vercel.json` carries
the SPA rewrite (`/(.*) → /index.html`) required for React Router's client-side routes
to survive a hard reload/direct navigation.

### Post-deploy incident: blank page opening any project (fixed)
Opening any project crashed immediately with React error #185 ("Maximum update depth
exceeded"). Root cause: `Sidebar.tsx` selected assets from Zustand with
`s.byProject[project.id] ?? []`. Zustand v5 selectors run through React's
`useSyncExternalStore`, which decides whether to re-render by comparing the selector's
return value across calls — a fresh `[]` literal is a new reference every time, so the
comparison never settles and React re-renders forever. Fix: `assetStore.ts` now exports
a shared `EMPTY_ASSETS` constant, and the selector returns that instead of a new array.
**Any Zustand selector using `?? []` or `?? {}` (or otherwise constructing a literal in
the selector body) has the same bug — grep for `\?\? \[\]|\?\? \{\}` before adding new
selectors.**

A second, unrelated bug was found and fixed in the same pass: hard-navigating to a
nested route (e.g. `/project/:id`) 404'd on Vercel. `vercel.json` had only ever been
created in a scratch directory during earlier debugging and was never actually
committed to this repo, so the deployed app never had the SPA rewrite. It's committed
now.

Both fixes verified live (not just build-clean) via a real browser: opening the "test"
project renders the editor shell with no console errors, and a hard reload on
`/project/:id` loads the app directly instead of Vercel's 404 page.

## Phase 10 — Inline manuscript text editing

Closed the gap called out at the end of Phase 9: until now, Book Studio had zero
manuscript text-editing capability — a typo could only be fixed by re-importing the
whole manuscript, destroying layout/theme decisions. This also blocked the Virtual
Editor's own "Edit" action, which was visibly disabled.

- **Inline, click-to-edit text on the rendered page**, reusing the single shared
  `BlockContent` component per its own doc comment ("the two must stay pixel-identical,
  so there is exactly one implementation"). New opt-in `editable`/`onCommit` props are
  wired *only* in `Page.tsx`'s real rendering path — `HeightMeasurer.tsx` is untouched
  and never passes them, so off-screen measurement instances stay inert. Covers every
  block type's text: heading text, paragraph HTML (bold/italic/link preserved), quote
  text + attribution, list items (existing items only), table header/cell text
  (existing cells only).
  - Interaction: select (unchanged, `selectionStore`), double-click to enter edit mode
    — a distinct amber (`--color-warning`) focus ring separates "editing" from the
    existing green (`--color-accent`) "selected" ring. Enter commits (blurs the field);
    Escape cancels without committing; blur commits. List items and table cells are
    editable individually (their own small `ListItemField`/`TableCellField`
    components, so each keeps its own edit state without violating Rules of Hooks
    across a variable-length `.map()`).
  - Paragraph HTML is sanitised back down to the same allowed-tag set on commit by
    **reusing** `sanitiseInline` from `src/parser/html.ts` (now exported) — no second
    sanitiser was written, per the project's own "avoid duplicate code" rule.
- **Chapter title renaming**, wired to the existing `contentStore.renameChapter`: a
  hover-revealed pencil icon (and double-click) in `Sidebar.tsx`'s chapter list, and
  double-click on the chapter-opener `<h1>` itself on the rendered page
  (`Page.tsx`) — both commit on Enter/blur, cancel on Escape.
- **Fixed the `measureKey` staleness bug**: `contentStore` now tracks a cheap
  per-project `revisionByProject` counter (state, `getRevision` selector), bumped on
  every `updateBlock`/`renameChapter`/`setManuscript` call. `BookRenderer.tsx` folds
  `contentStore.revisionByProject[project.id]` into `measureKey`, so any content edit
  reliably triggers `HeightMeasurer` remeasurement and repagination — previously an
  edited block silently kept its old (possibly now-wrong) cached height until an
  unrelated full remeasure (theme change, reopening the project) happened to occur.
  This bug quietly affected the Virtual Editor's "Accept fix" action too, so this is
  the same fix for both paths.
- **Reconnected the Virtual Editor's "Edit" action**: `FindingRow.tsx`'s Edit button
  is no longer permanently disabled — it's active whenever a finding has a
  `location.blockId` (true for all six proofreading checkers today) and calls a new
  `selectionStore.selectForEdit`, which flags the selection with a one-shot
  `editRequestId`. `VirtualEditorWorkspace.tsx`'s new `handleEdit` switches back to the
  manuscript workspace, selects the block, and scrolls to its chapter — exactly like
  "Locate" already did — and `Page.tsx`/`BlockContent.tsx` see the pending edit
  request and auto-enter inline edit mode on that exact block, consuming the request
  so it doesn't refire. The stale "not yet implemented" tooltip is gone; a finding with
  no single-block location (a whole-book pattern) still shows Edit disabled, now with
  an honest tooltip explaining why rather than "not yet implemented."
- **Tests**: `scripts/smoke-test.ts` gained coverage for (1) the paragraph
  sanitise-on-commit path — a deliberately messy contentEditable-style HTML fragment
  (unknown wrapper tag with an inline event handler, `<script>`-adjacent content,
  `<b>`/`<i>`, an `<a>` with a stray attribute) asserted down to the exact allowed
  output, reusing `sanitiseInline` directly — and (2) `contentStore`'s new revision
  signal: bumps on `updateBlock`/`renameChapter`, stays stable when nothing has
  changed, and is per-project (editing one project's manuscript never bumps another's
  revision). The jsdom shim at the top of the file also now sets a `url` (so
  `localStorage` isn't on an opaque origin) and `globalThis.window` (zustand's
  `persist` middleware reads `window.localStorage`, not `globalThis.localStorage`) —
  needed once a real `persist`-backed store (`contentStore`) was exercised directly
  for the first time in this test suite.

### Explicitly deferred (scoped out up front, not discovered late)
- Adding, deleting, reordering, splitting or merging blocks/chapters — only editing
  the text of existing ones is in scope this phase.
- A rich-formatting toolbar beyond bold/italic/link — no new inline styles are
  representable; contentEditable can only preserve what's already there.
- Undo/redo — the Toolbar's buttons stay disabled, as before; this is unrelated
  future work.
- Any change to the Virtual Editor's non-destructive revision log/accept-fix
  mechanics, or persisting edit history beyond what `contentStore` already does.
- The Virtual Editor's "Edit" action enters edit mode directly for heading/paragraph/
  quote findings (the common case for today's six proofreading checkers). For a
  finding located on a list or table block, Edit selects and scrolls to the block
  (same as Locate) but doesn't auto-enter edit mode on one specific item/cell, since
  there's no single unambiguous field to jump into for a multi-field block — a
  double-click on the specific item/cell still works immediately once there.

## Recommended next task
Everything in the Development Plan's "Definition of Version 1 Complete" works
end-to-end, the Virtual Editor has a real foundation (Phase 9), and the manuscript is
no longer read-only (Phase 10). Good next steps in priority order: (1) a second real
checker engine on top of the existing `Checker` pattern — Consistency
(terminology/units/spelling-variant matching) is the best next candidate since it's
still fully deterministic, (2) line-level text flow so paragraphs can split across
pages like a real book, (3) justified text and image rotation in the PDF exporter, (4)
proper glyph subsetting once the fontkit bug is understood, (5) the first real
`AiReviewer` (readability is the most self-contained candidate — no layout/print
context needed), (6) EPUB/Kindle export, (7) undo/redo — now that direct editing
exists, this is a more pressing gap than before.
