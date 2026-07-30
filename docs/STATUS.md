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

## Recommended next task
Everything in the Development Plan's "Definition of Version 1 Complete" works
end-to-end, the Virtual Editor has a real foundation (Phase 9) with reliable
navigation and bulk-fix actions (Phase 13), the manuscript is no longer read-only
(Phase 10), the image block feature set (Phase 11 + 12) is now fully WYSIWYG
between screen and PDF, and undo/redo (Phase 14) closes the biggest remaining trust
gap for direct editing and destructive asset/image deletion. Good next steps in
priority order: (1) autosave / periodic version-snapshot history — explicitly
deferred by Phase 14 as its own follow-on milestone, and now unblocked, (2) a second
real checker engine on top of the existing `Checker` pattern — Consistency
(terminology/units/spelling-variant matching) is the best next candidate since it's
still fully deterministic, (3) manually verify the Phase 13 scroll-to-block flow in a
real browser (force-mount + smooth-scroll + auto-edit across a multi-page chapter)
since jsdom couldn't exercise it — and, while in a real browser, also do the Phase 14
Ctrl/Cmd+Z-vs-native-undo spot check noted above, (4) line-level text flow so
paragraphs can split across pages like a real book, (5) justified text and image
rotation in the PDF exporter, (6) proper glyph subsetting once the fontkit bug is
understood, (7) the first real `AiReviewer` (readability is the most self-contained
candidate — no layout/print context needed), (8) EPUB/Kindle export.
