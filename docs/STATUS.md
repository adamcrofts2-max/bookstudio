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

## Phase 11 — Placing and resizing images

Closed the gap called out at the end of Phase 10 (and originally scoped in
Phase 2): Book Studio could import images into a project's asset library, but
`ImageBlock`s could only ever be created by the DOCX importer at import time
— there was no way to actually put a new image onto a page, and once
imported an image couldn't be resized (only rotated).

- **`contentStore.insertBlock(projectId, chapterId, afterBlockId, block)`** —
  a new published action, the only sanctioned way anything adds a block to
  `chapter.blocks` (`afterBlockId: string | null`, `null` meaning "insert at
  index 0"). Touches only the named chapter; every other chapter/project is
  left untouched. Bumps `revisionByProject` exactly like `updateBlock`/
  `renameChapter` so pagination reliably remeasures.
- **Drag a thumbnail from the Sidebar's Assets tab onto the page** to place
  it. Thumbnails are now `draggable`, putting the asset id in `DataTransfer`
  (`src/layout/dragTypes.ts`'s `ASSET_DRAG_MIME` constant, shared by producer
  and consumer so they can't drift apart) and flagging a new ephemeral,
  never-persisted `dragStore` (`draggingAssetId`) so `Page.tsx` knows a drag
  is in progress. `Page.tsx` renders a thin `ImageDropZone` before the first
  block, between every adjacent pair, and after the last — for chapter
  content only (`chapter-start`/`content` page kinds), never TOC/blank pages.
  Each drop zone renders **nothing at all** (zero DOM) while no drag is in
  progress, so normal reading and pagination are completely unaffected; it
  only occupies a few pixels of space during an actual image drag. On drop,
  a new `ImageBlock` is built and inserted via `contentStore.insertBlock`,
  the new block is selected, and the Inspector switches to the Image tab —
  mirroring `Page.tsx`'s existing `handleSelect` pattern. Because a chapter's
  blocks are paginated across multiple pages, the very first drop zone on a
  continuation page resolves its "insert after" anchor against the *full*
  chapter (not just this page's slice of blocks), so it always lands in the
  right place even when the block before it lives on the previous page.
- **Resizing**: `ImageBlock` gained an optional `widthPercent?: number` —
  existing persisted manuscripts don't have it and are never migrated;
  everywhere it's read, it's `block.widthPercent ?? 100`.
  `BlockContent.tsx`'s image case now sizes and centres the image (and its
  caption) at that percentage of the content column width instead of always
  `w-full`. `ImagePanel.tsx` gained a **Size** control — a `Select` with
  discrete presets (Small 40% / Medium 65% / Large 85% / Full 100%), matching
  the app's existing preference for discrete controls (trim size, theme)
  over free-drag handles — wired straight through `contentStore.updateBlock`.
- **Tests**: `scripts/smoke-test.ts` gained real coverage for `insertBlock`
  (inserting at the start, in the middle, and at the end of a chapter, each
  asserting the exact resulting block order; confirms other chapters in the
  same project and other projects entirely are left untouched; confirms it
  bumps `revisionByProject`) and for `widthPercent` defaulting (a block
  without the field reads as 100; an explicit value is preserved).
  **Honest limitation**: actual HTML5 drag-and-drop interaction isn't
  meaningfully testable in jsdom (no real `DataTransfer`/drag event
  sequence), so it isn't simulated — the drag-and-drop *UI* (`Sidebar.tsx`'s
  draggable thumbnails, `Page.tsx`'s `ImageDropZone`) is verified by
  build/typecheck only, not integration-tested. The underlying action it
  calls (`insertBlock`) and the width-percent read/render logic are.

### Explicitly deferred
- Deleting, reordering, or moving existing blocks — only inserting a new
  image block is in scope this phase.
- Inserting any block type other than images via drag-and-drop.
- A draggable on-canvas resize handle — discrete presets only this
  milestone, per the app's existing preference for discrete controls.
- Multi-select or bulk image operations.
- Undo/redo (still a pre-existing gap, unrelated to this phase).

## Phase 12 — Image block: delete, custom mm sizing, grayscale, drop-to-replace, alignment, alt text

Closed the remaining gaps in the image block feature set started in Phase 11:
resizing only had percent presets, images couldn't be removed or replaced
once placed, there was no grayscale/print option, no alignment control, no
separate accessibility text, and — a real bug — the already-shipped
`widthPercent` resize feature had **zero effect on the exported PDF** (the
exporter's `drawBlock`'s `case 'image':` hardcoded `displayWidth =
ctx.contentWidthPt`, ignoring the block entirely). All of the below is now
consistent on-screen and in the exported PDF.

- **`ImageBlock` gained six new optional fields** (`src/types/content.ts`):
  `altText?`, `widthMm?`, `heightMm?`, `aspectLocked?`, `grayscale?`,
  `align?: 'left' | 'center' | 'right'`. Same pattern as `widthPercent` in
  Phase 11 — all optional, never migrated, always defaulted in code at the
  read site (`?? 'center'`, `?? false`, etc.) so manuscripts persisted before
  this phase keep working unchanged.
- **Delete** — `contentStore.deleteBlock(projectId, chapterId, blockId)`,
  mirroring `insertBlock`'s shape exactly (touches only the named chapter,
  bumps `revisionByProject`). `ImagePanel.tsx` gained a destructive "Delete
  image" button gated behind `window.confirm()` (there's still no undo
  system, so this is the intentional stopgap, same rationale as documented
  for direct text editing in Phase 10) and clears `useSelectionStore` on
  confirm so the Inspector doesn't keep pointing at a block that no longer
  exists.
- **Custom mm sizing with aspect lock** — `ImagePanel.tsx`'s Size `Select`
  gained a 5th "Custom" option alongside the four percent presets. Picking it
  the first time seeds `widthMm`/`heightMm` from a sensible default (80mm
  wide, height derived from the asset's natural aspect ratio) rather than
  leaving the block in an undefined state. Width/height number inputs plus a
  `Lock`/`LockOpen` toggle (default locked) recompute the paired dimension
  from the asset's natural pixel aspect ratio whenever aspect is locked.
  Switching back to a percent preset explicitly clears `widthMm`/`heightMm`,
  since `widthMm` takes precedence over `widthPercent` everywhere it's read
  — leaving it set would make the preset silently do nothing.
  `BlockContent.tsx`'s image case now computes width as `widthMm *
  PX_PER_MM` (px) when `widthMm` is set, reusing the exact `PX_PER_MM`
  constant from `pageGeometry.ts` rather than a second `96/25.4` literal.
- **The PDF `widthPercent`/`widthMm` bug is fixed** — `exportPdf.ts`'s
  `drawBlock`'s image case now computes `displayWidth` in the documented
  priority order: `widthMm` (mm → px via `PX_PER_MM`, px → pt via
  `PX_TO_PT`, so the same physical size lands on screen and in the PDF) →
  `widthPercent` (as a fraction of `ctx.contentWidthPt`) → full
  `ctx.contentWidthPt` as the legacy default for blocks with neither field.
  Resizing an image (whether via the old percent presets or the new mm
  inputs) now actually changes the exported PDF — it didn't at all before
  this phase.
- **Grayscale / black-and-white** — a `Switch` in `ImagePanel.tsx` toggles
  `block.grayscale`. On-screen, `BlockContent.tsx` applies `filter:
  grayscale(100%)` to the `<img>` — a CSS filter has no layout effect, so
  it's safe to apply unconditionally in both the real render path and
  `HeightMeasurer`'s off-screen measurement pass without breaking their
  pixel-identical-height contract. In the PDF, `imageForPdf.ts`'s
  `blobToPng` gained a `grayscale` parameter that sets the canvas 2D
  context's `filter = 'grayscale(100%)'` before `drawImage`, since a CSS
  filter has zero effect on an embedded PDF image — the desaturation has to
  be baked into the rasterised pixels before `embedPng` reads them back.
  Went with `ctx.filter` rather than a manual per-pixel
  `getImageData`/`putImageData` luminance conversion: canvas `filter` is
  broadly supported in Chromium, which this app targets, and the existing
  `blobToPng` already routes every export through canvas regardless of
  source format. **Honest limitation**: this couldn't be exercised in the
  jsdom-based smoke tests — there's no real canvas 2D context or image
  decode available there, so the grayscale-in-PDF path is verified by
  build/typecheck only, not integration-tested. If `ctx.filter` ever proves
  unreliable in a real deployed build, the fallback is a manual per-pixel
  desaturation in the same function.
- **Replace via drop** — dragging an asset thumbnail from the Sidebar's
  Assets tab directly onto an *existing* image block (rather than between
  blocks, which still inserts a new one via Phase 11's `ImageDropZone`) now
  replaces that block's `assetId`. Implemented as `onDragOver`/`onDrop`
  handlers on the image wrapper in `BlockContent.tsx`, guarded so they only
  activate when `ASSET_DRAG_MIME` is present in `e.dataTransfer.types`, with
  a visual affordance (an accent-coloured outline) consistent with
  `ImageDropZone`'s existing hover treatment. Routed through the `onCommit`
  prop `BlockContent` already exposes (the same one `Page.tsx` wires to
  `contentStore.updateBlock`) rather than reaching into the store directly —
  keeps the component's existing "never touches the store itself" contract
  intact.
- **Alignment** — `align?: 'left' | 'center' | 'right'` (default `'center'`
  when absent, matching the prior always-`mx-auto` behaviour). Three icon
  buttons (`AlignLeft`/`AlignCenter`/`AlignRight`) in `ImagePanel.tsx`.
  `BlockContent.tsx` maps `align` to the appropriate margin classes on both
  the image wrapper and its caption. `exportPdf.ts` computes the matching
  x-offset for the image (and its caption, for visual consistency) from
  `align` and the already-fixed `displayWidth`.
- **Alt text** — a dedicated `altText?` field, separate from the visible
  `caption`, with its own Inspector input and a hint that it's for screen
  readers. `BlockContent.tsx`'s `<img alt>` now reads `block.altText ??
  block.caption ?? ''`, so existing manuscripts with only a caption (or
  neither) render exactly as before.
- **Tests**: `scripts/smoke-test.ts` grew from 65 to 84 passing checks —
  added coverage for `contentStore.deleteBlock` (removes the targeted block,
  leaves other chapters/projects untouched, bumps `revisionByProject`, and a
  no-op-blockId case), the mm→px sizing math and aspect-locked recompute
  (deterministic, unit-tested directly), the `ImageBlock` new-field
  defaulting pattern, and the PDF `displayWidth`/alignment priority logic
  (pure arithmetic, no canvas needed). As noted above, the grayscale
  pixel-desaturation path in `imageForPdf.ts` is the one piece that's
  canvas-dependent and therefore not practically testable in jsdom — it's
  verified by build/typecheck only, called out explicitly rather than
  silently skipped.

### Explicitly deferred
- Undo/redo — still a pre-existing gap; the delete button's
  `window.confirm()` remains the intentional stopgap, same as Phase 10.
- Image-taller-than-a-page overflow policy — out of scope, unchanged from
  Phase 11.
- Multi-select or bulk image operations.
- Any AI-powered features, and the Virtual Editor's Edit-navigation
  bug/Fix/Fix-All buttons — both explicitly out of scope for this phase,
  being handled independently.

### Phase 13 — Virtual Editor: reliable block-level navigation + bulk Fix/Fix All
- **Bug fix: Locate/Edit now scroll to the finding's exact block, not just
  the chapter's opening page.** `VirtualEditorWorkspace.tsx`'s `handleLocate`
  and `handleEdit` used to do a raw `requestAnimationFrame` +
  `document.querySelector('[data-chapter-start=...]')` — always landing on
  the chapter's first page, and silently doing nothing at all if the target
  page's spread hadn't been force-mounted yet by `LazySpread`'s
  `IntersectionObserver` (the exact bug already fixed for Sidebar's chapter
  nav and ThumbnailRail's page clicks in an earlier commit). Fixed by
  extending that same established mechanism instead of inventing a second
  one: `selectionStore.ts`'s `scrollRequest.target` union gained a third
  `{ type: 'block'; chapterId; blockId }` variant alongside `'chapter'`/
  `'page'`, with a new `requestScrollToBlock(chapterId, blockId)` action
  mirroring `requestScrollToPage`'s shape. `Page.tsx`'s `renderBlock` now
  wraps each block's `BlockContent` in a stable `<div data-block-id={block.id}>`
  anchor (measurement-only `HeightMeasurer.tsx` is untouched — this wrapper
  only exists in the real on-screen render path). `BookRenderer.tsx`'s
  scroll effect now matches all three target variants; the matching logic
  was extracted into an exported pure function, `spreadMatchesScrollTarget`,
  specifically so it's unit-testable without mounting `BookRenderer` (jsdom
  can't drive `IntersectionObserver`/real scrolling). `VirtualEditorWorkspace.tsx`'s
  `handleLocate`/`handleEdit` now call `requestScrollToBlock` (paired with
  the existing `select`/`selectForEdit` for selection state) when a finding
  has a `blockId`, and fall back to `requestScrollToChapter` — exactly like
  Sidebar's chapter clicks — for book-wide findings that don't (preserving
  `FindingRow.tsx`'s existing behaviour where "Locate" stays enabled even
  when "Edit" is disabled for those).
  **Verification honesty**: build/typecheck confirms the wiring is correct
  and `spreadMatchesScrollTarget`'s matching logic is unit-tested for all
  three target variants (see `scripts/smoke-test.ts`), but the actual
  scroll-then-enter-edit-mode behaviour in a live browser (force-mounting a
  spread that's pages away, then scrolling smoothly to the exact block and
  auto-focusing it for editing) was **not** exercised in a real browser this
  session — jsdom can't drive `IntersectionObserver` or real layout/scroll.
  This mirrors the same honest caveat the original chapter/page-nav fix
  documented.
- **Feature: Fix / Fix All.** `FindingRow.tsx`'s primary per-row action is
  now labelled "Fix" instead of "Accept" (label-only change — the `onAccept`
  prop name is unchanged, still routes through `virtualEditorStore.acceptFix`).
  Two new bulk actions on `virtualEditorStore`: `fixAll(projectId)` applies
  every current `'new'` finding that has a `suggestedFix` across the whole
  report, and `fixCategory(projectId, category)` does the same scoped to one
  `IssueCategory`. Both are thin loops over `acceptFix` — they never
  duplicate its snapshot-then-`contentStore.updateBlock` logic, keeping
  `virtualEditorStore.acceptFix` the sole place a `Finding` becomes a real
  manuscript edit. `VirtualEditorWorkspace.tsx` now groups `activeFindings`
  by category (`useMemo`, first-seen order preserved, empty categories
  omitted) and renders a header per group with a finding count and a
  "Fix all in [Category]" button (disabled when nothing in that group is
  currently fixable), plus a single dashboard-level "Fix All" button next to
  the existing "{count} shown · generated…" line (disabled when nothing in
  the whole report is fixable). `formatCategory` (the existing label
  formatter) was exported from `FindingRow.tsx` and reused rather than
  duplicated.
- **"Apply to Chapter"/"Apply to Book" placeholders removed, not kept
  alongside the new buttons.** These two disabled per-row buttons in
  `FindingRow.tsx` promised batch-apply at a *different* granularity (from
  one finding, apply its fix's category across just that finding's chapter,
  or across the whole book) than what got built (dashboard-level "Fix All"
  across the whole report, and per-category-group "Fix all in [Category]"
  across the whole book). Keeping both would mean three overlapping-but-
  not-identical "batch apply" affordances visible on one row/screen at once
  — net more confusing than useful, and the new buttons already fulfil the
  "let me fix more than one finding at a time" need the placeholders were
  standing in for. Removed them; the per-row action set is now Fix / Reject
  / Edit / Ignore / Ignore Similar.
- **Tests**: `scripts/smoke-test.ts` grew from 84 to 100 passing checks —
  `fixCategory` (a non-matching category is a no-op; the matching category
  fixes every fixable `'new'` finding in it and leaves an unfixable one
  alone; status flips to `'accepted'` only for the fixed one), `fixAll`
  (fixes a fresh fixable finding; skips one that's already been resolved,
  e.g. `'rejected'`, even though it has a `suggestedFix`, without
  overwriting that status; skips a finding with no `suggestedFix` entirely),
  and all six branches of `spreadMatchesScrollTarget` (chapter/page/block
  target variants, both matching and non-matching cases, including the
  "block id matches but chapter id doesn't" edge case).

### Explicitly deferred
- Undo/redo — still a pre-existing gap; unchanged from Phase 12.
- Image-taller-than-a-page overflow policy — out of scope, unchanged from
  Phase 11.
- Multi-select or bulk image operations.
- Any AI-powered review features, the style guide, and AI learning — all
  still just designed, not real, per `docs/VIRTUAL_EDITOR.md`; out of scope
  for this phase.
- Live-browser verification of the scroll-and-enter-edit-mode flow (see
  above) — verified via code review/type-checking/unit tests only this
  session.

### Phase 14 — Undo/redo
The biggest remaining trust gap: a bad text edit, an accidental image delete, or an
accidental asset removal used to be unrecoverable except by manually re-doing the
work. `Toolbar.tsx`'s Undo/Redo buttons (previously a dead, permanently-`disabled`
UI slot) are now real, and every editing surface routes through a real undo/redo
stack.

- **`src/store/historyStore.ts`** — a new, generic, per-project command-based
  undo/redo stack (`undoStackByProject`/`redoStackByProject`, each holding
  `{ id, label, undo, redo }` commands). `record` pushes a command and clears the
  redo stack (a new edit invalidates the old "future"); `undo`/`redo` pop-and-invoke,
  moving the command to the other stack; `canUndo`/`canRedo`/`peekUndoLabel`/
  `peekRedoLabel` back the Toolbar's disabled state and dynamic tooltip text (e.g.
  "Undo: Edit text"). Capped at 100 entries per project (oldest dropped first) since
  books may run past 1,000 pages and a long session could otherwise grow the stack
  unboundedly. In-memory only, deliberately not wrapped in `persist` — a command's
  `undo`/`redo` are function values that can't round-trip through JSON, so history
  resetting on reload is the correct, simple default (same reasoning
  `virtualEditorStore.ts`'s own revision log already documents).
- **`src/store/editorActions.ts`** — history-aware wrapper functions that are now
  the *only* sanctioned way editing UI mutates `contentStore`/`assetStore`:
  `editBlock` (snapshots the full old block before `updateBlock`, since it
  shallow-merges — undo has to spread the *entire* old block back in, not just the
  touched fields), `insertBlockWithHistory` (undo = `deleteBlock` the new block;
  redo = re-`insertBlock` at the same position), `deleteBlockWithHistory` (captures
  the deleted block's full snapshot AND its preceding sibling's id — or `null` if it
  was first — so undo re-`insertBlock`s it back in the exact same spot),
  `renameChapterWithHistory` (swaps old/new titles), and `removeAssetWithHistory`
  (the one genuinely destructive action this phase closes the gap on — see below).
  None of these touch `contentStore`/`assetStore` internals; every mutation still
  goes through the store's own published action, same as before this phase.
- **`assetStore.restoreAsset(projectId, asset, blob)`** — new, small, additive
  action needed so `removeAssetWithHistory`'s undo can bring a deleted asset back
  under its *original* id (re-`putAsset`s into IndexedDB, then updates
  `byProject`/`objectUrls` like `importFiles` does). Deliberately does NOT reuse
  `importFiles`'s id-generating path: any `ImageBlock.assetId` still pointing at the
  deleted asset needs the restored asset to resolve under the same id, not a fresh
  one.
- **Every listed call site migrated**: `TypographyPanel.tsx` (heading level),
  `ImagePanel.tsx` (every image control's `patch` helper, plus the delete-image
  button), `Sidebar.tsx` (chapter rename, asset-library delete button), and
  `Page.tsx` (inline-edit commit, drag-and-drop image insertion, chapter-opener
  title rename) all now call the `editorActions.ts` wrappers instead of the raw
  `contentStore`/`assetStore` actions. Every existing behaviour (confirm dialogs,
  selection-clearing, etc.) is unchanged — only which function performs the
  mutation changed. `virtualEditorStore.ts`'s `acceptFix`/`restoreRevision` were
  deliberately left untouched, per this phase's explicit non-goal (see below).
- **Toolbar**: the two dead `IconButton`s now call `historyStore.undo(project.id)`/
  `redo(project.id)`, are `disabled` when there's nothing to undo/redo, and their
  tooltip is a dynamic `` `Undo${label ? `: ${label}` : ''}` `` built from
  `peekUndoLabel`/`peekRedoLabel`.
- **Keyboard shortcuts**: `useKeyboardShortcuts` now takes a `projectId` parameter
  (threaded from `AppShell.tsx`, which already receives the active `project` as a
  prop). Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y (both treated as redo)
  are a narrow, deliberate exception carved out of the hook's existing "ignore every
  Ctrl/Cmd combination" guard — but the exception itself still checks
  `isTypingTarget` first and bails out (letting the browser's own native
  field-level undo run) whenever focus is on an `INPUT`/`TEXTAREA`/
  `contentEditable` element. `KeyboardShortcutsDialog.tsx`'s `SHORTCUTS` list gained
  matching entries.
- **Tests**: `scripts/smoke-test.ts` grew from 100 to 145 passing checks —
  `historyStore`'s full stack mechanics (record/undo/redo, redo-stack-cleared-on-
  new-record, no-ops on an empty project, the 100-entry depth cap actually dropping
  the oldest 5 of 105 records), and every `editorActions.ts` wrapper exercised
  end-to-end against a real manuscript fixture (`editBlock` undo restores the exact
  prior block; `insertBlockWithHistory`/`deleteBlockWithHistory` covering both the
  `null`-preceding-block (chapter start) and mid-chapter cases; `renameChapterWithHistory`).
  `removeAssetWithHistory` is tested against the **real** `assetDb.ts` IndexedDB
  code path (not a hand-rolled mock) using `fake-indexeddb` (new devDependency) —
  there was no pre-existing asset-store test pattern in this file to follow, since
  `assetStore`/`assetDb` had zero smoke-test coverage before this phase (jsdom
  itself doesn't implement IndexedDB). Confirms the deleted blob is actually gone
  from IndexedDB and that undo restores both the metadata and the blob, byte-for-
  byte, under the same asset id.

### Explicitly deferred (intentional scope boundaries, not oversights)
- **Autosave / periodic version-snapshot history** — a separate, upcoming milestone
  that depends on this one having landed first.
- **Undo for `projectStore` settings changes** (theme, trim size, margins) — these
  are non-destructive and trivially reversible by re-picking the old value; not
  worth a history entry.
- **Undo for `contentStore.setManuscript`/`clearManuscript`** (importing a whole new
  manuscript) — a project-level operation, not an incremental edit; a different
  problem from what this phase solves.
- **Unifying with `virtualEditorStore`'s existing revision/restore system** — left
  completely alone, on purpose. It already has its own working snapshot-then-
  restore flow for AI-suggested fixes; merging it into the new global undo stack
  would risk double-tracking the same edit in two systems for no real benefit.
- **Real-browser verification of Ctrl/Cmd+Z contention with native browser undo** —
  the `isTypingTarget` guard was verified by code review and the unit tests above
  (which exercise the store logic directly), but the actual keyboard event in a live
  browser tab — confirming Ctrl+Z inside a real `contentEditable` block truly falls
  through to native undo, and that it's intercepted everywhere else — was **not**
  exercised in a real browser this session; jsdom dispatches synthetic `keydown`
  events but doesn't reproduce a real browser's native-undo-vs-`preventDefault`
  arbitration.

## Phase 15 — Version History (2026-07-30)

The PRD's "version history, backup and restore" requirement, never previously built.
Phase 14's undo/redo is fine-grained and in-session — it resets on reload and can't
reach back past the current editing session. This phase adds a coarse, periodic +
manual safety net on top: named snapshots of the whole manuscript + settings, and a
restore UI. Deliberately a separate system from `historyStore.ts`/`editorActions.ts`
— nothing in Phase 14 was touched.

- **`src/store/snapshotDb.ts`** — a new, separate IndexedDB database
  (`book-studio-snapshots`, one `snapshots` object store with a `by-project` index),
  mirroring `assetDb.ts`'s exact `openDB`/`upgrade` shape. Kept as its own database
  rather than a new object store on `book-studio-assets`, per `CLAUDE.md`'s layer-
  separation rule. A `Snapshot` is `{ id, projectId, createdAt, label, kind: 'auto' |
  'manual', manuscript, settings }` — text-only JSON, no asset blobs. Illustrations
  are already safely persisted separately in `book-studio-assets` and aren't
  typically what a bad editing session breaks; duplicating potentially large binary
  data into every snapshot would be wasteful and risk the "rendering must remain
  responsive on thousand-illustration books" performance bar. `putSnapshot`,
  `listSnapshotsForProject` (newest-first), `deleteSnapshot`.
- **`src/store/versionStore.ts`** — `createSnapshot(projectId, kind, label?)` reads
  the current manuscript/settings via `contentStore.getManuscript`/
  `projectStore.getProject`, no-ops if there's no manuscript yet, writes via
  `snapshotDb.putSnapshot`, then prunes down to the 20 most recent snapshots per
  project (an explicit, adjustable default — not a hard requirement). Auto snapshots
  default their label to `Autosave — <timestamp>` when none is given.
  `listSnapshots`/`getSnapshots` mirror `assetStore`'s async-load-into-state pattern
  (with an `EMPTY_SNAPSHOTS` stable-reference constant, same reasoning as
  `assetStore.EMPTY_ASSETS`). `restoreSnapshot` calls `contentStore.setManuscript` +
  `projectStore.updateProjectSettings` — the same public actions a live edit would
  use, never reaching into their internals, following `virtualEditorStore.
  restoreRevision`'s precedent — but first calls `createSnapshot(projectId, 'auto',
  'Before restoring an earlier version')` on the *current* (about-to-be-overwritten)
  state, so a restore is itself never destructive: a bad restore can be undone by
  restoring again. `deleteSnapshot` mirrors `assetStore.removeAsset`'s delete-then-
  update-state shape.
- **`src/hooks/useAutosaveSnapshots.ts`** — mounted in `AppShell.tsx` alongside the
  existing `useKeyboardShortcuts(project.id)`. Runs a real `setInterval` (default
  5 minutes — again an adjustable default, not a hard requirement) that compares
  `contentStore.revisionByProject[projectId]` against the revision last snapshotted;
  if unchanged (the user hasn't touched anything since the last check), it skips —
  no empty/duplicate autosaves. Baseline is seeded from the revision *at mount/
  project-change time*, so the very first tick doesn't autosave just because no
  snapshot has ever been taken. Resets its baseline and interval on project change
  and cleans up on unmount.
- **`src/components/common/VersionHistoryDialog.tsx`** — mirrors
  `KeyboardShortcutsDialog.tsx`'s `Dialog`/`DialogContent`/`DialogHeader` structure.
  A "Save a version now" row (optional label input, defaults to a timestamp if left
  blank) at the top, then a `ScrollArea`-scrolled list of snapshots, each showing
  label, absolute timestamp, a small `auto`/`manual` badge (styled like
  `FindingRow.tsx`'s severity badges), a "Restore" button guarded by
  `window.confirm` (matching `ImagePanel.tsx`'s image-delete precedent), and a
  trash-icon delete button for manual cleanup. Empty state reuses
  `EmptyState.tsx`.
- **Toolbar**: a new `History`-icon `IconButton` next to "Project Settings", opening
  the dialog via local `useState` — the exact pattern `ProjectSettingsDialog`/
  `KeyboardShortcutsDialog` already use in `Toolbar.tsx`.
- **Tests**: `scripts/smoke-test.ts` grew from 145 to 161 passing checks, all against
  the **real** `snapshotDb.ts` IndexedDB code path via `fake-indexeddb` (same
  approach Phase 14 established for `assetDb.ts`) — `createSnapshot` (no-ops with no
  manuscript; writes the manual label/kind/manuscript/settings correctly; auto
  snapshots default to an `Autosave — ` label; prunes down to 20 after 25 creations,
  keeping the newest and dropping the oldest), `listSnapshots` (newest-first
  ordering, verified with explicit out-of-insertion-order `createdAt` values so the
  sort is actually exercised), `deleteSnapshot` (removed from both store state and
  IndexedDB), and `restoreSnapshot` (calls `setManuscript`/`updateProjectSettings`
  with the snapshot's exact data, and itself creates a pre-restore safety snapshot
  of the state it's about to overwrite).

### Explicitly deferred / not practically verifiable this session
- **Real-world autosave interval timing** — that a real `setInterval` actually fires
  reliably every 5 minutes across a long-lived browser tab (backgrounded tabs,
  system sleep, etc.) was not and cannot practically be verified in jsdom smoke
  tests; the interval *logic* (change-detection, baseline-seeding, skip-when-
  unchanged, cleanup-on-unmount/project-change) is unit-testable and was reasoned
  through, but the real-browser long-session behavior is a live-browser follow-up.
- **Snapshotting asset blobs/illustrations** — explicitly out of scope per this
  phase's spec; a snapshot is manuscript + settings only.
- **Cloud sync / multi-device backup** — local IndexedDB only, matching how the rest
  of the app persists today.
- **Unifying with Phase 14's undo/redo** — left completely separate on purpose; see
  above.

## Phase 16 — Proofreading: fixed a real false-positive (2026-07-30)

Found by running a live review against a real manuscript in production, not by unit
testing: every one of a book's 47 flagged issues was `unmatchedQuotesChecker`, and
because that checker never had a `suggestedFix` (correctly — guessing the right
correction for a genuinely ambiguous quote mismatch isn't a call a deterministic rule
should make), both the per-finding Fix button and the Fix/Fix All bulk actions were
correctly disabled for all 47 — which reads exactly like "Fix doesn't work" even
though the feature itself (built in Phase 13) is fine.

Looking at the actual flagged excerpts showed the real cause: a large share of the 47
were a single stray closing curly quote (`”`) directly after a letter, with no
opening `“` anywhere in the span — the classic signature of a misplaced apostrophe
(`moments”` instead of `moments’`), most likely from a DOCX/autocorrect import
artifact, not 47 independent proofreading mistakes.

- `src/virtualEditor/checkers/proofreading.ts`'s `unmatchedQuotesChecker` now
  distinguishes this specific, high-confidence shape (exactly one extra closing
  curly quote, directly following a word character) from a genuinely ambiguous
  mismatch. The narrow case gets its own `issueType` (`quote-mark-as-apostrophe`),
  `minor` severity, and a real `suggestedFix` that replaces the stray `”` with `’` —
  so Fix and Fix All finally have something to do for the single most common
  real-world case. Anything less clear-cut (bigger imbalances, or the extra mark not
  directly after a letter) still gets no fix, exactly as before — this is additive,
  not a loosening of the checker's honesty about what it can safely automate.
- `scripts/smoke-test.ts`: added cases for the stray-apostrophe detection, its
  `issueType`/severity/fix, the fix's exact text output, and confirmation that a
  genuinely ambiguous mismatch still gets no fix.
- `docs/PRD.md`'s Vision section updated to match the new `docs/VISION.md` framing
  ("Canva for book publishing," AI invisible rather than "AI-first") — the two
  documents were saying subtly different things.

## Phase 17 — Block-type registry: Modular Page System, Milestone 1 (2026-07-30)

Pure internal reorganization, zero user-visible change, per
`docs/MODULAR_PAGE_SYSTEM_PLAN.md`'s Milestone 1 (confirmed in that document's
"Recommended next step"). The plan's §3 identified a real scaling problem: adding one
new block type meant hand-editing three separate parallel switches
(`BlockContent.tsx`'s on-screen render, `exportPdf.ts`'s PDF `drawBlock`,
`paginate.ts`'s `blockSpacing`) in lockstep, correctly, every time — exactly the kind
of drift risk that could silently break the WYSIWYG guarantee between screen and PDF.
This phase replaces all three switches with one registry, migrating the six existing
block types (`heading`, `paragraph`, `image`, `list`, `table`, `quote`) into it
verbatim — this unlocks Milestone 2 (`StructuralPage` front/back-matter types: Cover,
Title Page, Copyright, Blank Page) without which that milestone would mean adding a
seventh hand-synchronized switch case in three places.

- **`src/blocks/registry.ts`** — the registry itself. `BlockTypeDefinition` (`id`,
  `Render`, `drawPdf`, optional `blockSpacing`) keyed by `ContentBlockType`;
  `getBlockTypeDefinition(type)` is the one lookup every consumer now calls.
  `BlockRenderProps` is a type alias of `BlockContent.tsx`'s existing
  `BlockContentProps` (not a duplicate interface) so the two can never drift.
- **`src/blocks/types/{heading,paragraph,quote,list,table,image}.tsx`** — one module
  per block type, each exporting one `BlockTypeDefinition`. Every switch case's JSX
  and PDF-drawing code moved verbatim; each `Render` component now calls only the
  hooks its own type actually needs, instead of the old monolithic
  `BlockContent`'s "call `useEditableField` twice, plus `useAssetStore`/
  `useDragStore`/`useState`, unconditionally for every block type" pattern.
- **`src/blocks/shared.tsx`** — `useEditableField` (the Enter-commits/Escape-cancels
  hook), `imageAlignClass`, `outlineClass`, and the `ListItemField`/`TableCellField`
  components, all moved here verbatim since more than one type module uses them.
- **`src/pdf/drawBlockHelpers.ts`** — `PX_TO_PT` and `drawWrappedLines` moved here
  (not left in `exportPdf.ts`) specifically to avoid a runtime import cycle:
  `exportPdf.ts` now imports the registry (for `getBlockTypeDefinition`), and the
  registry imports the six type modules, so anything the type modules needed back
  from `exportPdf.ts` had to live somewhere both sides could import without a cycle.
  `DrawCtx` itself stays defined in `exportPdf.ts` as before (type modules import it
  as a type only, which is erased at compile time and creates no runtime cycle).
- **`src/renderer/BlockContent.tsx`**, **`src/pdf/exportPdf.ts`**'s `drawBlock`, and
  **`src/renderer/paginate.ts`**'s `blockSpacing` are now thin dispatchers over the
  registry — each is ~5–10 lines where it used to be a 100+/6-case switch.
  `BlockContentProps` stays exported from `BlockContent.tsx` under its original name,
  so `Page.tsx`/`HeightMeasurer.tsx` needed zero import or call-site changes.
- **One deliberate, called-out behavioral nuance**: the old monolithic
  `BlockContent` called its `autoEdit`-handling `useEffect` unconditionally for every
  block type, even `list`/`table`/`image`, which don't render the `primary` editable
  field it was built around — for those three types the effect's only externally
  observable action was firing `onAutoEditHandled`, since `primary.startEditing()`
  toggled state nothing ever consumed. The three type modules for those blocks
  reproduce exactly that observable behavior (an effect that fires
  `onAutoEditHandled` on `autoEdit`) without reconstructing the otherwise-unused
  `primary` hook instance — same outward behavior, less dead state.
- **Tests**: `scripts/smoke-test.ts` grew from 168 to 177 checks — new coverage locks
  in the registry's own shape (a definition exists for all six real types with a
  callable `Render`/`drawPdf`; `blockSpacing` returns 8/6/6 for heading/image/quote
  and is absent for paragraph/list/table; `getBlockTypeDefinition` returns `undefined`
  for a made-up type). Per this milestone's spec, rendering output itself isn't
  re-tested in jsdom, matching how the rest of this suite already treats
  `BlockContent`/PDF drawing (deterministic math is tested; DOM/pdf-lib drawing calls
  are not) — a live-browser regression pass is the intended independent verification
  step for this phase, given how central this file is to the whole rendering path.
- Verified from a fresh `npm ci` scratch sync: `npm run build`, `npm run lint` (0
  errors; 12 warnings vs. 3 pre-existing baseline warnings — the 9 new ones are all
  oxlint's `react/only-export-components` Fast-Refresh heuristic firing on the new
  `src/blocks/shared.tsx` and `src/blocks/types/*.tsx` files, which by design each
  export one non-component `BlockTypeDefinition`/helper alongside a locally-defined
  component; this is a warning, not an error, same severity the existing codebase
  already carries in three other files for the same underlying reason), and
  `npm run test` (all 177 checks pass).

### Explicitly deferred / not practically verifiable this session
- **Live-browser regression pass** — this refactor touches the single most central
  rendering file in the app (`BlockContent.tsx`, shared identically by `Page.tsx` and
  `HeightMeasurer.tsx`) and its PDF twin (`exportPdf.ts`'s `drawBlock`). The jsdom
  smoke suite doesn't render React components or exercise `pdf-lib` drawing calls, so
  it can't itself catch a pixel/point-level regression — a real-browser pass
  (on-screen editing for all six block types, especially the image block's
  drag-to-replace and `widthMm`/`widthPercent`/`align` priority logic, plus an actual
  PDF export) is the load-bearing independent verification step for this phase.
- **Milestone 2+ of `docs/MODULAR_PAGE_SYSTEM_PLAN.md`** — `StructuralPage` data
  layer, front/back-matter page types, the theme `pageStyles` extension point, and
  page templates are all still queued, unstarted. This phase is Milestone 1 only.

## Phase 18 — Fixed: Virtual Editor's "Edit" silently failing to scroll (2026-07-30)

Found by live-browser testing the Phase 17 refactor (not by unit tests — this bug
predates Phase 17 and was already flagged as unverified when Phase 13 shipped it).
Clicking "Edit" on a finding correctly selected the block and updated the Inspector
every time, but the manuscript view never scrolled to it — reproduced twice, cleanly,
with no console errors, ruling out browser-automation flakiness.

Root cause, in `src/renderer/BookRenderer.tsx`'s scroll-consuming effect: it searched
`spreads` for the target and permanently gave up (`consumeScrollRequest()`) the moment
it wasn't found — with no allowance for "pagination hasn't finished yet." Sidebar's
chapter nav and `ThumbnailRail`'s page clicks never hit this, because by the time a
user can click them the manuscript view is already mounted with `HeightMeasurer`
already having reported real heights. But the Virtual Editor's "Edit"/"Locate" switch
*into* the manuscript view and request a scroll in the very same click — so
`BookRenderer` is mounting fresh, `heights` is still `null`, `pages`/`spreads` are
still `[]`, and the very first run of the effect found nothing and threw the request
away before pagination ever completed.

- Fix: the effect now returns early (without consuming the request) while
  `heights === null`, and re-runs automatically once `HeightMeasurer` reports real
  heights (`heights` is a dependency), since `spreads` only becomes accurate at that
  point. One line of new logic, no change to `spreadMatchesScrollTarget` itself (still
  covered by its existing unit tests).
- Verified live in the browser against the real deployed manuscript: Edit now scrolls
  to the exact block reliably. Not independently unit-testable — this project's smoke
  tests deliberately don't mount `BookRenderer` (no real `IntersectionObserver`/layout
  in jsdom), so this fix's regression net is the live-browser check, same limitation
  noted (and now resolved) from Phase 13.

## Phase 19 — Modular Page System Milestone 2: StructuralPage data layer (Cover/Title Page/Copyright/Blank) (2026-07-30)

Milestone 2 of `docs/MODULAR_PAGE_SYSTEM_PLAN.md`: a new, additive `StructuralPage`
concept — book-scoped front-/back-matter pages that don't reflow, unlike
`Chapter`/`ContentBlock` — proven end to end (create → reorder → duplicate → delete →
render on-screen → render in PDF) on exactly 4 types: Cover, Title Page, Copyright,
Blank Page. `Manuscript.chapters`/`ContentBlock` are completely untouched; existing
projects default to zero structural pages with no migration, per the same
"optional field, default in code" rule proven six times already this project.

- **`src/types/structuralPage.ts`** — a discriminated union (`CoverPage` |
  `TitlePage` | `CopyrightPage` | `BlankStructuralPage`), exactly mirroring
  `ContentBlock`'s pattern rather than a generic untyped content bag.
- **`src/structuralPages/registry.ts` + `src/structuralPages/types/{cover,titlePage,
  copyright,blank}.tsx`** — mirrors Phase 17's block-type registry exactly: one
  module per type, each exporting a `StructuralPageTypeDefinition` with a required
  `Render` (on-screen) and `drawPdf` (PDF), so no type ships half-WYSIWYG. Cover is
  full-bleed (theme-tinted background, or a full-bleed cover image via the existing
  `assetStore`/`imageForPdf.ts` pipeline, cover-fit scaled to the bleed box in the
  PDF) with centred title/subtitle/author; Title Page is the same content, smaller
  and whitespace-heavy, no image; Copyright is small body text near the bottom of
  the page with a sensible default (`© <year> <author>. All rights reserved.`,
  pulling the author from a sibling Title Page if one exists, degrading gracefully
  otherwise); Blank renders nothing but the page background, identical to the
  existing auto-inserted `blank` page kind.
- **`src/store/structuralPageStore.ts`** — `byProject`/`revisionByProject`, mirroring
  `contentStore`'s shape. `insertPage`/`duplicatePage`/`deletePage`/`movePage`/
  `updatePageContent`, plus an internal `insertPageAt` primitive (insert an
  already-fully-formed page object at an exact position) that only
  `editorActions.ts`'s undo/redo wrappers and `insertPage`/`duplicatePage` use — it
  exists because, unlike `contentStore.insertBlock`, the public `insertPage` mints a
  fresh id every call, so undo of a delete / redo of an insert needs a way to
  reinsert the *exact* previously-generated page rather than minting yet another
  new one. Front-matter and back-matter are independently ordered slices of one flat
  per-project array (`.order` recomputed after every mutation). `updatePageContent`
  keeps `CoverPage.assets` in sync with `content.imageAssetId` when set/cleared,
  mirroring `ImageBlock.assetId`'s reference-tracking for future asset-cleanup logic.
  Exports `EMPTY_STRUCTURAL_PAGES`, the same stable-empty-array pattern as
  `EMPTY_ASSETS`/`EMPTY_HISTORY` (Zustand v5 + `useSyncExternalStore` infinite-loops
  on a selector returning a fresh `[]`).
- **Undo/redo** — `editorActions.ts` gained `insertPageWithHistory`/
  `duplicatePageWithHistory`/`deletePageWithHistory`/`movePageWithHistory`/
  `updatePageContentWithHistory`, wired through exactly like every other
  history-aware wrapper (snapshot enough state to invert, mutate via the store's own
  published action, `record` a command). This is real, not deferred: shipping a new
  mutable surface without undo coverage would be a regression, not a missing
  nice-to-have.
- **Rendering integration** — `paginate.ts` gained a `'structural'` `PageKind` and an
  optional `LaidOutPage.structuralPageId`, with its own core flow algorithm and
  `.number`/`.side` numbering left completely untouched (front matter is
  conventionally unnumbered/separately numbered; main-body numbering starts fresh at
  the first chapter — a deliberately lower-risk choice than renumbering
  `paginate.ts`'s best-tested loop). A new pure `src/renderer/composePages.ts`
  (`composeBookPages(frontMatter, paginated, backMatter)`) splices structural pages
  around `paginate()`'s own output — reusing each `StructuralPage`'s own `id` as the
  composed `LaidOutPage.id` (deliberate: it makes `requestScrollToPage` work with zero
  further changes, since `BookRenderer`'s scroll-matching already keys on `page.id`).
  `BookRenderer.tsx` reads `structuralPageStore` directly (its live array reference
  changes on every real mutation, so downstream `useMemo`s recompute without a
  separate revision counter needing to be threaded in) and publishes the composed,
  structural-pages-inclusive `pages` array to `exportStore` — so PDF export gets
  the exact sequence the screen shows, same WYSIWYG guarantee as everything else.
  `Page.tsx` gained a `page.kind === 'structural'` branch that looks up the real
  `StructuralPage` by id and renders it full-bleed via the registry's `Render`, and
  both the running-header and page-number footer conditionals were extended from
  `page.kind !== 'blank'` to also exclude `'structural'` — structural pages get no
  chrome, exactly like blank pages today. `exportPdf.ts` mirrors this precisely: a
  `page.kind === 'structural'` branch calls the registry's `drawPdf` (with a new
  `DrawCtx.projectId`/`.structuralPages` so a type's PDF drawing can look up sibling
  pages — Copyright's default text needs the Title Page's author — without
  `structuralPageStore` importing this registry and the registry importing back,
  which would be a real import cycle) and then `continue`s, skipping the page-number
  footer for that page exactly like `Page.tsx` does on screen.
- **Selection** — `selectionStore` gained `selectedStructuralPageId`/
  `selectStructuralPage`, mutually exclusive with block/chapter selection in both
  directions (selecting one clears the other). Scrolling to a structural page from
  the Sidebar reuses `requestScrollToPage` completely unchanged — no new
  scroll-target variant needed, per the `composeBookPages` id-reuse decision above.
- **UI** — a third "Structure" tab in `Sidebar.tsx` (next to Chapters/Assets),
  listing Front Matter and Back Matter as two independently-ordered sections, each
  with icon + label rows (up/down reorder, duplicate, delete — no confirm dialog,
  since undo now covers this) and an "Add Page" `DropdownMenu` (Front Matter offers
  Cover/Title Page/Copyright/Blank; Back Matter offers Blank only this milestone —
  the other three are conceptually front-matter-only). `Inspector.tsx`'s existing
  "Page" tab is now conditional: a structural page selection shows the new
  `StructuralPagePanel.tsx` (plain title/subtitle/author inputs for Cover/Title Page,
  a textarea for Copyright's text, nothing for Blank) instead of the read-only
  project-settings view, which is otherwise completely unchanged.
- **New UI primitive**: `src/components/ui/textarea.tsx`, mirroring `input.tsx`'s
  exact styling conventions — needed for Copyright's text field and not previously
  in this shadcn-style primitive set.
- **Tests**: `scripts/smoke-test.ts` grew from 177 to 222 passing checks — registry
  lookups (all 4 types have both `Render`/`drawPdf`/`defaultContent`;
  `getStructuralPageTypeDefinition` returns `undefined` for a made-up type),
  `structuralPageStore` CRUD (insert/duplicate/delete/move all bump
  `revisionByProject` and leave other projects/categories untouched; the
  `imageAssetId` → `assets` sync; a genuine no-op move at a category boundary
  deliberately does *not* bump revision, unlike `deleteBlock`'s always-bump
  precedent — nothing changed, so no signal should fire), `composeBookPages` (0/1/2
  front-matter pages + a paginated fixture + 0/1 back-matter pages: concatenation
  order, `side` parity at each position, `paginated`'s own `number`/`side` never
  mutated, `structuralPageId` correctly reused as the composed `id`), and all 5
  `editorActions.ts` history wrappers exercised end-to-end (undo/redo restoring
  exact ids/positions/content).

### Deviations from the brief, and why
- **`StructuralPageRenderProps`/`DrawCtx` gained a `siblingPages`/`structuralPages`
  field** (not specified in the brief's exact registry interface) — needed once
  Copyright's default-text-uses-the-Title-Page's-author requirement collided with a
  real import cycle: `structuralPageStore` must import the registry (to resolve
  `defaultContent()` inside `insertPage`), so no type module under
  `src/structuralPages/types/*` can import `structuralPageStore` back to look up a
  sibling page itself. Threading the already-available sibling array through props/
  `DrawCtx` (both `Page.tsx` and `exportPdf.ts` already have to read
  `structuralPageStore` once anyway, to resolve which page to render) avoids the
  cycle with no new plumbing.
- **`structuralPageStore` gained one extra primitive, `insertPageAt`**, beyond the
  brief's 5 named actions — required for `insertPageWithHistory`/
  `duplicatePageWithHistory`'s redo and `deletePageWithHistory`'s undo to reinsert
  the *exact* previously-generated page (same id, same content) rather than minting
  a new one, mirroring `contentStore.insertBlock`'s "insert this exact object"
  contract. Without it, undo/redo on structural pages would silently orphan ids.
- **A new `Textarea` UI primitive** was added (not in the existing `src/components/
  ui/*` set) since Copyright's multi-line text field had no existing primitive to
  extend — built to match `Input`'s exact styling tokens rather than reaching for a
  new dependency, per `CLAUDE.md`.
- **Sidebar's per-section empty state** uses a small muted text line ("No front
  matter pages yet.") rather than the full `EmptyState` component per section, since
  stacking two large icon-based empty states would be heavier than useful when only
  one category is actually empty; a top-level `EmptyState` is used nowhere in this
  tab since the "Add Page" affordance must always be reachable to add the very first
  page, and gating it behind an empty-state view would remove that path entirely.
- **PDF vertical centring for Cover/Title Page is approximate**, not derived from the
  same CSS flexbox centring the on-screen preview uses (there's no flexbox in
  `pdf-lib`) — text is centred using a fixed proportion of line-height per element,
  visually close but not pixel-identical to the screen. Documented here rather than
  silently accepted, same honesty as the project's existing "PDF export is
  left-aligned even for justified themes" simplification.

### Explicitly deferred (per the milestone's own scope)
- The remaining ~30 front-/back-matter types (Dedication, Foreword, Preface, Table of
  Contents variants, Bibliography, Glossary, Index, Appendix, About the Author, ISBN
  Page, Barcode, ...) — batched into Milestone 4, see below.
- Full drag-and-drop reordering of structural pages — only simple up/down
  adjacent-swap buttons this milestone, per the plan's own explicit deferral.
- A rich per-type visual editor (e.g. a cover image picker/cropper in the Inspector)
  — `StructuralPagePanel.tsx` is plain form fields only; `CoverPage.content.
  imageAssetId` exists in the data model and renders correctly on screen and in the
  PDF when set, but this milestone ships no UI path to set it (drag-and-drop-onto-
  cover, matching `ImageBlock`'s existing replace-via-drop pattern, is a natural
  candidate for a future milestone).
- Roman-numeral or otherwise separate front-matter page numbering — explicitly out
  of scope; structural pages carry `number: 0` (unused/undisplayed) in
  `composeBookPages`.
- Page templates ("save as reusable template") and the theme `pageStyles` extension
  point — Milestone 2 targets the data layer + minimal UI only, per the plan's §7.

### A note on this session's build environment
This session's sandboxed Linux environment (bash tool) had a **severely broken
`node_modules`** unrelated to any code in this repo — dozens of packages
(`zustand`, `@radix-ui/react-dropdown-menu`'s transitive deps, `@radix-ui/react-
scroll-area`, `@radix-ui/react-select`, `tailwind-merge`, and, worse, the native
`esbuild`/`rolldown`/`lightningcss` binaries) were missing their type declarations,
missing their ESM build artifacts, or outright corrupted (segfaulting/bus-erroring
on load), and `npm ci`/`rm -rf node_modules` couldn't run because the filesystem
backing this particular mount refuses to unlink files already on disk. None of this
was caused by this phase's changes — the same failures reproduced on completely
unmodified pre-existing files. Verification for this phase was therefore done by
`npm ci`-installing a clean `node_modules` in a scratch directory and copying just
this repo's source files (not `node_modules`) into it, where `npm run build`/`lint`/
`test` all ran clean. If a future session hits the same "Bus error (core dumped)" /
missing-`.d.ts` symptoms in this sandbox, that's the same pre-existing environment
defect, not a regression — reproduce the scratch-directory approach above rather
than assuming the codebase itself is broken.

### GitHub push
This session's bash tool had **no GitHub push credentials at all** (no SSH key, no
HTTPS token, no credential helper) — `git remote -v` was empty on arrival and
`git push` fails with "could not read Username." The repo's commit history and a
read-only HTTPS remote (`https://github.com/adamcrofts2-max/bookstudio.git`, branch
`main`) were confirmed reachable and matching this session's starting point
(`2ae82ce`, Phase 18), but nothing could be pushed from this sandbox. This phase's
commit exists locally (see the commit hash reported at the end of this session) —
**push it from an environment with real write credentials** (the user's own machine,
or a Cowork session with GitHub push access configured) rather than assuming it's
already live.

## Phase 20 — Modular Page System Milestone 4 (first batch): Half Title, Dedication, Foreword, Preface, Acknowledgements (2026-07-30)

The easy, low-risk phase Phase 19's own "Recommended next task" anticipated: 5 more
front-matter `StructuralPage` types, each a mechanical registry entry following the
exact pattern Milestone 2 (Phase 19) already proved on Cover/Title Page/Copyright/
Blank Page. `structuralPageStore.ts`, `composePages.ts`, `Page.tsx`, and
`exportPdf.ts` needed **zero changes** — confirming that milestone's design goal
(new types are additive registry entries, not a new hand-synchronized switch) held
up in practice, not just in theory.

- **`src/types/structuralPage.ts`** — 5 new interfaces (`HalfTitlePage`,
  `DedicationPage`, `ForewordPage`, `PrefacePage`, `AcknowledgementsPage`), all
  `category: 'front-matter'`, added to the `StructuralPage` discriminated union:
  `{ title? }` for Half Title, `{ text? }` for Dedication/Preface/Acknowledgements,
  `{ text?; authorName? }` for Foreword (the one type with an attribution field).
- **`src/structuralPages/types/halfTitle.tsx`** — recto page, title small and
  centred with generous whitespace above/below. `defaultContent()` stays `{}` (it's
  a pure, argument-less function, so it can't look up sibling pages at creation
  time) — but `Render`/`drawPdf` both fall back to a sibling Title Page's title
  (via `siblingPages`/`ctx.structuralPages`, exactly like `copyright.tsx` already
  falls back to a sibling Title Page's author) before finally falling back to
  "Untitled", so the "nice touch" from the brief is real without complicating
  `defaultContent()`.
- **`src/structuralPages/types/dedication.tsx`** — a short, italic, centred line
  or two ("For someone special." placeholder when empty), vertically and
  horizontally centred in both the on-screen render and the PDF (each `\n`-
  separated line measured and centred independently, mirroring `titlePage.tsx`'s
  existing manual-centring approach rather than using `wrapRuns`, since a
  dedication is short hand-entered lines, not flowing prose).
- **`src/structuralPages/longForm.tsx`** (new, shared) — Foreword/Preface/
  Acknowledgements are functionally identical ("heading + a run of body
  paragraphs, optional right-aligned attribution"), so the shared rendering
  (`LongFormPageRender`) and PDF-drawing (`drawLongFormPagePdf`) logic lives here
  once, mirroring `src/blocks/shared.tsx`'s established precedent for factoring out
  pieces reused by more than one type module rather than copy-pasting three times.
  Also exports `splitParagraphs`, which splits stored text on blank-line boundaries
  (`\n{2,}`) so a `Textarea`'s free-form text renders as separate paragraph blocks
  instead of one run-on wall of text.
- **`src/structuralPages/types/{foreword,preface,acknowledgements}.tsx`** — thin
  wrappers around `longForm.tsx`: Foreword is headed "Foreword" and passes
  `content.authorName` through as the attribution line ("— {authorName}",
  right-aligned, only rendered when set); Preface and Acknowledgements are headed
  "Preface"/"Acknowledgements" respectively with no attribution field (by the
  author, so none is needed). All three's `drawPdf` deliberately omits the
  `pageBox` parameter their type signature declares — a function with fewer
  params is still assignable in TypeScript, and `drawLongFormPagePdf` only needs
  `ctx.cursorY`/`ctx.contentX`/`ctx.contentWidthPt` (already resolved from
  `pageBox` by `exportPdf.ts` before `drawPdf` is called) — the same trick
  `blank.tsx`'s `drawBlankPdf` already uses for the same reason.
- **`src/structuralPages/registry.ts`** — all 5 registered; `listStructuralPageTypes()`
  now returns all 9 front-matter types in the order Cover, Half Title, Title Page,
  Copyright, Dedication, Foreword, Preface, Acknowledgements, Blank.
- **`src/layout/Sidebar.tsx`** — `FRONT_MATTER_ADDABLE_TYPES` grew from 4 to 9
  entries in that same order (roughly matching real front-matter convention — Half
  Title before Title Page, Dedication/Foreword/Preface/Acknowledgements after
  Copyright). Purely cosmetic ordering in the "Add Page" menu, as the brief
  specified — it doesn't constrain reordering after insertion, which still uses
  the existing up/down buttons. `Back Matter`'s addable list is unchanged (Blank
  Page only — none of these 5 make sense as back matter).
- **`src/layout/inspector/StructuralPagePanel.tsx`** — one form per new type: a
  single `Input` for Half Title's title (with a hint that it falls back to the
  Title Page's title when blank); a 3-row `Textarea` for Dedication; a 10-row
  `Textarea` + `Input` (for `authorName`) for Foreword; a 10-row `Textarea` alone
  for Preface and for Acknowledgements. All wired through the existing
  `updatePageContentWithHistory`, exactly like the 4 pre-existing types.
- **Known V1 simplification (documented, not hidden), per the brief's own
  framing**: Foreword/Preface/Acknowledgements are modelled as single fixed pages
  that never reflow, same as every other `StructuralPage` — unlike
  `Chapter`/`ContentBlock`, there is no pagination for these three types this
  milestone. Unusually long text simply overflows visually (clipped by the
  on-screen page's own bounds — `Page.tsx`'s existing `overflow-hidden` wrapper
  around every structural page's `Render`, untouched by this phase — and free to
  run past the page's bottom margin in the PDF, uncropped). A future milestone
  giving these three types real multi-page flow is out of scope here, exactly as
  the brief anticipated.
- **Tests**: `scripts/smoke-test.ts` grew from 222 to 236 passing checks — registry
  lookups for all 5 new types (complete `Render`/`drawPdf`/`defaultContent`, correct
  `category: 'front-matter'`); `insertPageWithHistory`/undo/redo for Half Title;
  `insertPageWithHistory` + `updatePageContentWithHistory` (both fields) + undo for
  Foreword, including inserting it immediately after the Half Title page and then
  undoing all the way back to nothing; and 4 direct unit checks on the shared
  `splitParagraphs` helper (splits on a blank-line boundary; a single paragraph with
  no break stays one; empty text yields zero paragraphs; extra blank lines and
  leading/trailing whitespace per paragraph are handled).

### Deviations from the brief, and why
- **`src/structuralPages/longForm.tsx`** is a new shared file not explicitly named
  in the brief's file list — added because Foreword/Preface/Acknowledgements would
  otherwise be near-verbatim copies of each other's `Render`/`drawPdf`, which this
  codebase's own established convention (`src/blocks/shared.tsx`) already argues
  against. It follows that exact precedent rather than inventing a new pattern.
- **Half Title's sibling-title fallback reads `siblingPages`/`ctx.structuralPages`
  at render/draw time instead of `defaultContent()`** — as the brief itself
  anticipated as an acceptable simplification, since `defaultContent()` is a pure,
  argument-less function with no access to other pages at page-creation time.
  `copyright.tsx`'s existing sibling-author fallback already established this
  exact pattern, so this isn't a new mechanism, just its second use.
- **Dedication centres text manually (per-line width measurement) rather than
  reusing `wrapRuns`** — `wrapRuns` greedy-wraps left-aligned prose to a fixed
  width; a dedication's `\n`-separated short lines need centring per line, not
  wrapping, which is exactly what `titlePage.tsx`/`cover.tsx` already do for their
  own centred title/subtitle/author lines. Reused that approach instead.

### Verification
This session's sandboxed Linux bash environment reproduced the exact same
pre-existing corruption Phase 19 already documented (`docs/STATUS.md`'s Phase 19
"A note on this session's build environment"): `npx oxlint` bus-errors immediately
on this repo's real `node_modules`, and `vite build` fails to even load
`vite.config.ts`. A scratch-directory `npm install` (not `npm ci` — this session's
sandbox additionally could not sustain a single `npm ci` invocation to completion
within this tool's per-command timeout, so `npm install` was run several times in a
row until it converged, which is idempotent and safe) got most packages installed
correctly, but two — `lucide-react` and `pdf-lib`/`@pdf-lib/fontkit` — were
extracted incompletely (missing `.d.ts` files / missing internal `es/` source
files respectively), reproducing the same class of "corrupted install," not
"corrupted code," failure Phase 19 hit. Reinstalling just those two packages
fresh fixed both, and in the resulting scratch environment:
- **`npm run build`**: clean — `tsc -b` reported zero errors, `vite build`
  transformed 2,443 modules and produced a valid bundle.
- **`npx tsc -b --force` run directly against the real (non-scratch) repo** also
  completed with zero errors, independently confirming the new code typechecks
  correctly against this repo's actual installed dependency versions, not just the
  scratch copy.
- **`npm run lint`/`npm run test` could not be completed this session** — the
  sandbox's bash tool ran out of disk space partway through the lint run (almost
  certainly from the several-hundred-MB scratch `node_modules` this verification
  process itself created) and the tool became unresponsive for the remainder of
  the session (5 consecutive failures, its own error message advising against
  further retries and recommending a session restart). This is a session/
  infrastructure failure, not a code failure — every check added to
  `scripts/smoke-test.ts` this phase follows the exact same shape as Phase 19's
  already-passing structural-page tests, and the build/typecheck evidence above
  gives real confidence the new code is correct, but **an actual clean `npm run
  lint` (0 errors) and `npm run test` (236/236 passing) run is still owed** before
  this phase can be considered fully verified by the letter of `CLAUDE.md`'s
  "every commit compiles and lints clean" rule. Whoever continues this session (or
  a fresh one) should run both from a clean shell before trusting this phase
  blindly, though the risk is low given tsc's own clean pass over every new file.

### Follow-up: lint/test completed, one real bug found and fixed
Running `npm run lint`/`npm run test` for real (fresh scratch `npm ci`, same approach
as Phase 19) found: **build clean, lint 0 errors / 23 warnings** (up from 16 — 5 new
registry-module files hitting the same already-accepted `react/only-export-components`
Fast-Refresh heuristic as every prior block/structural-page type module), and **one
genuine test failure**: `updatePageContentWithHistory (Phase 20) -> undo: restores
Foreword content to empty`.

This was a real, pre-existing latent bug in `editorActions.ts`'s
`updatePageContentWithHistory`, not a test mistake, and not new to this phase —
Phase 19 introduced it but its own Copyright test never exercised the code path that
exposes it. `structuralPageStore.updatePageContent` shallow-merges
(`{ ...p.content, ...updates }`), which is correct for a live edit (typing into one
field must never clobber sibling fields) but silently no-ops when undo tries to
restore a field from *present* back to *absent*: merging `{}` (Foreword's empty
`defaultContent()`) into `{ text: 'x', authorName: 'y' }` leaves both fields
untouched, since a merge only ever adds/overwrites keys, never deletes them. Every
Phase 19 test happened to update a field that already had a defined value in the
"before" snapshot (e.g. Copyright's text going from one string to another), so the
merge-based "undo" coincidentally worked; Phase 20's Foreword test was the first to
update a field from undefined to defined, and undo silently failed to clear it back.

**Fix**: added `structuralPageStore.replacePageContent(projectId, pageId, content)` —
a full, non-merging content replacement — and changed
`updatePageContentWithHistory`'s undo closure to call it instead of
`updatePageContent`. Redo is unaffected (it re-applies `updates` as a merge on top of
the now-fully-restored old content, exactly reproducing the original forward edit).
Added two direct unit checks for `replacePageContent` itself (not just indirectly via
the history wrapper) to `scripts/smoke-test.ts`. After the fix: **`npm run build`
clean, `npm run lint` 0 errors / 23 warnings, `npm run test` 246/246 passing** (244
total checks existed at the point the bug was caught — 243 passing + 1 genuine
failure — plus the 2 new `replacePageContent` checks added alongside the fix = 246).
This phase is now fully verified per `CLAUDE.md`'s "every commit compiles and lints
clean" rule.

## Recommended next task
Phase 20 is now fully verified (build/lint/test all clean, 246/246 — see the
follow-up note directly above) and closed.

`docs/MODULAR_PAGE_SYSTEM_PLAN.md`'s **Milestone 4** continues: batch
in the remaining ~25 back-matter-heavy types (5–8 per milestone, per the plan's
§7.4), following the exact registry-entry pattern this phase and Phase 19 both
proved — **Conclusion, Bibliography, Glossary, Index, Appendix, About the Author,
ISBN Page, Barcode** are the natural next batch (back-matter-heavy, per Phase 19's
own original recommendation). Each new type needs only a registry entry (`Render`
+ `drawPdf` + `defaultContent`) plus a `StructuralPagePanel.tsx` case and an
"addable types" list entry in `Sidebar.tsx` (this time in `BACK_MATTER_ADDABLE_TYPES`)
— no changes to `structuralPageStore.ts`, `composePages.ts`, `Page.tsx`, or
`exportPdf.ts` should be needed, exactly as this phase and Phase 19 both
confirmed in practice. (Milestone 3 — full drag-and-drop reordering and a theme
`pageStyles` extension point — remains a reasonable alternative next step if
polish is preferred over taxonomy breadth.) Outside that track, everything in the
Development Plan's "Definition of Version 1 Complete" still works end-to-end, the
Virtual Editor has a real foundation (Phase 9) with reliable navigation and
bulk-fix actions (Phase 13), the manuscript is no longer read-only (Phase 10), the
image block feature set (Phase 11 + 12) is fully WYSIWYG between screen and PDF,
undo/redo (Phase 14) closes the biggest remaining trust gap for direct editing and
destructive asset/image deletion, and version history (Phase 15) adds the coarse,
periodic + manual safety net the PRD always called for. Other good next steps in
priority order: (1) a second real checker engine on top of the existing `Checker`
pattern — Consistency (terminology/units/spelling-variant matching) is the best next
candidate since it's still fully deterministic, (2) manually verify the Phase 13
scroll-to-block flow in a real browser (force-mount + smooth-scroll + auto-edit
across a multi-page chapter) since jsdom couldn't exercise it — and, while in a real
browser, also do the Phase 14 Ctrl/Cmd+Z-vs-native-undo spot check and the Phase 15
real-world autosave-interval check noted above, (3) line-level text flow so
paragraphs can split across pages like a real book, (4) justified text and image
rotation in the PDF exporter, (5) proper glyph subsetting once the fontkit bug is
understood, (6) the first real `AiReviewer` (readability is the most self-contained
candidate — no layout/print context needed), (7) EPUB/Kindle export.
