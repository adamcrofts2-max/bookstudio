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

### Incident (2026-07-31): pushes silently stopped reaching the live app for ~5 phases
This local checkout's branch is named `master`, not `main`. Every push this session
(Phase 21's docs follow-up through Phase 24) went to `origin master` — which exists on
the remote as its own, separate branch — while Vercel's auto-deploy (see above) only
ever watches `origin main`. `main` had been silently stuck at the Milestone 4b commit
(`8728312`) the whole time. Every "verified live in the browser" claim across that span
was unknowingly re-testing that same stale deployed build, not the new commits — the
live-browser checks themselves were run correctly, they just weren't checking what they
were meant to. Caught only when Phase 24's new Style Guide dialog section didn't appear
live despite a clean local commit and push. Fixed by fast-forwarding `main` to `master`'s
tip (`git push origin master:main` — safe here since `main`'s commit was a real ancestor
of `master`, confirmed via `git merge-base --is-ancestor` before pushing). **Going
forward, every push in this repo must target `origin main` directly (`git push <remote>
master:main`), not `origin master`**, or re-verify after every push that `main`'s remote
ref actually advanced (`git ls-remote --heads origin`) before trusting a live-browser
check.

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

## Phase 21 — Modular Page System Milestone 4 (second batch): Conclusion, Appendix, About the Author, Bibliography, Glossary, Index, ISBN Page, Barcode (2026-07-30)

The second, back-matter-heavy batch of `docs/MODULAR_PAGE_SYSTEM_PLAN.md`'s
Milestone 4, per Phase 20's own "Recommended next task." Eight new
`StructuralPage` types, all `category: 'back-matter'`, each a mechanical
registry entry following the exact pattern Phases 19–20 already proved.
`structuralPageStore.ts`, `composePages.ts`, `paginate.ts`, `Page.tsx`'s
structural-page dispatch, and `exportPdf.ts`'s page loop needed **zero
changes** — confirming, a third time, that new structural page types really
are additive registry entries and not a hand-synchronized switch.

- **Conclusion, Appendix** — both reuse `src/structuralPages/longForm.tsx`'s
  shared "heading + paragraphs" `LongFormPageRender`/`drawLongFormPagePdf`
  helpers exactly like Preface/Acknowledgements did in Phase 20. Appendix is
  the one variant with an *editable* heading (`content.title`, falling back
  to "Appendix" when empty) since books commonly have several appendices
  each needing a distinct title (e.g. "Appendix A: Plant Species List").
- **About the Author** (`about-the-author`) — heading + bio paragraphs, plus
  an optional author photo via the exact same `imageAssetId` +
  `assetStore`/`imageForPdf.ts` embedding pipeline `cover.tsx` proved in
  Phase 19 (a small centred circular portrait rather than a full-bleed
  background). Like Cover's own image field, this milestone ships the data
  model and rendering for `imageAssetId` but no picker UI to set it yet — a
  drag-and-drop-onto-page picker for both Cover and About the Author is a
  natural candidate for a future milestone, not a new gap this phase created.
- **Bibliography** (`content: { entries?: string[] }`) — a heading plus a
  plain, one-line-per-reference list. **Glossary**
  (`content: { entries?: { term, definition }[] }`) — heading plus each
  entry as a bold term + regular definition on one flowing line, using
  `wrapRuns`'s existing mixed bold/regular-run support (already built for
  the block system, reused here rather than duplicated) so the PDF drawer
  wraps long definitions correctly. **Index** (`content: { entries?:
  string[] }`) — heading plus a manual, single-column freeform list.
  **Known, deliberate V1 simplification**: real book indexes are
  automatically generated from actual page references across the whole
  manuscript after layout — that's exactly the kind of feature
  `docs/ARCHITECTURE_PRINCIPLES.md`'s "design with future AI integration in
  mind" principle earmarks for later. This milestone ships manual,
  freeform text entry only, no term/page-number computation — the same
  honest-simplification style as this project's existing "PDF export is
  left-aligned even for justified themes" note.
- **ISBN Page** (`content: { isbn?, edition?, printerInfo? }`) — small,
  unobtrusive bottom-of-page text, same visual treatment as `copyright.tsx`,
  showing only whichever fields are actually set.
- **Barcode** (`content: { isbn? }`) — falls back to a sibling ISBN Page's
  `isbn` via the same `siblingPages`/`ctx.structuralPages` sibling-read
  pattern `copyright.tsx` already uses for the Title Page's author.
  **Important honesty note**: this is deliberately **not** a real,
  scannable EAN-13/ISBN barcode. Building a proper barcode-symbology
  renderer (checksum digits, quiet-zone rules, a real bar-width encoding
  table) is a distinct, larger future task that doesn't belong smuggled
  into a mechanical batch like this one. What ships instead is an honest
  placeholder: a deterministic pattern of vertical bars derived from the
  ISBN's own digits (so a given ISBN always renders the same bars, not
  randomly) with the ISBN printed as human-readable text underneath —
  structurally similar to a real back-cover barcode strip, but not
  claiming to be machine-readable. A real barcode-generation library is a
  good candidate for its own future milestone.
- **`StructuralPagePanel.tsx`** — editable-fields forms for all 8. Per the
  brief's explicit scope guidance, Bibliography/Index use a plain
  "one entry per line" `Textarea` (not a rich add/remove-row UI — that's an
  unnecessary escalation for this milestone); Glossary's textarea parses
  each line as `"Term: definition"`, splitting on the first colon.
- **`Sidebar.tsx`** — `BACK_MATTER_ADDABLE_TYPES` grew from `['blank']` to
  all 9 back-matter types, in a rough back-matter reading-order convention
  (cosmetic only, same as front matter's list).
- **Tests**: `scripts/smoke-test.ts` grew from 246 to 269 passing checks —
  registry lookups for all 8 new types (mirroring Phases 19/20's exact
  pattern), `insertPageWithHistory`/`updatePageContentWithHistory`/undo
  coverage for Bibliography (array-of-strings content) and Glossary
  (array-of-objects content) specifically chosen to re-exercise the class
  of undo bug fixed in Phase 20 (a field going from absent to present and
  back via undo) for array-shaped fields, not just scalar strings — both
  pass cleanly, confirming `replacePageContent`'s fix generalizes correctly
  to array content. Also verified the ISBN Page/Barcode sibling-read data
  relationship directly.
- **Verified**: `npx tsc -b --force` clean, `npm run build` clean (2451
  modules, up from 2443), `npm run lint` 0 errors / 31 warnings (up from 23
  — 8 new registry-module files hitting the same already-accepted
  `react/only-export-components` Fast-Refresh heuristic as every prior
  block/structural-page type module), `npm run test` **269/269 passing**
  (246 baseline + 23 new checks). All verification actually run and read,
  not deferred — no repeat of Phase 20's "lint/test owed" gap.
- **Live-browser verified** on the deployed app against a real 17-chapter
  test project: added ISBN Page + Barcode to Back Matter, typed an ISBN
  ("978-1-234567-89-0") and Edition ("First Edition") into the ISBN Page,
  confirmed Barcode's own ISBN field was left blank yet the rendered page
  showed the same ISBN and a bar pattern underneath — the sibling-read
  fallback working correctly end-to-end, not just in the unit test. Also
  added Bibliography, typed two real references, and confirmed the on-screen
  render showed a "Bibliography" heading with each entry as its own
  paragraph. Triggered a full PDF export afterwards with all three new pages
  present (ISBN Page, Barcode, Bibliography) — completed with zero console
  errors. Did not individually re-verify Conclusion/Appendix/About the
  Author/Glossary/Index on-screen this session (Bibliography and Barcode
  were treated as representative of the shared `longForm.tsx` and
  sibling-read patterns respectively, both already unit-tested for all 8
  types) — a reasonable sampling given time, not a claim that all 8 were
  individually screenshotted.
- **Performance finding (not a bug fix, a flagged follow-up)**: on this
  17-chapter test project, both switching to the Structure tab and
  inserting/selecting a structural page occasionally froze the tab's
  renderer for 15–30 seconds (no console output, no network activity during
  the freeze — consistent with a long synchronous main-thread computation,
  not a hang or infinite loop, since it always completed and the app was
  fully responsive afterwards). Given `CLAUDE.md`'s explicit performance
  requirement ("books may exceed 1,000 pages… rendering must remain
  responsive… use virtualisation where appropriate"), this is worth
  profiling before Version 1 ships, even though it isn't a new regression
  introduced by this phase's registry-only changes (Phase 20/21 added zero
  lines to `paginate.ts` or `composePages.ts`). Likely cause: a full-book
  re-pagination running synchronously on every structural-page mutation
  rather than being incremental or deferred. Recommend profiling this
  specifically (not guessing at a fix) before or alongside Milestone 5.

## Phase 22 — Modular Page System Milestone 5: 8 new in-chapter content block types (2026-07-31)

Milestone 5 of `docs/MODULAR_PAGE_SYSTEM_PLAN.md`, per Phase 21's own
"Recommended next task": Pull Quote, Callout, Case Study, Timeline, Gallery,
FAQ, Statistics, Checklist — new `ContentBlock` types that flow through the
existing, proven `paginate.ts` auto-flow engine exactly like a paragraph or
image does today, added purely as registry entries. `BlockContent.tsx`,
`exportPdf.ts`'s `drawBlock`, and `paginate.ts`'s `blockSpacing` needed
**zero changes** — confirming, in the block-type registry's first real use
since Phase 17 shipped it, that the "new types are additive registry
entries, not a hand-synchronized switch" design goal holds for in-chapter
content exactly as it already did for structural pages (Phases 19–21).

- **`src/types/content.ts`** — 8 new interfaces (`PullQuoteBlock`,
  `CalloutBlock`, `CaseStudyBlock`, `TimelineBlock`, `GalleryBlock`,
  `FaqBlock`, `StatisticsBlock`, `ChecklistBlock`) added to the
  `ContentBlockType` union and `ContentBlock` discriminated union, each
  following the project's "optional field, default in code, never migrate"
  rule. **`Callout` is one type with a `variant: 'tip' | 'warning' | 'info'`
  field**, not three near-identical block types, per the plan's own §7.5
  guidance and Phase 21's Glossary/Bibliography precedent for generalizing
  instead of taxonomy-bloating. **`GalleryBlock.assetIds: string[]`** is this
  codebase's first multi-asset field — every prior asset reference
  (`ImageBlock.assetId`, `CoverPage.content.imageAssetId`) was singular.
- **`src/blocks/registry.ts`** — `BlockTypeDefinition` gained two new
  **optional** fields, `label?: string` and `icon?: LucideIcon`, so the 6
  pre-existing types compile unchanged. All 8 new types populate them; this
  is deliberate forward-looking groundwork for a future "Add Block" UI
  picker (out of scope this milestone — see "Deviations" below) — mirrors
  `StructuralPageTypeDefinition.label`/`.icon` in
  `src/structuralPages/registry.ts`, which already ships this exact shape
  for its own "Add Page" picker.
- **`src/blocks/types/{pullQuote,callout,caseStudy,timeline,gallery,faq,
  statistics,checklist}.tsx`** — one module per type, each with a required
  `Render` (on-screen, inline-editable via `useEditableField`, exactly like
  `quote.tsx`/`list.tsx`/`table.tsx` today — no separate Inspector panel) and
  `drawPdf` (visually matching PDF output — the plan's one non-negotiable
  "WYSIWYG drift" rule). Notable implementation details:
  - **Pull Quote** is visually distinct from the pre-existing `quote` block
    on purpose: large centred display type with flanking horizontal rule
    marks above/below and no left rule, vs. `quote.tsx`'s small left-ruled
    blockquote citation style.
  - **Callout**'s per-variant accent colour/icon (tip = green/`Lightbulb`,
    warning = amber/`TriangleAlert`, info = blue/`Info`) are fixed, hardcoded
    values, not read from `ResolvedBookTheme` — `theme.page` has no
    per-block-type accent extension point yet (that's `pageStyles`,
    explicitly deferred to Milestone 6 per the plan's own §7). Documented as
    a deliberate simplification, same honesty as this project's other
    "known simplification" notes (e.g. Barcode's placeholder bars).
  - **Case Study** reuses `splitParagraphs` from `src/structuralPages/
    longForm.tsx` (a pure, stateless helper with no store coupling) rather
    than duplicating blank-line paragraph splitting a third time — the first
    time a `src/blocks/types/*` module has imported from
    `src/structuralPages/*`; verified this creates no import cycle
    (`longForm.tsx` only imports `outlineClass` from `src/blocks/shared.tsx`,
    never anything from `src/blocks/types/*`).
  - **Timeline**'s vertical connecting rule + dot markers use `pdf-lib`'s
    `drawLine`/`drawCircle` (confirmed available on `PDFPage` before use);
    on-screen the same look is a CSS-positioned line + rounded dot per row.
  - **Gallery** reuses `image.tsx`'s exact asset-embedding pipeline
    (on-screen: `useAssetStore.getObjectUrl`; PDF: `getAssetBlob` +
    `blobToPng` + `doc.embedPng`), looped per `assetId` — 0/1/many images are
    handled explicitly (placeholder text / single full-width image / a
    2-column grid). The PDF drawer embeds every image first (`Promise.all`),
    then lays out rows synchronously, avoiding interleaved awaits mid-layout.
  - **FAQ** draws each question (bold) and its answer (regular) as two
    separate wrapped text blocks (not one combined run like Glossary's
    "term — definition" line), matching the brief's "bold question + regular
    answer beneath it" literally.
  - **Checklist**'s checkbox is a drawn glyph (`lucide-react`'s
    `Square`/`SquareCheck`, a `<button>` calling `onCommit` to toggle
    `checked`) — deliberately NOT a native `<input type="checkbox">`, which
    would fight the inline-`contentEditable` editing pattern used everywhere
    else in this codebase. Clicking the glyph toggles; double-clicking the
    adjacent text edits its wording. The PDF drawer draws a bordered square
    and, when checked, a small two-line checkmark inside it.
  - None of the 4 "repeatable entries" types (Timeline, FAQ, Statistics,
    Checklist) ship an add/remove-row UI — matching `list.tsx`/`table.tsx`'s
    existing scope exactly (edit existing import-created items inline only).
- **A real, latent bug found and fixed in `contentStore`/`editorActions.ts`**
  (not scoped to the 8 new types — present since Phase 17, for every
  optional field on every block type). While writing this milestone's own
  brief-mandated insert/undo/redo coverage for Timeline's array-of-objects
  `entries` and Gallery's array-of-strings `assetIds` (the field shapes
  flagged as most likely to re-trigger the shallow-merge undo bug Phase 20
  found and fixed in `structuralPageStore`), the array-replacement cases
  themselves turned out fine (a required field is always keyed, even when
  empty, so `editBlock`'s old "spread the full old block back in as
  `updates`" undo trick correctly overwrites an array wholesale) — but the
  investigation surfaced the real bug one level over: **any *optional*
  scalar field that starts absent and is later set** (e.g. Gallery's
  `caption`, Pull Quote's `attribution`) **could not be cleared by undo**.
  `editBlock`'s undo called `contentStore.updateBlock(..., oldBlock)`,
  which shallow-merges (`{ ...block, ...updates }`); merging a snapshot
  object that never had a given key at all can't delete a key the current
  block already has, since a merge only ever adds/overwrites keys, never
  removes them — the exact same bug class as Phase 20's
  `replacePageContent` fix, just in `contentStore` instead of
  `structuralPageStore`. Verified empirically (not just asserted): reverting
  the fix in a scratch copy and re-running the suite reproduces exactly one
  failure, `editBlock (Phase 22) -> undo: clears Gallery caption back to
  absent`, confirming this was a real, reachable bug (Page.tsx wires every
  content-block edit through `editBlock`), not a hypothetical one.
  **Fix**: added `contentStore.replaceBlock(projectId, chapterId, blockId,
  block)` — a full, non-merging block replacement, mirroring
  `replacePageContent` exactly — and changed `editBlock`'s undo closure to
  call it instead of `updateBlock`. Redo is unaffected (it still re-applies
  `updates` as a merge on top of the now-fully-restored old block,
  reproducing the original forward edit).
- **`src/layout/inspector/TypographyPanel.tsx`** — the one pre-existing file
  outside "registry + rendering + PDF + tests" this milestone had to touch,
  and unavoidably so: its `BLOCK_LABELS` map and `blockPlainText` switch are
  both exhaustive over `ContentBlock['type']`, so extending the type union
  without updating them would fail to compile. Added labels + plain-text
  extraction for all 8 new types; extended the existing "no text to inspect"
  empty state (previously `image`-only) to also cover `gallery`, for the
  same reason (images-only content, not a text block). Also renamed this
  panel's label for the pre-existing `quote` type from "Pull quote" to
  "Quote" — the old label now collides in meaning with the genuinely new
  `pull-quote` type, and "Quote" is a more accurate name for `quote.tsx`'s
  actual small left-ruled blockquote/citation treatment.
- **Tests**: `scripts/smoke-test.ts` grew from 269 to **302** passing checks
  — registry lookups for all 8 new types (complete `Render`/`drawPdf`, the
  new `label`/`icon` fields populated, correct `blockSpacing` including
  Checklist's deliberate absence of one), plus dedicated insert/undo/redo
  coverage for Timeline (array-of-objects `entries`, including a whole-array
  replace-then-undo case) and Gallery (array-of-strings `assetIds`, plus the
  `caption` absent→present→undo regression case that caught the real bug
  above), and two direct unit checks on `contentStore.replaceBlock` itself
  (mirroring Phase 20's direct `replacePageContent` checks).
- **Verified**: `npx tsc -b --force` clean (run directly against the real
  repo — 17s once filesystem caches were warm; this sandbox's mounted
  working directory was, as in Phases 19–20, extremely slow on cold file
  access, timing out repeatedly before warming up — not a code issue).
  `npm run build` clean (2,459 modules, up from 2,451) and `npm run lint` (0
  errors, 43 warnings, up from 31 — the 12 new ones are all the
  already-accepted `react/only-export-components` Fast-Refresh heuristic
  firing on the 8 new `src/blocks/types/*.tsx` files, exactly the same
  precedent as every prior block/structural-page type module) — both run in
  a scratch directory (fresh `npm install`'s `node_modules`, this repo's
  exact `package.json`, source files synced in) after this sandbox's `vite
  build` hit the same pre-existing ESM config-loader flakiness Phases
  19–21's "note on this session's build environment" already documented
  against this exact mount; not a regression, since `vite.config.ts` is
  untouched by this phase and `tsc -b --force` already independently
  confirmed every new/changed file typechecks correctly against the real,
  non-scratch repo. `npm run test`: **302/302 passing** (269 baseline + 33
  new checks).

### Deviations from the brief, and why
- **No "Add Block" UI was built** — there is still no way for a user to
  manually insert ANY block type (old or new) via the UI; blocks only arise
  from manuscript import parsing, exactly as before this milestone. This was
  explicit in the brief and is a pre-existing limitation, not a gap this
  milestone was asked to close.
- **`BlockTypeDefinition.label`/`.icon`** were added as forward-looking
  groundwork for that future picker, per the brief's explicit instruction —
  populated for all 8 new types, not yet wired to any UI.
- **`contentStore.replaceBlock` and the `editBlock` undo fix** are a real,
  necessary addition beyond "registry + rendering + PDF + tests" — required
  by the brief's own instruction to investigate and, if a real bug is found,
  fix it properly rather than skip the test. See the writeup above.
- **`TypographyPanel.tsx`** needed updating (exhaustive `Record`/`switch`
  over `ContentBlock['type']`) — unavoidable, not scope creep; skipping it
  would not compile.

### Explicitly deferred (per the milestone's own scope)
- Milestone 6 — page templates ("save as reusable template") and the theme
  `pageStyles` extension point, which would let Callout's variant colours
  (and future per-type styling) be theme-aware instead of hardcoded.
- The `paginate.ts`/`composePages.ts` performance finding flagged at the end
  of Phase 21 (15–30s main-thread freezes on structural-page mutations in a
  17-chapter test project) — still unprofiled, still recommended before
  Version 1 ships, not touched by this phase's registry-only changes.
- Live-browser verification of the 8 new block types' on-screen rendering —
  this sandbox session had no way to load the app in a real browser; the
  jsdom smoke suite (same limitation this file has documented since Phase
  17) covers registry shape and store/undo logic, not actual DOM rendering
  or `pdf-lib` drawing calls. A real-browser pass (inserting each of the 8
  types isn't possible without the deferred "Add Block" UI either, so this
  would currently require manually crafting a manuscript fixture with these
  block types and importing it) is a reasonable next independent-
  verification step before treating this milestone as fully proven
  end-to-end, mirroring Phase 17's own identical deferral for its six types.

## Recommended next task
`docs/MODULAR_PAGE_SYSTEM_PLAN.md`'s **Milestone 6** is next: page templates
("save as reusable template" for `StructuralPage`s, mirroring `assetStore`'s
persistence pattern via a new `pageTemplateStore.ts`) and the theme
`pageStyles` extension point (`ResolvedBookTheme.pageStyles?: Record<string,
PageTypeStyleTokens>`, optional with sane per-type fallback defaults baked
into the registries themselves) — this would also let Phase 22's Callout
variant colours become theme-aware instead of the fixed hardcoded values
documented above. Milestone 3 (full drag-and-drop reordering of structural
pages) remains a reasonable alternative if polish is preferred over new
extension points. Outside that track, everything in the Development Plan's
"Definition of Version 1 Complete" still works end-to-end. Other good next
steps in priority order: (1) profile the Phase 21 structural-page mutation
freeze (15–30s on a 17-chapter project) — flagged twice now, still
unaddressed, (2) a second real checker engine on top of the existing
`Checker` pattern — Consistency (terminology/units/spelling-variant
matching) is the best next candidate since it's still fully deterministic,
(3) manually verify the Phase 13 scroll-to-block flow in a real browser
(force-mount + smooth-scroll + auto-edit across a multi-page chapter) since
jsdom couldn't exercise it — and, while in a real browser, also do the Phase
14 Ctrl/Cmd+Z-vs-native-undo spot check, the Phase 15 real-world autosave-
interval check, and a live-browser pass on this phase's 8 new block types,
(4) line-level text flow so paragraphs can split across pages like a real
book, (5) justified text and image rotation in the PDF exporter, (6) proper
glyph subsetting once the fontkit bug is understood, (7) the first real
`AiReviewer` (readability is the most self-contained candidate — no
layout/print context needed), (8) EPUB/Kindle export.

## Phase 23 — Virtual Editor: Consistency and Readability checkers (2026-07-31)

Two new deterministic checker engines added to the Virtual Editor, per Phase
22's own "Recommended next task" pointer (item 2: Consistency, the best
next fully-deterministic candidate; item 7 named readability as the most
self-contained future `AiReviewer` candidate, but since both formulas are
pure arithmetic needing no model judgement at all, they're implemented here
as real deterministic `Checker`s instead of waiting for an `AiReviewer`).
`docs/VIRTUAL_EDITOR.md`'s hybrid Checker/AiReviewer architecture,
`pipeline.ts`, and `scoring.ts` needed **zero changes** — exactly as
designed: registering two new `Checker[]` arrays in `checkers/index.ts`'s
`ALL_CHECKERS` was enough for `runPipeline`'s `analysedCategories` and the
dashboard's Consistency/Readability score tiles to go from "Not yet
analysed" to real numbers automatically.

- **`src/virtualEditor/checkers/consistency.ts`** — 2 checkers:
  - `termCasingConsistencyChecker` — tracks two-word phrases across the
    whole book that appear both fully Title Case (e.g. "Forest Garden") and
    fully lowercase (e.g. "forest garden"), using a sliding two-word window
    over each text span's tokenised words (not a non-overlapping regex
    `exec` loop — see "Deviations" below for why that distinction actually
    mattered, not just stylistically). A small `LEADING_STOPWORDS` list
    (the, a, an, this, ...) stops ordinary sentence-initial capitalisation
    ("The Forest Garden...") from being mistaken for a genuine casing
    variant, and a combined-frequency floor (>=3 total mentions of the same
    pair) guards against a single coincidental match. Flag-only, no
    `suggestedFix` — deciding which casing is "correct" needs an editor, not
    a regex, matching `quoteStyleConsistencyChecker`'s exact precedent.
  - `measurementUnitConsistencyChecker` — book-wide regex counts of metric
    vs imperial unit mentions, producing two independent findings: metric-
    vs-imperial mixing, and abbreviated-vs-spelled-out metric style (e.g.
    "5m" vs "5 metres"). Deliberately excludes the abbreviation "in" for
    inches (indistinguishable from the preposition without real sentence
    parsing) and bare "g"/"l" (too ambiguous, e.g. "5G" networks) —
    documented, not hidden, simplifications.
- **`src/virtualEditor/checkers/readability.ts`** — 2 checkers:
  - `fleschReadabilityChecker` — the standard, published Flesch Reading
    Ease and Flesch-Kincaid Grade Level formulas, computed once across
    every paragraph in the manuscript (word count, sentence count via naive
    `.`/`!`/`?` splitting, syllable count via a documented vowel-group
    heuristic in `countSyllables`). Produces exactly one book-level,
    informational finding (no `suggestedFix`) whenever the manuscript has
    any paragraph prose at all; severity scales with how far the score
    falls outside a documented 50–70 "target band" for general-audience
    nonfiction, capped at `major` (never `critical` — a readability
    estimate isn't a manuscript-breaking defect the way a critical
    proofreading error is).
  - `longSentenceParagraphChecker` — per-paragraph, flags any paragraph
    whose average words-per-sentence exceeds a documented threshold (30
    words/sentence), with a real block-level `location` — the brief's own
    "give the user something actionable at the block level, not just a
    book-wide number" request.
- **A real bug found and fixed during test-writing, before the first
  commit**: the initial `termCasingConsistencyChecker` used a global regex
  `exec` loop for bigram scanning, which consumes each match
  non-overlapping — in "The Forest Garden thrives", matching "The Forest"
  first (then discarded by `LEADING_STOPWORDS`) meant the scan resumed at
  "Garden thrives", never re-examining "Forest Garden" as its own pair at
  all in that sentence. Caught by this milestone's own true-positive test
  (expecting `termCasingConsistencyChecker` to find "Forest Garden"/"forest
  garden" as inconsistent) failing outright — not a hypothetical, an actual
  reproduction. **Fix**: replaced the regex `exec` loop with tokenising each
  span into words first and sliding a two-word window across the array —
  every adjacent pair is now examined regardless of what the previous pair
  consumed.
- **A second, smaller bug caught the same way**: the initial `countSyllables`
  heuristic added a redundant "+1 for -le endings" correction on top of the
  existing silent-e exclusion, double-counting words like "table" (scored 3
  syllables instead of 2). The vowel-group count already correctly gives 2
  for "-le" words once the silent-e decrement is skipped for them (the
  intervening consonant already splits the vowels into two separate groups
  — "a" and "e" in "table" — so no further adjustment was needed). Caught by
  `countSyllables('table') === 2` failing during test-writing; fixed by
  removing the redundant correction.
- **Tests**: `scripts/smoke-test.ts` grew from 302 to **329** passing checks
  — true-positive and no-false-positive coverage for both new consistency
  checkers (including the combined-frequency floor and the
  `LEADING_STOPWORDS` false-positive it specifically guards against), both
  new readability checkers (including a heading-only manuscript producing
  zero readability findings, and a dedicated long-sentence-vs-short-sentence
  paragraph pair), 4 direct `countSyllables` unit checks, and updated
  pipeline assertions confirming `analysedCategories` now includes
  `consistency`/`readability` (a still-unregistered category, `copyEditing`,
  is used in place of the old `readability`-stays-null assertion, and the
  "overall score equals proofreading alone" assertion was generalised to
  "overall score equals the mean of every analysed category" now that there
  are three analysed categories instead of one).
- **Verified**: `npx tsc -b --force` clean, run directly against the real
  repo (~22–27s). `npm run build`/`npm run lint`/`npm run test` were run in
  a scratch directory (fresh `npm install`, source files synced in) after
  this sandbox's `vite build` hit the same pre-existing ESM config-loader
  flakiness against this exact mount that Phases 19–22 already
  documented — not a regression, since `vite.config.ts` is untouched by
  this phase and `tsc -b --force` already independently confirmed every
  new/changed file typechecks correctly against the real, non-scratch repo.
  `npm run build` clean, 2,461 modules (up from 2,459). `npm run lint`: 0
  errors, 43 warnings (unchanged from the 43-warning baseline — both new
  files are plain logic modules, not React components, so neither trips the
  `react/only-export-components` heuristic that's been the source of every
  new warning since Phase 17). `npm run test`: **329/329 passing** (302
  baseline + 27 new checks).

### Deviations from the brief, and why
- **`textExtract.ts` was not touched.** Its `blockTextSpans`/`blockPlainText`
  switches have a `default: return []`/`''` fallthrough for any block type
  without an explicit case — meaning the 8 Phase 22 block types (Pull Quote,
  Callout, Case Study, Timeline, Gallery, FAQ, Statistics, Checklist)
  contribute no text to either new checker (or to the existing proofreading
  checkers, for that matter). This is a pre-existing gap from Phase 22, not
  something this milestone introduced or was asked to fix — flagging it
  here because it's more visible now that readability computes a genuine
  per-word/sentence read of the manuscript.
- **Only two-word terms are checked for casing consistency.** Extending to
  3+ word terms is possible but needs a longer sliding window and more
  careful stopword handling to avoid a bigger false-positive surface; left
  as a documented, honest scope boundary rather than half-implemented.
- **Imperial abbreviation style ("5ft" vs "5 feet") isn't checked** — only
  metric abbreviation style is, because no safe, unambiguous imperial
  abbreviation for inches exists ("in" collides with the preposition).
  Adding "ft"/"yd" abbreviation-style checking without "in" would be a
  straightforward follow-up but wasn't asked for and would only cover part
  of the imperial vocabulary, so it was left out entirely rather than
  shipped half-covering the taxonomy's own example.
- **`docs/VIRTUAL_EDITOR.md` correction, not new code**: its "Known
  simplification" paragraph claimed finding-click only scrolls to a
  chapter's opening page, never the exact block. Verified against
  `BookRenderer.tsx`'s `scrollRequest` effect and `VirtualEditorWorkspace.
  tsx`'s `handleLocate` that block-level scroll (`requestScrollToBlock` +
  the `{ type: 'block' }` branch, force-mounting via `data-block-id`) has
  been fully implemented since Phase 13 — the paragraph was simply never
  corrected after that shipped. Fixed the documentation to match reality
  rather than leaving a stale limitation on record; no code changed for
  this.

### Explicitly deferred (per the milestone's own scope)
- Every other still-unbuilt checker category (copy editing, developmental,
  publishing-standards, field-guide, layout, typography, accessibility,
  print, commercial) — untouched, per `docs/VIRTUAL_EDITOR.md`'s own "What's
  real" table.
- Style Guide enforcement — neither new checker reads
  `CheckerContext.styleGuide` (e.g. a project's declared
  `measurementUnits: 'metric' | 'imperial'` preference could suppress the
  metric-vs-imperial finding for a book that's deliberately single-system)
  — same "designed, not built" status as before this milestone.

## Recommended next task
The next Virtual Editor batch, already queued per the product spec's action-
verb list: wire up **Edit** (currently visibly disabled — "edit the block
directly in the manuscript view for now") and the **Apply to Chapter**/
**Apply to Book** batch actions on findings (currently visibly disabled
placeholders in `FindingRow.tsx`). `virtualEditorStore.fixAll`/`fixCategory`
already exist as the report-wide/category-wide batch-apply primitives (see
Phase 13), so "Apply to Chapter" is mostly a matter of scoping that existing
loop down to `finding.location.chapterId` rather than new logic from
scratch. Outside the Virtual Editor track: (1) profile the Phase 21
structural-page mutation freeze (15–30s on a 17-chapter project), still
unaddressed, (2) manually verify the Phase 13 scroll-to-block flow and this
phase's two new dashboard score tiles in a real browser (jsdom can't
exercise either), (3) a third deterministic checker engine — Publishing
Quality (widows/orphans/stranded titles) is a strong next candidate since
`renderer/paginate.ts`'s layout output is already plain data a checker could
read, read-only, per the layer boundary in `docs/VIRTUAL_EDITOR.md`, (4)
line-level text flow so paragraphs can split across pages, (5) justified
text and image rotation in the PDF exporter, (6) proper glyph subsetting
once the fontkit bug is understood, (7) EPUB/Kindle export.

## Phase 24 — Virtual Editor: Style Guide settings UI + enforcement (2026-07-31)

A deliberate deviation from Phase 23's own "Recommended next task" pointer
(which suggested wiring up Edit/Apply-to-Chapter next) — this milestone was
explicitly commissioned instead: give the long-designed `StyleGuide` type
(`englishVariant`, `oxfordComma`, `quoteStyle`, `headingCapitalisation`,
`measurementUnits`, `dateFormat` — all present since Phase 9's foundation,
never enforced) a real settings UI, real per-project persistence, and real
enforcement in at least two checkers. `docs/VIRTUAL_EDITOR.md`'s own § Style
Guide previously described this as fully "designed, not built"; it no longer
is, though most of the six fields still aren't consulted by anything (see
below — this is a first slice, not full coverage).

- **`ProjectSettings.styleGuide?: StyleGuide`** (`src/types/project.ts`) —
  optional, never migrated, following the exact pattern already established
  for `ImageBlock`'s optional fields in `src/types/content.ts`: a project
  persisted before this phase simply has no `styleGuide` key, and every read
  site falls back to `DEFAULT_STYLE_GUIDE` via `??`. `DEFAULT_PROJECT_SETTINGS`
  itself is deliberately left unchanged (no `styleGuide` key added there
  either) — the default lives in `virtualEditor/types.ts`'s
  `DEFAULT_STYLE_GUIDE`, and every read site defaults to that directly,
  rather than duplicating the default value into `project.ts` too.
- **`ProjectSettingsDialog.tsx`** gained a new "Style Guide" section (its own
  `Separator`, appended after the existing Theme section) — six `Select`
  dropdowns, one per `StyleGuide` field, each defaulting to
  `DEFAULT_STYLE_GUIDE`'s value when `project.settings.styleGuide` is absent.
  A local `updateStyleGuideField` helper spreads the *current* style guide
  object before flipping one field (`{ ...styleGuide, [field]: value }`) and
  calls the existing `updateProjectSettings(project.id, { styleGuide: ... })`
  — exactly the same "spread the nested object yourself" pattern the
  dialog's pre-existing margin fields already use for `settings.margins`,
  since `projectStore.updateProjectSettings` only shallow-merges
  `ProjectSettings` at its top level, not one level into `styleGuide`. This
  UI never resets a whole `styleGuide` back to defaults in one action (only
  switches individual enum fields), so the shallow-merge limitation flagged
  in Phase 20/22's `structuralPageStore`/`contentStore` bug writeups doesn't
  apply here — confirmed, not just assumed, and covered by a direct test
  (see below).
- **Pipeline wiring** — `virtualEditorStore.runReview` gained a third,
  optional `styleGuide?: StyleGuide` parameter, simply forwarded to
  `pipeline.runPipeline` (which already accepted it as of Phase 9's original
  plumbing — zero changes needed there). `virtualEditorStore` still never
  reaches into `projectStore`'s state directly, per CLAUDE.md's layer
  separation rule: `VirtualEditorWorkspace.tsx`'s "Review Entire Book"
  button reads `project.settings.styleGuide ?? DEFAULT_STYLE_GUIDE` itself
  (it already receives the full `project` prop) and passes the resolved
  value into `runReview` as a plain parameter — mirroring exactly how
  `runPipeline` itself takes `styleGuide` as a parameter, never a store
  read.
- **`quoteStyleConsistencyChecker`** (`checkers/proofreading.ts`) is now
  Style-Guide-aware. With no preference (`'no-preference'` or no
  `styleGuide` passed at all — the exact same call shape every pre-Phase-24
  test used), it is byte-for-byte the original behaviour: one book-wide
  informational finding when the manuscript mixes straight and curly
  quotes/apostrophes. With `styleGuide.quoteStyle` set to `'curly'` or
  `'straight'`, it switches to a more actionable mode: every text span
  containing a mark that contradicts the explicit preference gets its own
  finding (`issueType: 'quote-style-preference-violation'`, `confidence:
  0.7` — higher than the 0.5 heuristic-pattern confidence, since applying a
  stated rule is more certain than inferring a book-wide pattern), with a
  message/`whyItMatters` naming the actual preference. Still no
  `suggestedFix` in either mode — converting a mark to the correct
  directional curly quote needs to know which side of a quotation it's on,
  which this checker doesn't parse.
- **New checker: `headingCapitalisationChecker`** (`checkers/copyEditing.ts`,
  new file; category `copyEditing`, the first real checker ever registered
  for that category). Only produces findings when
  `ctx.styleGuide?.headingCapitalisation` is `'title-case'` or
  `'sentence-case'` — silent with no preference set or no `styleGuide` at
  all, since (unlike the quote checker) there's no sensible "default
  correct" heading convention to fall back to. Scans `heading` blocks with
  two documented heuristics:
  - **Title Case**: every word should be capitalised unless it's a short
    minor word (article/coordinating-conjunction/short preposition — see
    `MINOR_WORDS`) *and* isn't the first or last word of the heading.
  - **Sentence case**: only the first word should be capitalised; later
    words are allowed to be capitalised only if they're a whole-word
    acronym (all-caps, 2+ letters — assumed deliberate, e.g. "NASA") or the
    pronoun "I". **Honest, documented limitation**: with no proper-noun
    dictionary, a genuine proper noun later in a heading (e.g. "The history
    of London") will false-positive here — directionally useful, not
    linguistically perfect, the same honesty standard every other
    heuristic checker in this codebase already documents about its own
    approximations.
  No `suggestedFix` — deciding which words are minor/proper nouns needs
  editorial judgement a regex can't safely automate. Registered in
  `checkers/index.ts`'s `ALL_CHECKERS` via a new `COPY_EDITING_CHECKERS`
  array, mirroring `PROOFREADING_CHECKERS`/`CONSISTENCY_CHECKERS`/
  `READABILITY_CHECKERS`'s exact shape.
- **A visible, honest side effect of registering a `copyEditing` checker at
  all**: the dashboard's Grammar Score tile (`copyEditing`) goes from "Not
  yet analysed" to a real number — 100, with zero findings, even when no
  heading-capitalisation preference is set at all, since
  `headingCapitalisationChecker` is still a *registered* checker that
  correctly finds nothing to flag. This follows directly from `scoring.ts`'s
  pre-existing, documented rule ("a category with a registered checker but
  zero findings scores a real 100"), not a new fabrication — but it means a
  100 Grammar Score no longer means "nothing in Grammar has ever been
  checked," only "nothing *style-guide-dependent* was flagged." Flagged
  explicitly here, and in `docs/VIRTUAL_EDITOR.md`, rather than left as a
  silent surprise.
- **Tests**: `scripts/smoke-test.ts` grew from 329 to **351** passing checks
  — `quoteStyleConsistencyChecker`'s new preference-aware behaviour (explicit
  `'no-preference'` matches the no-`styleGuide` case exactly; `'curly'`
  preferred flags the straight-quote span with the right `issueType` and a
  message naming the preference; `'straight'` preferred flags the
  curly-quote span; a manuscript already matching the preference produces
  zero findings); `headingCapitalisationChecker` (correct Title Case/
  Sentence case headings produce no findings; incorrect ones of each kind
  are flagged with no `suggestedFix`, in the `copyEditing` category, pointed
  at the exact block; explicitly does NOT fire with `'no-preference'` or no
  `styleGuide` at all, even against headings that would otherwise violate
  both conventions); `runReview`'s new `styleGuide` parameter exercised
  end-to-end (a styleGuide passed through `runReview` really does reach
  `headingCapitalisationChecker` via `runPipeline`; omitting it keeps the
  checker silent — confirming the plumbing itself, not just the checker in
  isolation); and `ProjectSettings.styleGuide`'s persistence/defaulting
  through the real `projectStore` (absent by default on a fresh project;
  reads as `DEFAULT_STYLE_GUIDE` via the `??` pattern; `updateProjectSettings`
  persists a field change without disturbing unrelated settings fields;
  changing a second `styleGuide` field via the object-level spread preserves
  a previously-set sibling field, directly confirming the "spread first"
  merge pattern `ProjectSettingsDialog` relies on actually works). Also
  updated two now-inaccurate pre-existing pipeline assertions: `copyEditing`
  is no longer a valid "not yet analysed" example (`publishingStandards` is,
  now) once it gained a registered checker, and the "overall score equals
  the mean of every analysed category" assertion now includes `copyEditing`
  in its expected-mean calculation.
- **Verified**: `npx tsc -b --force` clean, run directly against the real
  repo (~32s). `npm run build`/`npm run lint`/`npm run test` were run in a
  scratch directory (fresh `npm install`, source files synced in) after this
  sandbox's `vite build` hit the same pre-existing ESM config-loader
  flakiness against this exact mount that Phases 19–23 already
  documented — not a regression, since `vite.config.ts` is untouched by this
  phase and `tsc -b --force` already independently confirmed every
  new/changed file typechecks correctly against the real, non-scratch repo.
  `npm run build` clean, 2,462 modules (up from 2,461). `npm run lint`: 0
  errors, 43 warnings (unchanged from baseline — `copyEditing.ts` is a plain
  logic module, not a React component, so it doesn't trip the
  `react/only-export-components` heuristic). `npm run test`: **351/351
  passing** (329 baseline + 22 new checks).

### Deviations from the brief, and why
- **`DEFAULT_PROJECT_SETTINGS` was not given a `styleGuide` key.** The brief
  asked for "optional field, default in code, never migrate" — adding a
  concrete default value into `DEFAULT_PROJECT_SETTINGS` would mean *every*
  newly-created project starts with an explicit `styleGuide` object anyway,
  which is a fine choice but a different one than "the field stays genuinely
  absent until a user touches the Style Guide UI." Left it genuinely
  optional/absent so the "absent by default" test actually exercises a real
  case, matching how `ImageBlock`'s optional fields behave for a
  freshly-imported image before any panel control has touched it.
- **Only two checkers were made Style-Guide-aware, per the brief's explicit
  "at least these two" instruction** — `englishVariant`, `oxfordComma`,
  `measurementUnits` (the existing `measurementUnitConsistencyChecker` still
  ignores a deliberate single-system preference), and `dateFormat` remain
  unconsulted by any checker. Documented as still-open in
  `docs/VIRTUAL_EDITOR.md`'s § Style Guide, not silently left out.
- **No "reset Style Guide to defaults" button was built.** Not asked for,
  and the brief's own caution about the shallow-merge class of bug only
  applies to a full-object reset-to-default action, which doesn't exist in
  this UI at all — every control here only ever flips one enum field via
  the styleGuide-level spread.

### Explicitly deferred (per the milestone's own scope)
- Phase 23's own "Recommended next task" (Edit/Apply-to-Chapter wiring) —
  still not done; this phase's work was substituted in for it, not stacked
  on top of it.
- Every checker category still without a real checker at all
  (developmental, publishingStandards, fieldGuide, layout, typography,
  accessibility, print, commercial) — untouched.
- `englishVariant`/`oxfordComma`/`measurementUnits`/`dateFormat`
  enforcement — the type/UI/persistence exist for all six fields, but only
  `quoteStyle` and `headingCapitalisation` are consulted by a checker today.
- AI Learning / the personal editorial profile that would eventually tally
  accept/reject decisions against Style Guide fields — still fully
  "designed, not built," per `docs/VIRTUAL_EDITOR.md`.
- Live-browser verification of the new Style Guide `Select` controls
  actually rendering/behaving correctly in `ProjectSettingsDialog` — this
  sandbox session had no way to load the app in a real browser; verified by
  build/typecheck/unit-test only, same honest caveat every prior
  Virtual-Editor-UI phase has carried.

## Recommended next task
Phase 23's pointer is still the most direct outstanding item and wasn't
touched by this phase: wire up **Edit** (currently visibly disabled) and the
**Apply to Chapter**/**Apply to Book** batch actions on findings (currently
disabled placeholders in `FindingRow.tsx`) — `virtualEditorStore.fixAll`/
`fixCategory` already exist as the report-wide/category-wide batch-apply
primitives (Phase 13), so "Apply to Chapter" is mostly a matter of scoping
that existing loop down to `finding.location.chapterId`. Also newly relevant
after this phase: extend Style Guide enforcement to the three still-ignored
fields (`englishVariant`/`oxfordComma`/`measurementUnits`/`dateFormat`) —
`measurementUnitConsistencyChecker` in particular already has the exact
regex-counting infrastructure a `measurementUnits` preference could suppress
against. Outside the Virtual Editor track: (1) profile the Phase 21
structural-page mutation freeze (15–30s on a 17-chapter project), still
unaddressed, (2) a third deterministic checker engine — Publishing Quality
(widows/orphans/stranded titles) is a strong candidate since
`renderer/paginate.ts`'s layout output is already plain data a checker could
read, read-only — but this needs new `CheckerContext` plumbing first (it
doesn't carry pagination output today, only `manuscript`/`styleGuide`), (3)
manually verify the Phase 13 scroll-to-block flow and recent dashboard tiles
in a real browser (jsdom can't exercise either), (4) line-level text flow so
paragraphs can split across pages, (5) justified text and image rotation in
the PDF exporter, (6) proper glyph subsetting once the fontkit bug is
understood, (7) EPUB/Kindle export.

## Phase 25 — Virtual Editor: Publishing Standards + Layout checkers, real pagination data (2026-07-31)

Closes the exact gap Phase 24's own "Recommended next task" named: a third
deterministic checker engine reading `renderer/paginate.ts`'s layout output
needed new `CheckerContext` plumbing first, since it only carried
`manuscript`/`styleGuide` before this phase. Two full categories —
`publishingStandards` and `layout` — go from "Designed, not built" to real.

- **`CheckerContext.pages?: LaidOutPage[]`** (`types.ts`) — the real,
  fully-measured pagination output, reused rather than re-derived. Confirmed
  by reading `BookRenderer.tsx`: after computing `pages` (via
  `composeBookPages(frontMatter, paginatedPages, backMatter)`), it already
  calls `useExportStore.getState().setLayout(project.id, { pages, toc,
  pageBox, theme })` in a `useEffect` — the exact same data PDF export
  reads. There is no second pagination/measurement pipeline in the Virtual
  Editor; building one would duplicate `HeightMeasurer`'s expensive,
  React-only, off-screen DOM measurement pass for no reason. `pages` is
  optional and genuinely `undefined` whenever the manuscript workspace
  hasn't rendered at least once this session.
- **`Checker.isApplicable?: (ctx: CheckerContext) => boolean`** (`types.ts`)
  — defaults to "always applicable" when omitted, so every pre-existing
  checker (proofreading/consistency/readability/copyEditing) needed zero
  changes and is unaffected — confirmed by the full existing test suite
  passing unchanged. `pipeline.ts`'s `analysedCategories` now only counts a
  checker's category as analysed when `checker.isApplicable ? isApplicable(ctx)
  : true` is true for the context actually being run, rather than "every
  registered checker's category always counts." This is what lets
  `publishingStandards`/`layout` honestly stay `null` ("Not yet analysed")
  when `pages` is absent, instead of a fabricated 100 from a
  registered-but-inapplicable checker finding nothing.
- **`src/virtualEditor/checkers/publishingStandards.ts`** (new) — 3
  checkers, all `isApplicable: (ctx) => !!ctx.pages`:
  - `sparseChapterEndingChecker` (`minor`, confidence 0.5) — a chapter's
    last page (matched by `page.chapterId === chapter.id && page.kind !==
    'structural'`) has exactly one block, it's a `paragraph`, and its plain
    text (`blockPlainText`) is under 25 words — "ends with a single short
    paragraph alone on its final page, which will print as a nearly-blank
    page."
  - `emptyChapterOpenerChecker` (`major`, confidence 0.9) — a chapter has
    zero blocks across every one of its pages (its `chapter-start` page and
    any further `content` pages combined) — a real authoring mistake, not a
    style nit.
  - `consecutiveBlankPagesChecker` (`minor`, confidence 0.85) — two or more
    `kind === 'blank'` pages appear adjacently. `paginate.ts` only ever
    inserts exactly one blank page at a time (to force a recto chapter
    start), so this is a low-probability sanity check flagging something
    that should be structurally impossible today, documented honestly as
    such rather than presented as an expected common finding. Since a blank
    page carries no `chapterId`, the finding is attributed to the chapter
    immediately following the blank run (falling back to the preceding
    chapter for the edge case of a run at the very end of the book).
- **`src/virtualEditor/checkers/layout.ts`** (new) — 2 checkers, both
  `isApplicable: (ctx) => !!ctx.pages`:
  - `inconsistentImageSizingChecker` (`suggestion`, confidence 0.5) — per
    chapter, collects every `image`-block's effective width using the
    **exact same precedence rule already established** in
    `src/blocks/types/image.tsx`'s `ImageRender` and `exportPdf.ts`'s
    `drawImagePdf` (`widthMm` wins when set, else `widthPercent ?? 100`) —
    grepped both call sites first rather than inventing a second version of
    this logic. Buckets each effective width to the nearest 10 (documented,
    simple, explainable — not a statistics library) and flags a chapter
    with 3+ images spread across more than 3 distinct buckets. A dedicated
    test proves the precedence is actually honoured: 4 images sharing an
    identical `widthPercent: 100` but 4 distinct `widthMm` values only trips
    the checker if `widthMm` is really what's read.
  - `imageDensityImbalanceChecker` (`suggestion`, confidence 0.5) —
    book-wide, flags a chapter with zero images when the book's own average
    is >= 2 per chapter, or more than double the book average — two simple,
    explainable outlier rules, not a statistics library.
  - **Deliberately not built, and explained positively rather than as a
    gap**: widow/orphan detection — `paginate.ts`'s existing heading-orphan
    guard already structurally prevents a stranded heading, so there's
    nothing to detect after the fact. Page-numbering-uniqueness — once
    structural (front/back-matter) pages are correctly excluded,
    `paginate.ts` numbers every real page exactly once by construction, so
    this was considered and dropped as a non-finding, not an oversight. True
    whitespace/fill-ratio measurement — `LaidOutPage` doesn't store each
    block's real rendered height (that only exists transiently inside
    `HeightMeasurer`'s off-screen pass), so a genuine page-density check is
    future work needing that measurement threaded through too.
- **Registered** in `checkers/index.ts`'s `ALL_CHECKERS`, mechanically, same
  pattern as every prior checker file.
- **`virtualEditorStore.runReview`** gained a 4th optional parameter,
  `pages?: LaidOutPage[]`, simply forwarded to `runPipeline` — this store
  still never reaches into `renderer/*`/`exportStore` itself, per CLAUDE.md's
  layer-separation rule; the caller resolves `pages` and passes it in.
- **`VirtualEditorWorkspace.tsx`** now reads
  `useExportStore((s) => s.byProject[project.id])` and passes `layout?.pages`
  into `runReview(project.id, manuscript, styleGuide, layout?.pages)` — the
  existing Phase-24 `styleGuide` resolution (`project.settings.styleGuide ??
  DEFAULT_STYLE_GUIDE`) was read first and left untouched, not duplicated. A
  small `text-xs text-text-secondary` caption appears beneath the "Review
  Entire Book" button only when `!layout`, explaining that Layout/Publishing
  Quality checks need the manuscript view to have rendered at least once
  this session — unobtrusive, not a blocking error state, since every other
  checker still runs fine without `pages`.
- **Tests**: `scripts/smoke-test.ts` grew from **351 to 383** passing checks
  (32 new) — a shared "healthy book" fixture (two real chapters, structural
  front/back matter, exactly one legitimate blank page, a small consistent
  image-size set, roughly balanced image counts) exercised as the
  no-false-positive case for all 5 checkers at once, plus dedicated
  true-positive fixtures per checker (a sparse final page, a zero-block
  chapter, two adjacent blank pages — including the end-of-book fallback
  edge case, 4 images at the app's own real 40/65/85/100 presets, and a
  3-chapter book with a zero-image outlier and an 8-image outlier against a
  3-image average). Also confirms: `isApplicable` returns `false`/`true`
  correctly depending on whether `ctx.pages` is present; every checker
  returns `[]` outright with no `pages` at all; `runPipeline`'s
  `analysedCategories` keeps `publishingStandards`/`layout` `null` without
  `pages` and produces real (100, or a real deduction) scores with `pages`;
  `virtualEditorStore.runReview`'s new 4th parameter really does reach the
  pipeline end-to-end, and is genuinely optional (omitting it doesn't
  silently default to anything).
- **Verified**: `npx tsc -b --force` clean, run directly against the real
  repo (~18–28s). This sandbox's mounted `node_modules` has the same stray,
  partially-installed state Phases 19–24 already documented — this time it
  broke `npm run test` itself (a `zustand/esm/vanilla.mjs` resolution error
  under `tsx`), not just `vite build` — so `npm run build`/`npm run
  lint`/`npm run test` were all run from a clean scratch directory (fresh
  `npm install`, `src/`/`scripts/` synced in), exactly the workaround Phases
  19–24 already established; `tsc -b --force` against the real,
  non-scratch repo independently confirmed every new/changed file typechecks
  correctly regardless. `npm run build` clean, 2,464 modules (up from
  2,462). `npm run lint`: 0 errors, **43 warnings — unchanged** from
  baseline; both new files are plain logic modules (no JSX, no component
  exports), so neither trips the `react/only-export-components` heuristic,
  matching Phase 23's `consistency.ts`/`readability.ts` precedent exactly
  (the task brief's own speculation of "+2 warnings" didn't materialise, for
  the same reason). `npm run test`: **383/383 passing** (351 baseline + 32
  new checks).

### Deviations from the brief, and why
- **Two pre-existing documentation staleness bugs were corrected while
  editing the same tables/paragraphs this phase needed to touch anyway, not
  as new scope creep**: `docs/VIRTUAL_EDITOR.md`'s "Editorial Dashboard"
  section and its "quick reference" table both still said only
  "Proofreading, Consistency, Readability, Overall" show real numbers — they
  were never updated after Phase 24 registered `headingCapitalisationChecker`
  under `copyEditing`, which made Grammar a real (if often-100) score too.
  Fixed alongside this phase's own Publishing Quality/Layout updates rather
  than left stacked on top of an already-wrong paragraph — same "found it,
  fixed it, documented why" precedent as Phase 23's block-level-scroll
  documentation correction.
- **`inconsistentImageSizingChecker`'s bucketing mixes `widthMm` (a physical
  size) and `widthPercent` (a fraction of the content column) as if they
  were the same unit** when a chapter happens to combine both — documented
  honestly in the file's own doc comment as a known limitation, not hidden.
  `CheckerContext` doesn't carry page/content-column geometry (`pageBox`),
  so there's no way to convert one into the other from inside a checker;
  closing this would mean threading `pageBox` through the same way `pages`
  was added this phase, which wasn't asked for.
- **No new `CheckerContext` field for project/theme geometry** beyond
  `pages` — deliberately the smallest plumbing change that unblocks this
  phase's two categories, per the brief's own scope.

### Explicitly deferred (per the milestone's own scope)
- Every checker category still without a real checker at all (developmental,
  field-guide, typography, accessibility, print, commercial) — untouched.
- `englishVariant`/`oxfordComma`/`measurementUnits`/`dateFormat` Style Guide
  enforcement, and AI Learning — both still exactly as deferred as Phase 24
  left them; none of this phase's 5 new checkers consult `ctx.styleGuide` at
  all.
- Live-browser verification of the new "Review Entire Book" caption and of a
  real Publishing Quality/Layout finding rendering correctly in the
  dashboard — this sandbox session had no way to load the app in a real
  browser; verified by build/typecheck/unit-test only, the same honest
  caveat every prior Virtual-Editor-UI phase has carried.
- True whitespace/fill-ratio page-density measurement, widow/orphan
  detection, and page-numbering-uniqueness checking — all explicitly
  considered and not built, for the positive, documented reasons given above
  (already prevented by construction, or a non-finding once structural pages
  are excluded, or needs real block-height data this milestone doesn't add).

## Recommended next task (Phase 25's own — superseded below by Phase 26)
The Virtual Editor's remaining designed-not-built categories are:
Typography, Accessibility, Print Readiness, and Commercial Quality (all four
need either real AI judgement or Theme/Print-layer data this milestone
didn't plumb through), plus AI Learning (§ in `docs/VIRTUAL_EDITOR.md`) and
the Original/RevA/RevB/RevC side-by-side revision-compare UI, and persisting
the revision log (and reports) across a reload — `virtualEditorStore` is
still deliberately non-persisted, per its own doc comment, since
`SuggestedFix.apply` is a function value that can't round-trip through
`localStorage`'s JSON persistence as-is. Outside the Virtual Editor track:
(1) profile the Phase 21 structural-page mutation freeze (15–30s on a
17-chapter project), still unaddressed across five phases now, (2) extend
Style Guide enforcement to `englishVariant`/`oxfordComma`/`measurementUnits`/
`dateFormat`, still unconsulted by any checker including this phase's five
new ones, (3) manually verify the Phase 13 scroll-to-block flow and every
dashboard tile (including this phase's two) in a real browser, (4)
line-level text flow so paragraphs can split across pages, (5) justified
text and image rotation in the PDF exporter, (6) proper glyph subsetting
once the fontkit bug is understood, (7) EPUB/Kindle export.

## Phase 26 — Editor UX: block toolbar, structural-page inline editing, format toolbar, block inserter, pagination fix (2026-07-31)

**Deliberate reprioritisation, not a continuation of Phase 25's own "recommended
next task" above.** The user reported real usability friction from actually using
the app — inline text editing "needs improving", "page titles end up in a funny
place", "we can't edit page titles, only paragraphs", "no way to delete a
paragraph" — which became `docs/ROADMAP.md`'s new Phase B, placed ahead of
finishing the Virtual Editor per `CLAUDE.md`'s own "Read `docs/ROADMAP.md` ...
pick the next task from the highest-priority unchecked phase" rule added this
session. This phase closes 6 of Phase B's 8 items.

- **Per-block hover toolbar** (`src/renderer/BlockToolbar.tsx`): every block —
  not just images — now has delete/duplicate/move-up/move-down. `contentStore`
  gained `duplicateBlock`/`moveBlock` actions (mirroring
  `structuralPageStore.duplicatePage`/`movePage` exactly — read via `get()`,
  delegate to the existing `insertBlock` "insert this exact object at this exact
  position" primitive rather than duplicating splice logic), wrapped by
  `editorActions.ts`'s `duplicateBlockWithHistory`/`moveBlockWithHistory` for
  undo/redo. Toolbar reveals on hover (`group-hover`, pure CSS, always mounted)
  or when the block is selected. "Change block type" was explicitly **not**
  built — the 14 block types have heterogeneous shapes (a `TimelineBlock`'s
  `entries` vs. a `HeadingBlock`'s `text`) and a lossless conversion isn't
  well-defined; scoped out rather than shipped half-working.
- **Delete/Backspace keyboard shortcut** (`useKeyboardShortcuts.ts`): deletes the
  selected block, guarded by the existing `isTypingTarget` check so it only
  fires when a block is selected but *not* being edited (backspacing inside a
  field still edits text, never deletes the block). Structural pages already
  had delete/duplicate/move via the Sidebar's Structure tab — untouched, this
  is content-block-only.
- **Structural-page inline editing** (`src/structuralPages/shared.tsx`'s new
  `EditableText`, reusing `blocks/shared.tsx`'s `useEditableField` hook):
  Cover/Title Page's title+subtitle+author, Half Title's title, ISBN Page's
  isbn/edition/printerInfo, Barcode's isbn, Foreword's attribution, and
  Appendix's heading are now editable directly on the canvas via double-click —
  previously every structural-page field was editable *only* through the
  Inspector's "Page" settings panel, which is exactly what "we can't edit page
  titles" meant. **Deliberately not extended to the longer, multi-paragraph
  `text` fields** (Copyright, Dedication, Foreword/Preface/Acknowledgements/
  Conclusion/Appendix/About the Author body text) — `useEditableField`'s
  single-line "Enter commits" model doesn't fit multi-paragraph text, and the
  Inspector's `Textarea` (with its own "separate paragraphs with a blank line"
  convention) already handles these reasonably. `LongFormPageRender` (shared by
  5 structural-page types) gained optional `onCommitHeading`/
  `onCommitAttribution` props, used only by Appendix/Foreword respectively —
  Conclusion/Preface/Acknowledgements have fixed heading labels with no backing
  content field, so they're intentionally left non-editable.
- **Floating format toolbar** (`src/renderer/FloatingFormatToolbar.tsx`): a
  small bold/italic/link toolbar appears above the text selection while editing
  a paragraph. Only wired into `paragraph.tsx` — the only block field using
  `useEditableField({ mode: 'html' })`; every other field is `mode: 'text'`,
  which strips markup on commit, so formatting would have no effect there. Uses
  `document.execCommand('bold' | 'italic' | 'createLink')` — deprecated but
  still universally supported for exactly this, and avoids pulling in a
  rich-text-editor dependency this codebase otherwise has none of. Output
  (`<b>`/`<i>`/`<a>`) is normalised by the existing `sanitiseInline` on commit,
  same as any other contentEditable edit.
- **"+" block inserter** (`src/renderer/InsertBlockButton.tsx`,
  `src/blocks/defaultContent.ts`): a hover-revealed "+" button in the gap
  between blocks (reusing the same gap `ImageDropZone` already occupies) opens
  a dropdown of insertable block types — reads `label`/`icon` straight from the
  block-type registry, which had carried these fields since Modular Page System
  Milestone 5 specifically as "forward-looking groundwork for a future 'Add
  Block' UI picker" (see `src/blocks/registry.ts`'s own doc comment — this is
  that milestone). The 6 original block types (heading/paragraph/quote/list/
  table/image) didn't have `label`/`icon` set yet; added them (only `image` is
  excluded from the inserter itself, alongside `gallery` — both need a real
  asset picked first, which the inserter doesn't do; images still come from
  drag-and-drop, per the existing `handleDropAsset` flow). 12 of 14 types are
  insertable with sensible minimal defaults (`src/blocks/defaultContent.ts`).
- **Pagination bug fix** (`src/renderer/paginate.ts`): the heading-orphan guard
  previously reserved only `Math.min(getHeight(next), 32)` px of the following
  block when deciding whether a heading fits on the current page. This under-
  reserved space — the heading would be kept on the page, but the *next* loop
  iteration then re-checked that same following block against its own *full*
  height and, finding it didn't fit in what little space remained, flushed it
  to a new page anyway, stranding the heading alone at the bottom of the old
  page (the "page titles end up in a funny place" report). Fixed by reserving
  the follower's *entire* height (`getHeight(next) + blockSpacing(next)`) up
  front — if the heading is kept, the block after it is now guaranteed to fit
  too, so the later check can never undo this one.

### Explicitly deferred (Phase B items not done this phase)
- **Drag-to-reorder for blocks.** Move-up/move-down buttons (this phase) solve
  the same underlying need (reordering without deleting and re-adding) and are
  arguably more precise/keyboard-accessible than drag; full HTML5 drag-and-drop
  across `LazySpread`'s lazily-mounted spreads is a materially larger, riskier
  addition that wasn't attempted rather than shipped half-working.
- Inline editing for structural pages' long-form `text` fields — see above;
  intentionally scoped to the Inspector panel, not a gap that was missed.

### Verification caveat — read before trusting this phase blind
**This sandbox session had no working `npm run test`, `npm run lint`, or
`vite build`, and no network access to npm's registry or GitHub to repair
either.** `node_modules/zustand/esm/vanilla.mjs` is missing from this sandbox's
`node_modules` (a partial/corrupted install — same category of stray-artifact
issue documented in earlier phases, but this time `npm install`/registry access
itself returned `403 Forbidden — blocked by allowlist`, so it couldn't be
repaired here at all). `oxlint` crashed with a bus error independent of that.
**What was actually verified:** `npx tsc -b --force` — clean, zero errors, run
three times across this phase's edits — plus careful manual code review against
existing, already-shipped patterns in the same files (every new piece of logic
mirrors an existing precedent: `duplicateBlock` mirrors `duplicatePage`,
`EditableText` mirrors `ListItemField`/`TableCellField`, etc.). **Not verified:**
the full smoke-test suite (`scripts/smoke-test.ts`, 383 checks as of Phase 25) —
no new tests were added for this phase's changes either, since writing tests
that can't be run risks false confidence. **Before trusting this phase's
changes in production: run `npm install && npm run build && npm run lint &&
npm run test` on a machine with real npm registry access, and manually
exercise the block toolbar, structural-page inline editing, format toolbar, and
inserter in a real browser.** No commits from this phase have been pushed to
GitHub — this sandbox also has no network access to github.com.

## Recommended next task (Phase 26's own — superseded below by Phase 27)
Two Phase B items remain: drag-to-reorder for blocks (deprioritised above, not
abandoned), and extending inline editing to structural pages' long-form text
fields (would need a different editing model than `useEditableField`'s
single-line commit-on-Enter). Beyond Phase B, `docs/ROADMAP.md` Phase C
(Editorial Intelligence) has 12 unchecked items, Phase D (Publishing Output
Expansion — EPUB/Kindle export, PDF justification/rotation/font-subsetting
fixes) is untouched, and Phase G (Accounts, Cloud & Collaboration) remains the
biggest structural gap for a real multi-device product — none of this has a
backend, accounts, or cloud storage today. **Before any of that: get this
phase's changes verified on a machine with a working `npm install` and pushed
to GitHub**, since neither was possible from this sandbox.

## Phase 27 — Back Cover page type, structural-page image picker, delete discoverability (2026-07-31)

Triggered by real usage feedback after Phase 26 shipped: "there is no way to
delete whole pages," "the thumbnails don't actually use the text," "we need a
way to add a back cover," "a page designer for front/back cover." Investigated
each in the code rather than assuming; this phase addresses the two that were
concretely scoped and quick, per the user's own prioritisation — thumbnail
previews and a full cover designer are logged as new `docs/ROADMAP.md` items,
not attempted this phase.

- **"No way to delete whole pages" — turned out to be discoverability, not a
  missing feature.** `Sidebar.tsx`'s Structure tab already has working move/
  duplicate/delete for every front/back-matter page (`deletePageWithHistory`
  etc., undo-safe) — the icons were `opacity-0` until hover, easy to miss
  entirely. Changed to `opacity-35` by default (still `opacity-100` on
  hover), so the delete button is faintly visible without needing to discover
  the hover state first. Regular chapter-content pages still have no delete
  concept, correctly — they're computed pagination output, not stored
  objects (deleting "a page" there really means deleting whichever blocks
  landed on it, which `BlockToolbar`'s per-block delete, Phase 26, already
  covers).
- **Found a bigger, real gap while investigating: Cover, Back Cover (new),
  and About the Author had no way to set their background/portrait image at
  all.** `imageAssetId` existed on all three content types and was fully
  wired into rendering + PDF export, but the Inspector panel only ever said
  a picker "is planned for a future milestone" — there was no actual UI
  anywhere. Fixed with `StructuralImageDropZone`
  (`src/structuralPages/shared.tsx`): a full-page drag target reusing the
  exact same `ASSET_DRAG_MIME` drag source `Page.tsx`'s content-image drop
  zones already use, so dragging a thumbnail from the Sidebar's Assets tab
  now sets (or replaces) the image directly on Cover/Back Cover/About the
  Author. `structuralPageStore.ts`'s asset-reference tracking (`assets`
  array, for future cleanup logic) was previously Cover-only — extended to
  all three image-bearing types.
- **Back Cover page type** (`src/structuralPages/types/backCover.tsx`,
  registered in `src/structuralPages/registry.ts` and `Sidebar.tsx`'s
  back-matter addable list, added last since that's where it almost always
  belongs): full-bleed image-or-tinted background like Cover, but
  text-forward — back-cover copy (`content.blurb`, multi-paragraph, split
  the same way Foreword/Preface/Conclusion/etc. already do) plus an optional
  short `authorBio` line, not a repeated title (the front cover already has
  that). `content.blurb`/`authorBio` are Inspector-panel-edited (Textarea/
  Input), matching Phase 26's established rule that multi-paragraph text
  stays off the single-line `EditableText` canvas-editing model. Added
  `StructuralPageType` union member, `StructuralPagePanel.tsx` fields, and a
  `drawBackCoverPdf` mirroring `cover.tsx`'s PDF drawer shape.

### Explicitly deferred (surfaced this phase, not built)
- **Real thumbnail previews.** `ThumbnailRail.tsx` renders a plain empty box
  per page — only chapter-opener pages show the first 3 letters of the
  chapter title in 6px text; every other page (including every structural
  page) is a blank rectangle. Confirmed accurate when the user raised it.
  Needs either a genuine miniature render of each page or a cheaper
  text-density/colour approximation — not a quick fix, logged in
  `docs/ROADMAP.md`.
- **Front/back cover page designer** (layout templates, draggable element
  positioning, spine-width calculation for a real wraparound cover). Cover
  and Back Cover are both still fixed single-layout types today (centred
  text over a background image); a real designer is a multi-session project
  in its own right, already tracked in `docs/ROADMAP.md` Phase E.
- **Replacing/removing a structural-page image once set has one remaining
  rough edge**: `StructuralImageDropZone` supports drag-to-replace (dropping
  a new asset on an existing image works), but there's no explicit "remove
  image" button — clearing it back to the tinted-background/no-photo state
  requires dragging a different image on, not an empty action.

### Verification caveat — same as Phase 26
This sandbox still has no working `npm run test`/`npm run build (vite)`/
`npm run lint`, and no network access to npm's registry or GitHub. Verified
via `npx tsc -b --force` only (clean) plus manual review against this
project's own established patterns (`StructuralImageDropZone` mirrors
`Page.tsx`'s `ImageDropZone`; `backCover.tsx` mirrors `cover.tsx` almost
field-for-field). **Manually exercise the image drag-and-drop and the new
Back Cover type in a real browser, and run the full build/lint/test suite,
before trusting this beyond a quick look.**

## Recommended next task (Phase 27's own — superseded below by Phase 28)
Real thumbnail previews and the cover/back-cover designer are the two
explicitly-deferred items above. Otherwise the same priority order as Phase
26 still holds: verify + push this phase's changes, then Phase C (Virtual
Editor categories), Phase D (EPUB/Kindle, PDF fixes), and Phase G (accounts/
cloud) as the biggest remaining structural gaps.

## Phase 28 — Fix paragraphs clipped mid-page (font-swap pagination race) (2026-07-31)

Triggered by real usage feedback: "some paragraphs are getting cut off at the
bottom of pages half way through." Not a pagination math bug (Phase 26 already
fixed the heading-orphan lookahead) — traced to a font-loading race between
`HeightMeasurer.tsx` and `src/index.css`'s self-hosted `@font-face` rules.

- **Root cause**: every self-hosted font (Inter, Source Serif 4) uses
  `font-display: swap`. The browser paints an initial frame in a fallback
  font while the real `.woff2` downloads, then swaps once it's ready.
  `HeightMeasurer.tsx` measured each block's rendered height exactly once,
  in a `useLayoutEffect` that fires before that swap has necessarily
  happened — so `paginate.ts` was fed heights based on fallback-font line
  spacing and character widths. Once the real font swapped in, text grew
  taller than measured, and `Page.tsx`'s content container (`overflow:
  hidden`, both the theme background layer and the block-content layer) has
  no fallback but to clip whatever no longer fits — visually indistinguishable
  from a paragraph being sliced off mid-way down the page.
- **Fix** (`src/renderer/HeightMeasurer.tsx`): measure immediately as before
  (so layout isn't blocked waiting on network fonts), then call
  `document.fonts.ready.then(measure)` and re-report heights once real fonts
  are confirmed loaded. This triggers a second, corrected pagination pass.
  A no-op when fonts are already loaded/cached (both measurements agree, so
  `heights` state doesn't meaningfully change) — no added latency in the
  common case, no infinite loop (the promise resolves once per mount).
- **Not fixed by this change**: mid-session font loading hiccups after the
  book has already been paginated and scrolled (e.g. a very slow connection
  where `document.fonts.ready` itself races the user scrolling) are still
  theoretically possible but far rarer than the reliable every-load bug this
  closes — not chasing further without a repro.

### Verification caveat — same as Phase 26/27
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox. Verified via `npx tsc -b --force` only (clean). **This is a
timing-sensitive rendering bug — manually reload the app on a cold cache
(hard refresh, or throttle network in DevTools) and confirm no paragraph gets
clipped, before trusting this beyond a quick look.**

## Recommended next task (Phase 28's own — superseded below by Phase 29)
Manually verify the font-swap fix in a real browser (cold cache reload,
throttled network) since this class of bug is inherently hard to catch via
`tsc` alone. Otherwise unchanged: real thumbnail previews and the cover/
back-cover designer (Phase 27's deferred items), then Phase C (Virtual Editor
categories), Phase D (EPUB/Kindle, PDF fixes), and Phase G (accounts/cloud)
as the biggest remaining structural gaps.

## Phase 29 — Page-level delete/duplicate/move directly on the canvas (2026-07-31)

Triggered by real usage feedback repeated a second time: "still no way to
delete whole pages," even after Phase 27's Sidebar discoverability fix
shipped. Investigated rather than assuming Phase 27 was insufficient for a
vague reason — the actual gap: Phase 27 only made the *existing*
Sidebar-Structure-tab delete/duplicate/move icons more visible (`opacity-0`
→ `opacity-35`). That's a completely different panel from the page canvas
itself; a user looking at a Cover or Blank page in the main view had no
on-page indication any delete action existed at all, sidebar or otherwise.
This violates `CLAUDE.md`'s "visual rather than settings-based" principle
more directly than the opacity issue Phase 27 actually fixed.

- **`src/renderer/PageToolbar.tsx`** (new): a floating action cluster —
  move up/down, duplicate, delete — shown at the top-right corner of a
  structural page, visually identical to `BlockToolbar.tsx`'s per-block
  toolbar (same reveal pattern: invisible until the page is hovered/selected,
  `group-hover`/`selected` opacity toggle). Uses the exact same
  `duplicatePageWithHistory`/`deletePageWithHistory`/`movePageWithHistory`
  actions the Sidebar rows already called — no new store logic, purely a
  second, canvas-native entry point to the same undo-safe actions.
- **`src/renderer/Page.tsx`**: added `group` to the outer page container
  (previously only individual block wrappers had it) so `PageToolbar` can
  reveal on page hover; renders `PageToolbar` as a sibling of the
  structural-page `Render`, outside its `overflow-hidden` wrapper so the
  toolbar itself is never clipped. Move-up/down boundaries computed from
  same-category structural-page siblings, mirroring
  `structuralPageStore.movePage`'s own boundary logic (buttons grey out at
  an edge; the action itself was already a safe no-op there regardless).
- **Sidebar's Structure-tab controls are unchanged** — this is an additional
  entry point, not a replacement. Some users will still prefer managing the
  full front/back-matter list from the sidebar (e.g. reordering many pages
  at once without scrolling the canvas).
- **Deliberately not extended to `chapter-start`/`content` pages** — those
  are computed pagination output (whichever blocks flowed onto that page),
  not a single stored object with an id to delete. `BlockToolbar`'s
  per-block delete (Phase 26) already covers "remove content from this
  page" for that case; see docs/ROADMAP.md Phase B for why a page-level
  delete doesn't make sense there.

### Verification caveat — same as Phase 26/27/28
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox. Verified via `npx tsc -b --force` only (clean) plus manual
review against `BlockToolbar.tsx`'s established pattern. **Manually hover and
delete a structural page from the canvas in a real browser before trusting
this beyond a quick look** — particularly the hover-reveal timing and that
the toolbar doesn't visually collide with anything the structural page's own
`Render` draws near its top-right corner (Cover/Back Cover's centred text
shouldn't, but check with a real image set).

## Recommended next task (Phase 29's own — superseded below by Phase 30)
Real thumbnail previews (`ThumbnailRail.tsx` still renders blank boxes) is
the last open item in Phase B — natural next pick. After that: the cover/
back-cover designer (Phase E), Phase C's remaining Virtual Editor checkers,
Phase D (EPUB/Kindle, PDF fixes), and Phase G (accounts/cloud) as the
biggest remaining structural gaps.

## Phase 30 — Real thumbnail previews (2026-07-31)

Closes the last open item in Phase B. `ThumbnailRail.tsx` previously rendered
a plain bordered box per page — only chapter-opener pages showed the first 3
letters of the chapter title; every other page (including every structural
page) was blank. Confirmed via user report earlier this session.

- **Approach: true miniatures, not an approximation.** Rather than a cheap
  text-density/colour stand-in, thumbnails now render the exact same `Page`
  component the main spread view uses, CSS-`transform: scale()`d down —
  genuine WYSIWYG per `CLAUDE.md`'s Editor Philosophy ("the preview should
  always represent the exported result as accurately as possible"), and
  automatically stays in sync with every block type, theme, and structural
  page — no second rendering path to maintain.
- **`src/renderer/Page.tsx`**: added an optional `decorative` prop. When
  true: omits `id`/`data-block-id`/`data-chapter-start` (prevents duplicate
  DOM ids — the real page and its thumbnail render the same ids
  simultaneously, which would break `BookRenderer`'s `getElementById`/
  `querySelector`-based scroll-to-block/-page/-chapter, since the thumbnail
  rail mounts before the main content in the DOM and those lookups return
  the first match); forces `editable={false}` and skips `BlockToolbar`/
  `PageToolbar`/drop-zones/insert-buttons entirely rather than just visually
  hiding them (keeps contentEditable and its keyboard-focus path out of
  thumbnails, and avoids mounting extra drag-and-drop/selection
  subscriptions per thumbnail across a long book).
- **`src/renderer/ThumbnailPage.tsx`** (new): one thumbnail — lazily mounts
  the real (`decorative`) `<Page>` only once scrolled near the rail's
  viewport via `IntersectionObserver`, the same pattern `LazySpread.tsx`
  already uses for the main spread view (`rootMargin: 600px`); falls back to
  the pre-existing placeholder box (with the chapter-opener 3-letter hint)
  until then. Wraps the mounted `<Page>` in `pointer-events-none` as defense
  in depth on top of `decorative`, not a substitute for it.
- **`src/renderer/ThumbnailRail.tsx`**: now takes `projectId`/
  `dropCapBlockIds`/`toc`/`bookTitle`/`language` (all already computed in
  `BookRenderer.tsx`, just not previously threaded down) and renders
  `ThumbnailPage` per page instead of the inline placeholder box.
- **Performance**: bounded the same way `LazySpread` already bounds the main
  view — only thumbnails near the visible scroll region ever mount real
  content; a 1,000-page book still only pays for ~10–20 real thumbnail
  renders at a time, per `CLAUDE.md`'s "remain responsive... exceeding 1,000
  pages" / "virtualise long page lists" requirements.

### Verification caveat — same as Phase 26/27/28/29
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox. Verified via `npx tsc -b --force` only (clean). **This is the
riskiest change so far to verify by reading alone — manually confirm in a
real browser**: thumbnails show real content and match the main view,
scrolling a long book doesn't lag or double-render, clicking a chapter in
the Sidebar still scrolls the *main* page (not a thumbnail copy — the
duplicate-id concern `decorative` was built to prevent), and the Virtual
Editor's "Locate" action still lands on the real block.

## Recommended next task (Phase 30's own — superseded below by Phase 31)
Manually verify the thumbnail rail in a real browser (per the caveat above)
— this is the change most likely to have a subtle bug that only shows up at
runtime. Otherwise: the cover/back-cover designer (Phase E), Phase C's
remaining Virtual Editor checkers, Phase D (EPUB/Kindle, PDF fixes), and
Phase G (accounts/cloud) as the biggest remaining structural gaps.

## Phase 31 — Fix chapter-opener clipping: reserve real title height in pagination (2026-07-31)

Triggered by a screenshot: a chapter-opener page ("CHAPTER EIGHT" / a
two-line-wrapping title "Chapter Six: From Map to Masterplan") with its last
paragraph cut off mid-sentence, `BlockToolbar` visibly floating over the
clipped remainder. User reported "chapters are still getting cut off
occasionally" — i.e. after Phase 28's font-swap fix, which closed a
*different* clipping cause and evidently wasn't the whole story.

- **Root cause**: `paginate.ts`'s opener-page budget was
  `contentHeightPx - chapterOpenerTopSpacerPx` — it only ever subtracted the
  theme's fixed `topSpacer` padding above the chapter title, never the
  number-label + `<h1>` title's *own* rendered height. That height is
  variable: a short one-line title costs far less vertical space than a
  long or wrapping one (like the two-line title in the screenshot). Every
  extra title line pagination didn't know about pushed the page's last block
  further past the actual available space, and `Page.tsx`'s clipped content
  container hid the overflow rather than reflowing it. This is a distinct
  bug from Phase 28's font-swap race (that one affected every page equally
  once triggered; this one specifically worsens with title length, matching
  "occasionally" rather than "always").
- **Fix**: chapter opener headers are now measured off-screen exactly like
  blocks are.
  - `src/renderer/chapterOpenerLabel.ts` (new): factored `CHAPTER_NUMBER_WORDS`
    and a `getChapterNumberLabel(theme, chapterIndex)` helper out of
    `Page.tsx` (previously a private, unexported array + inline ternary) so
    `HeightMeasurer.tsx` can render the *exact* same label text — measuring
    a different string than what's actually displayed would silently
    reintroduce the same class of bug.
  - `src/renderer/HeightMeasurer.tsx`: now also renders each chapter's
    number-label + title off-screen (identical classes/styles to
    `Page.tsx`'s `chapter-start` markup) and reports its height keyed
    `` `opener:${chapterId}` `` alongside the existing per-block heights.
  - `src/renderer/paginate.ts`: new optional `getOpenerHeaderHeight`
    parameter (defaults to `() => 0`, so any other caller stays behaviorally
    unchanged); the opener page's `available` budget now subtracts it:
    `contentHeightPx - chapterOpenerTopSpacerPx - getOpenerHeaderHeight(chapter)`.
  - `src/renderer/BookRenderer.tsx`: passes `(chapter) => heights[\`opener:${chapter.id}\`] ?? 0`.
- **`Page.tsx`** now imports `getChapterNumberLabel` instead of its own
  private array/ternary — same visual output, one less duplicated
  implementation (per `CLAUDE.md`'s "avoid duplicate logic").

### Verification caveat — same as Phase 26/27/28/29/30
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox — `npm run test` additionally fails here specifically because
`paginate.ts`'s own import chain transitively pulls in `zustand`, which hits
the same pre-existing broken-`node_modules` artifact tracked in
docs/ROADMAP.md Phase J (`node_modules/zustand/esm/vanilla.mjs` missing).
Verified via `npx tsc -b --force` only (clean) plus manual review of the
pagination math change. **Manually check a chapter with a long/wrapping
title in a real browser and confirm no content is clipped, and spot-check
that the opener page still looks correctly spaced (not oddly cramped) for
short one-line titles too** — the measured height should exactly match what
`Page.tsx` renders, but this is exactly the kind of two-places-must-agree bug
that already went wrong once (Phase 26's original heading-orphan guard, and
now this).

## Recommended next task (Phase 31's own — superseded below by Phase 32)
Manually verify Phase 31's fix (long/wrapping chapter titles, in a real
browser) — pagination-affecting changes have twice now shipped with a subtle
bug not visible to `tsc`. Otherwise: the cover/back-cover designer (Phase E),
Phase C's remaining Virtual Editor checkers, Phase D (EPUB/Kindle, PDF
fixes), and Phase G (accounts/cloud) as the biggest remaining structural gaps.

## Phase 32 — Live-verified two real bugs in the deployed app (2026-07-31)

The user asked directly: "try using it yourself on google chrome to check
the latest updates." Every prior phase's "verification caveat" had been
`tsc`-only, with a note asking for manual browser verification that hadn't
actually happened yet. This phase is that verification — using the Claude in
Chrome browser tools against the live deployment at
https://bookstudio-rose.vercel.app/ (real user projects, not a fixture) — and
it paid off: found two genuine regressions that `tsc` could never catch,
both introduced earlier this session.

- **Bug 1 — thumbnails rendered real content but were invisible.** Opened a
  project with a Cover page and inspected the thumbnail rail's DOM directly
  (`element.innerText`, `getBoundingClientRect()`) rather than trusting the
  screenshot alone: the scaled `<Page>` copy's `innerText` correctly showed
  "Untitled" / "Drop a cover image here" / etc. — Phase 30's measurement and
  mounting logic worked. But its `getBoundingClientRect()` reported
  `top: -265`, nowhere near the visible thumbnail box. Root cause:
  `ThumbnailPage.tsx`'s scaled wrapper was a normal-flow child of a
  `flex items-center justify-center` container. Flexbox centers a child
  using its *layout* size, which for this wrapper is the full unscaled page
  (~576×864px) — `transform: scale()` only affects painting, not layout size
  — so the browser centered a huge box inside a tiny one *before* applying
  the shrink, pushing the actually-rendered (scaled) pixels far outside the
  clipped thumbnail. Fixed by making the wrapper `absolute left-0 top-0`
  (removing it from flex layout entirely), so `transform-origin: top left`
  scales it down exactly into the visible area. Every thumbnail on the live
  site was affected, on every project checked.
- **Bug 2 — hovering anywhere on a page revealed every block's toolbar at
  once**, not just the hovered block's. Reproduced by hovering a single
  paragraph in a real chapter and seeing four separate `BlockToolbar`
  instances light up simultaneously. Root cause: Phase 29 added `group` to
  `Page.tsx`'s outer page container (for `PageToolbar`'s reveal), and
  `renderBlock`'s per-block wrapper already had its own separate `group`
  (for `BlockToolbar`'s reveal, since Phase 26). Tailwind's *unnamed*
  `group`/`group-hover:` isn't scoped to the nearest ancestor — the
  generated selector matches when *any* ancestor with class `group` is
  hovered — so nesting two unnamed groups made hovering the outer one also
  satisfy the inner one's condition. `InsertBlockButton.tsx` had already
  solved this correctly for its own case using a *named* group
  (`group/insert`) — this phase applies the same fix consistently:
  `Page.tsx`'s page container is now `group/page`, its per-block wrapper is
  now `group/block`, and `PageToolbar`/`BlockToolbar` were updated to match
  (`group-hover/page:`/`group-hover/block:`). Named groups only match their
  own name, so the two reveals are now fully independent again.
- **Confirmed still working correctly**: `PageToolbar` itself (move/
  duplicate/delete on a Cover page, visible and positioned correctly),
  Phase 27's Sidebar opacity fix (icons faintly visible without hover),
  the `StructuralImageDropZone` hint text, and no console errors on load.
- **Files touched**: `src/renderer/ThumbnailPage.tsx` (positioning fix),
  `src/renderer/Page.tsx` (named groups, 2 spots), `src/renderer/BlockToolbar.tsx`
  and `src/renderer/PageToolbar.tsx` (named group selectors + doc comments
  explaining why, so this doesn't get silently reintroduced by a future
  unnamed `group` added anywhere else in `Page.tsx`).

### Verification note — different from every prior phase's caveat
This phase's fixes were themselves found *by* manual browser verification.
User pushed the commit, Vercel redeployed, and confirmed live 2026-07-31:
both thumbnail visibility and single-block-only toolbar hover now work
correctly on https://bookstudio-rose.vercel.app/. This is the first phase
this session with a fully closed find-fix-verify loop, not just a `tsc`
pass plus a "please check this manually" caveat.

## Recommended next task (Phase 32's own — superseded below by Phase 33)
Real thumbnail previews and page-delete are now both genuinely confirmed
working end-to-end, live, by the user — the first features this session
verified beyond `tsc`. Next up per
the roadmap is the cover/back-cover designer (Phase E), Phase C's remaining
Virtual Editor checkers, Phase D (EPUB/Kindle, PDF fixes), and Phase G
(accounts/cloud).

## Phase 33 — Delete for chapter-content/-start pages (2026-07-31)

Immediate follow-up after confirming Phase 29/32's structural-page delete
worked live: "I can now delete pages that I've added through structure, but
not pages that have been imported." Correct and expected given Phase 29's
own scope note ("not rendered for chapter-start/content pages... not a
single stored object with an id to delete") — but the user's ask makes clear
that scoping was too narrow for what "delete this page" needs to mean in
practice, so this phase closes it.

- **What "delete this page" means for a content page**: unlike a structural
  page, a chapter-content/-start page has no single stored object — it's
  whichever blocks `paginate.ts`'s greedy flow happened to place on it this
  layout pass. "Delete the page" is therefore defined as: delete every block
  currently laid out on it. The chapter itself, its title, and every other
  page of that chapter are untouched; the remaining blocks simply reflow
  into the freed space on the next pagination pass, same as deleting any
  individual block already does.
- **`src/store/contentStore.ts`**: new `deleteBlocks(projectId, chapterId,
  blockIds)` — bulk-removes multiple blocks in one `set()`/one revision bump,
  rather than N separate `deleteBlock` calls (avoids N re-renders/re-
  paginations for one user action). New `replaceChapterBlocks(projectId,
  chapterId, blocks)` — full (non-merging) replacement of a chapter's whole
  block array, mirroring `replaceBlock`'s "full snapshot restore, not a
  merge" pattern; this is what makes undo trivially correct regardless of
  how many blocks were deleted or what order they were in.
- **`src/store/editorActions.ts`**: new `deletePageBlocksWithHistory(projectId,
  chapterId, blockIds)` — snapshots the chapter's full block list *before*
  calling `deleteBlocks`, records one history entry whose undo calls
  `replaceChapterBlocks` with that snapshot and whose redo re-calls
  `deleteBlocks`. One undo step restores the whole page's content at once,
  not N separate undos for N blocks.
- **`src/renderer/PageToolbar.tsx`**: `onMoveUp`/`onMoveDown`/`onDuplicate`
  (and their `canMoveUp`/`canMoveDown`) are now optional — omitted entirely,
  not just disabled, when a caller doesn't pass a handler, since "move"/
  "duplicate a page" have no well-defined meaning for a content page. Added
  `deleteLabel` so the tooltip can say "Delete page content" for content
  pages instead of structural pages' "Delete page" (accurately describing
  that this clears the page's blocks, not a stored page object).
- **`src/renderer/Page.tsx`**: renders a delete-only `PageToolbar` for
  `chapter-start`/`content` pages (only when the page actually has ≥1 block —
  no point showing a delete button with nothing to delete), calling
  `deletePageBlocksWithHistory` with every block id currently on that page.
  Uses the same `group/page` hover-reveal already fixed in Phase 32.

### Verification caveat
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox. Verified via `npx tsc -b --force` only (clean) plus manual
review of the bulk-delete/undo logic against the established
`replaceBlock`/`replacePageContent` "full restore, not merge" pattern.
**Manually verify in a real browser**: deleting a content page's blocks
removes exactly those blocks (not neighbors on other pages of the same
chapter), the remaining content reflows correctly, and a single Ctrl/Cmd+Z
restores everything that page had in one step.

## Recommended next task (Phase 33's own — superseded below by Phase 34)
Manually verify Phase 33 live (delete a content page, confirm reflow +
one-step undo). Otherwise: the cover/back-cover designer (Phase E), Phase
C's remaining Virtual Editor checkers, Phase D (EPUB/Kindle, PDF fixes), and
Phase G (accounts/cloud) as the biggest remaining structural gaps.

## Phase 34 — Delete a whole chapter, title included (2026-07-31)

Immediate follow-up after the user confirmed Phase 33's page-content delete
worked live: "that worked, but no way of deleting chapter titles. So the
text deletes but not the chapter titles." Correct — Phase 33's
`deletePageBlocksWithHistory` was scoped deliberately to a page's *body*
blocks only, leaving the chapter title untouched on purpose (a page is
pagination-computed output; the title belongs to the chapter, not to any one
page). The user's report makes clear that gap needed its own, separate fix
rather than being left as an intentional non-goal.

- **Deliberately a distinct action, not an extension of page-content
  delete.** Overloading the existing "Delete page content" button so it
  *sometimes* also deletes the title (e.g. only on a chapter-start page)
  would be genuinely ambiguous — a user couldn't predict from the button
  alone whether clicking it nukes just this page's text or the whole
  chapter. Chapter deletion gets its own explicit action and its own icon,
  placed on the title itself rather than the page-content corner.
- **`src/store/contentStore.ts`**: new `deleteChapter(projectId, chapterId)`
  (removes the whole chapter from `manuscript.chapters`) and
  `replaceChapters(projectId, chapters)` (full array replacement — the undo
  half, mirroring `replaceChapterBlocks`'s "snapshot the whole list, restore
  the whole list" pattern from Phase 33).
- **`src/store/editorActions.ts`**: new `deleteChapterWithHistory` —
  snapshots the full `manuscript.chapters` array before deleting, one undo
  step restores the entire chapter (title + every block) regardless of how
  long it was. No confirmation dialog, consistent with every other delete
  action in the app (structural pages, blocks, assets) — a chapter delete is
  bigger, but no less undoable, so there's no principled reason to
  special-case a confirm prompt just for this one.
- **Two entry points**, matching the pattern already established for
  page-level delete (Sidebar + canvas):
  - `src/layout/Sidebar.tsx`: a delete icon next to the existing rename
    pencil on each chapter row (same `opacity-35` reveal styling as every
    other Sidebar action button). Clears rename-in-progress state and/or
    selection if the deleted chapter was either.
  - `src/renderer/Page.tsx`: a small hover-reveal trash icon directly on the
    chapter title on its opening page, using a new named group
    (`group/title`) scoped to just the number-label + title wrapper — not
    `group/page` (that's "delete page content," a different action) and not
    an unnamed `group` (would risk the exact cross-bleed bug Phase 32 just
    fixed). Hidden while the title is mid-rename.
- Both call the same `deleteChapterWithHistory` — no duplicated delete logic
  between the two entry points.

### Verification caveat
No working `npm run build`/`lint`/`test` or GitHub/registry network access in
this sandbox. Verified via `npx tsc -b --force` only (clean) plus manual
review against the established "snapshot whole list, restore whole list"
undo pattern. **Manually verify in a real browser**: both the Sidebar icon
and the canvas title icon delete the whole chapter (title gone from the
Sidebar list, TOC, and the book itself), a single Ctrl/Cmd+Z restores
everything, and hovering the title doesn't also reveal "delete page
content" or vice versa (the two named groups should be fully independent,
per Phase 32's fix).

## Phase 35 — Style Guide values actually enforced by a checker (2026-07-31)

User picked "Remaining Virtual Editor checkers" (over EPUB/Kindle export,
accounts/cloud, and the cover designer) as the next area. Research into that
area found a concrete, already-flagged gap: `StyleGuide` has four fields
(`englishVariant`, `oxfordComma`, `measurementUnits`, `dateFormat`) that were
threaded through `CheckerContext` and exposed in the settings UI, but only
two of six fields (`quoteStyle`, `headingCapitalisation`) had a checker that
actually read them. The other four were pure UI with no effect. This phase
wires up all four.

- **`src/virtualEditor/checkers/consistency.ts`**:
  - `measurementUnitConsistencyChecker` gained a preference-mode branch: when
    `ctx.styleGuide?.measurementUnits` is `'metric'` or `'imperial'`, it flags
    any span containing a measurement in the *other* system (using the
    existing `METRIC_ABBR`/`METRIC_FULL`/`IMPERIAL_ABBR`/`IMPERIAL_FULL`
    patterns), separately from its original no-preference "don't mix systems
    within one book" logic, which still runs when no preference is set. No
    `suggestedFix` — unit conversion isn't mechanical.
  - New `englishVariantChecker` — the one Style-Guide checker that's never
    silent, since `englishVariant` defaults to `'british'` rather than having
    a "no preference" option. Flags British/American spelling pairs
    (colour/color, organise/organize, centre/center, etc. — ~30 hand-vetted
    pairs) that don't match the project's declared variant. Deliberately
    excludes genuinely ambiguous pairs (metre/meter, practice/practise,
    licence/license, programme/program, kerb/curb, tyre/tire) where the
    "wrong" spelling is also correct in a different sense in both dialects.
    Includes a case-preserving `suggestedFix`.
  - New `dateFormatChecker` — silent unless `dateFormat` is
    `'day-month-year'` or `'month-day-year'`. Only flags *unambiguous*
    violations (e.g. `13/2/2026` can't be month-first, so it's only flagged
    when the preference is day-first, never when both halves are ≤12 and
    genuinely ambiguous). `suggestedFix` swaps the two numbers — safe by
    construction, since the finding only fires when the swap is the sole
    valid reading.
- **`src/virtualEditor/checkers/copyEditing.ts`**: new `oxfordCommaChecker` —
  silent unless `oxfordComma` is `'require'` or `'forbid'`. Pattern
  deliberately requires two short segments before the conjunction (not one),
  specifically so it can't match a two-clause compound sentence's comma
  ("It was raining, and the wind was strong") — only a genuine 3+-item list
  has two segments before "and"/"or". No `suggestedFix`, matching the
  existing flag-only precedent for judgement-call checkers in this file.
- No registry changes needed — both files' exported `_CHECKERS` arrays were
  already spread into `ALL_CHECKERS` by `checkers/index.ts`; adding to those
  arrays was sufficient.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` only (clean) plus a manual read-through of both edited
files. Regex-heuristic checkers like these are exactly the kind of thing
that can typecheck clean but still misbehave against real text — same
lesson as this session's pagination and thumbnail bugs, which `tsc` alone
didn't catch. **Manually verify in the Virtual Editor dashboard**: set each
of the four Style Guide fields in Project Settings, run the checks against
a manuscript containing a deliberate violation of each (a mixed-spelling
word, a wrong-system measurement, a non-ambiguous wrong-order date, a
missing/extra serial comma), and confirm each produces exactly one finding
with a sensible message — plus confirm all four stay silent when their
field is left as "no preference."

## Phase 36 — Six new checker categories: Typography, Accessibility, Print
Readiness, Commercial Quality, Developmental, Field-guide (2026-07-31)

User directive: "keep working on it until all the phases C, D, E are
complete." This phase closes every remaining item in Phase C's checker
taxonomy except the AI-backed ones (real `AiReviewer`, AI learning) and the
UI-only ones (revision compare view, persisted revision log) — six brand
new categories, thirteen new checkers.

- **`CheckerContext` extended** (`types.ts`) with three new optional
  fields — `project`, `structuralPages`, `assets` — following the exact
  precedent `pages` set in an earlier milestone: forwarded through
  `runPipeline` (`pipeline.ts`) and `virtualEditorStore.runReview`, and
  supplied by `VirtualEditorWorkspace.tsx` (which already holds `project`
  and now also reads `structuralPageStore`/`assetStore`, exactly the same
  layer-crossing-at-the-call-site pattern `layout?.pages` already used —
  `virtualEditorStore`/`pipeline.ts` still never reach into another layer's
  store directly). `project` unlocks trim size/margins/bleed/theme/category;
  `structuralPages` unlocks front-/back-matter content (title page,
  copyright, ISBN, back cover) that never lived on `Manuscript`; `assets`
  unlocks each image's real pixel dimensions.
- **`typography.ts`** (new): `shoutingTextChecker` (2+ consecutive ALL-CAPS
  words of 5+ letters in body prose — a common plain-text-import artefact
  that should be italics/bold instead), `dropCapFirstCharacterChecker`
  (first checker to key off `resolveTheme(project.settings.themeId)` — flags
  a chapter opening with a non-letter when the theme has drop caps on),
  `consecutiveHeadingsChecker` (two headings stacked with nothing between
  them).
- **`accessibility.ts`** (new): `missingImageAltTextChecker` (major when
  neither altText nor caption exist, suggestion when only a caption is
  standing in for real alt text), `galleryMissingDescriptionsChecker`
  (surfaces the known gap that `GalleryBlock` has no per-image alt-text
  field yet, rather than saying nothing about galleries),
  `headingHierarchySkipChecker`
  (WCAG 2.4.6 — flags a heading level skipping past an intermediate level,
  e.g. H1 straight to H3), `tableMissingHeaderChecker` (WCAG 1.3.1 — a table
  with no header-row text has no column labels for a screen reader).
- **`printReadiness.ts`** (new): `lowResolutionImageChecker` (real pixel
  dimensions vs. the standard 300ppi print floor, using
  `computePageBox`/`PX_PER_MM` from `pageGeometry.ts` to resolve percentage-
  based image widths to physical mm), `imageExceedsColumnWidthChecker` (an
  explicit `widthMm` wider than the page's own content column — closes the
  "honest limitation" `layout.ts`'s `effectiveImageWidth` documented about
  not having page geometry), `kdpGutterMarginChecker` (Amazon KDP's
  published page-count-scaled inner-margin minimum table), 
  `insufficientBleedForImageryChecker` (bleed below the conventional
  0.125in/3mm minimum when a Cover/Back Cover has a full-bleed image).
- **`commercialQuality.ts`** (new): `missingCopyrightPageChecker`,
  `missingIsbnChecker` (worded softly — a platform-assigned free ISBN is a
  legitimate choice), `missingBackCoverBlurbChecker`,
  `missingTitlePageChecker`, `missingAuthorBioChecker` (checks both the
  About the Author page and the Back Cover's short bio field, so having
  either one doesn't false-positive).
- **`developmental.ts`** (new): `chapterLengthOutlierChecker` (word count
  vs. book average, same outlier-detection shape as `layout.ts`'s image-
  density checker), `placeholderChapterTitleChecker` (empty or
  "Untitled"/"Chapter"/"New Chapter" placeholder titles — distinct from
  `publishingStandards.ts`'s `emptyChapterOpenerChecker`, which checks body
  content, not the title).
- **`fieldGuide.ts`** (new): `nonfictionMissingReferenceApparatusChecker`
  (nonfiction/educational/scientific books with no Glossary/Index/
  Bibliography), `inconsistentChapterNumberingChecker` (novels/children's
  books mixing "Chapter One"-style and name-only chapter titles — flags
  whichever convention is the minority).
- `scoring.ts`'s `SCORE_TILES` already had entries for `typography`/
  `accessibility`/`print`/`commercial` (designed ahead of any checker
  existing for them) — no scoring changes needed, those tiles simply stop
  reading `null` ("Not yet analysed") the first time a review runs.
- `checkers/index.ts`'s `ALL_CHECKERS` now spreads all six new arrays.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox (`oxlint` itself
crashes with a bus error when invoked directly here — a sandbox limitation,
not a code issue). Verified via `npx tsc -b --force` only (clean, zero
errors) plus a manual read-through of every new file. **Manually verify in
the Virtual Editor dashboard**: run "Review Entire Book" against a project
with a rendered manuscript view (so `pages` is populated) and confirm the
Typography/Accessibility/Print Readiness/Commercial Quality tiles go from
"Not yet analysed" to a real score, and that a deliberately introduced
example of each new finding type (an ALL-CAPS run, a captionless image, an
undersized image, a missing copyright page, a wildly short chapter, a mixed
numbered/unnumbered chapter title) is actually caught.

## Phase 37 — Persist the revision log across a reload (2026-07-31)

User directive: keep working through Phase C/D/E, but explicitly skip the
AI-backed items (real `AiReviewer`, AI learning) for now — those need a
real architectural decision (backend vs. bring-your-own-API-key) that's
being deliberately deferred, not forgotten. This phase picks up the
concrete, non-AI item instead: the revision log surviving a page reload.

- **`src/store/virtualEditorStore.ts`** wrapped in Zustand's `persist`
  middleware (`name: 'book-studio.virtualEditor'`), with a `partialize` that
  saves **only** `revisionsByProject`. `reportsByProject` and
  `findingStatusByProject` deliberately stay in-memory-only — not a partial
  miss, a considered decision, documented at length in the file's own top
  comment:
  1. A `Finding` can carry a `suggestedFix.apply` function value, which
     can't round-trip through JSON at all (the reason this was originally
     never persisted).
  2. Even setting that aside, `Finding.id` is freshly randomly generated on
     every single "Review Entire Book" run — `runReview` already resets
     `findingStatusByProject` to `{}` on every run, *in the same session*,
     independent of any reload. A finding's accepted/rejected/ignored
     status is only ever meaningful against the exact report that produced
     it, so persisting it across a reload would just persist orphaned data
     that gets discarded the instant the user re-runs a review anyway —
     which they must do after a reload, since the report itself isn't
     persisted.
  `Revision` itself (a `ContentBlock` snapshot + a partial patch) has no
  function values and is fully JSON-safe, and — unlike a report — is useful
  on its own: `restoreRevision` doesn't require a report to exist first, so
  the permanent audit trail of every fix ever applied now survives a reload
  even though the live findings list doesn't.
- No changes needed to `Revision`'s shape or to any of the read/write
  actions — `persist` only affects what's written to/read from
  `localStorage` on top of the exact same in-memory store shape.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` only (clean). **Manually verify**: accept a fix in the
Virtual Editor dashboard (creating a revision), reload the page, open the
Revisions panel, and confirm the revision is still listed and "Restore"
still works — then separately confirm the report/findings list is correctly
empty after the reload (expected, not a bug) until "Review Entire Book" is
run again.

## Phase 38 — Original/RevA/RevB/RevC revision compare view (2026-07-31)

Closes the last non-AI item in Phase C's checklist (real `AiReviewer`/AI
Learning remain deliberately deferred per the user's explicit direction).

- **`src/layout/virtualEditor/RevisionCompareView.tsx`** (new): given every
  `Revision` applied to one specific block (oldest first), reconstructs
  each intermediate state — `Original` (the first revision's `before`
  snapshot), then one column per revision after its `after` patch applied —
  and renders them side by side using the existing `blockPlainText` helper
  from `textExtract.ts` for a plain-text comparison (no per-block-type rich
  diffing; a documented, honest scope limit, same spirit as every other
  heuristic in this codebase). `buildStateChain` merges each state onto the
  *previous computed state* rather than trusting each revision's own stored
  `before`, so the chain stays correct even in the edge case of a manual
  edit landing between two accepted fixes. Renders `null` for a block with
  only one revision — nothing to compare beyond what the existing flat
  "Restore original" button in the revision history list already offers.
- **`VirtualEditorWorkspace.tsx`**: new `revisionChainsByBlock` memo groups
  the flat `revisions` log by `blockId`, keeping only blocks with 2+
  revisions; a new "Revision compare" section renders one
  `RevisionCompareView` per qualifying block, beneath the existing flat
  "Revision history" list (which stays unchanged — a chronological log
  across the whole book, not per-block).
- Purely additive and read-only: no new store actions, no change to
  `acceptFix`/`restoreRevision`'s behaviour — this only adds a new way to
  *view* revisions that were already being recorded.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` only (clean). **Manually verify**: accept two different
fixes on the same block (e.g. a double-space fix, then later an Oxford
comma fix on the same paragraph) and confirm a "Revision compare" section
appears showing Original/RevA/RevB with the correct text at each stage.

## Phase 39 — Four PDF export fixes: justified text, image rotation,
italic/hyperlink styling, table cell wrapping (2026-07-31)

Phase C is now complete except the deliberately-deferred AI items. First
concrete slice of Phase D: four PDF-export bugs that were all pre-existing
gaps between the on-screen preview and the exported PDF (this exporter's
whole design goal, per `CLAUDE.md`'s WYSIWYG non-negotiable).

- **True justified text** (`src/pdf/textWrap.ts`): `wrapRuns` gained an
  optional `WrapRunsOptions.justify` flag. When set, every wrapped line
  except a paragraph's actual last line has its inter-word spacing
  stretched so the line's rightmost word lands exactly at `maxWidth` —
  redistributing only the *space between words* (never touching a word's
  own rendered width), the same mechanism real justified typesetting uses.
  `paragraph.tsx`'s `drawParagraphPdf` now passes
  `theme.typography.justify` — the exact flag the on-screen `<p>` already
  reads for its CSS `text-align: justify` — so the PDF finally matches
  instead of silently staying left-aligned. Drop-cap paragraphs skip
  justifying their first line's already-narrowed width against a
  now-different `maxWidth` than later lines — a minor, documented
  simplification (drop-cap paragraphs are typically short), not a silent
  bug.
- **Per-image rotation** (`src/blocks/types/image.tsx`): `drawImagePdf`
  previously never read `block.rotation` at all. pdf-lib's `rotate` on
  `drawImage` is counter-clockwise-positive and pivots around the image's
  bottom-left corner (confirmed by reading `rotateRadians`'s actual
  transformation-matrix source in `node_modules/pdf-lib`), whereas CSS
  `transform: rotate()` (what the screen renderer uses) is
  clockwise-positive and pivots around the element's own center with the
  layout box unchanged. The fix computes a shifted anchor point so pdf-lib's
  corner-pivot rotation reproduces the same "rotate in place about the
  center, same box size" visual result CSS gives — derived from pdf-lib's
  actual `translate → rotate → scale` operator pipeline, not guessed.
- **Italic and hyperlink styling** (`src/pdf/{fonts,htmlRuns,textWrap,
  drawBlockHelpers}.ts`, `paragraph.tsx`): `TextRun` now carries `italic`/
  `href` (parsed from `<em>`/`<i>`/`<a href>`, which the manuscript
  sanitiser already preserved — see `parser/html.ts` — just never consumed
  here). Italic runs render in a real italic font — but since no italic
  `.woff2` exists in `public/fonts` and this sandbox has no network access
  to fetch one, `pickItalicFont` (`fonts.ts`) falls back to pdf-lib's
  built-in standard-14 fonts (Helvetica Oblique / Times Italic), which need
  no embedding at all (no fetch, so no network dependency) — a real,
  correct italic slant, just a different typeface for italic runs
  specifically from the rest of the paragraph. Honestly documented as a
  known limitation, not silently faked. Link runs render in the theme's
  accent colour with a real underline rule — genuine visual distinction —
  but deliberately **not** a clickable PDF link annotation: hand-constructing
  a `/Link` annotation via pdf-lib's low-level object API with no PDF
  viewer available in this environment to confirm it actually resolves was
  judged too large/unverifiable a side quest for a print-first exporter,
  especially with EPUB export (where links matter far more) landing next
  in this same phase.
- **Table cell text wrapping** (`src/blocks/types/table.tsx`):
  `drawTablePdf` previously drew each cell's raw text at a fixed x with no
  wrapping at all — a long cell simply overflowed into neighbouring
  columns. New `drawTableRow` helper wraps each cell independently to its
  own column width via the existing `wrapRuns`/`drawWrappedLines`, using an
  isolated per-cell scratch `DrawCtx` (so `drawWrappedLines`'s internal
  cursor mutation never leaks between cells) and advancing the row's real
  cursor once by whichever cell wrapped to the most lines, keeping every
  cell in a row vertically aligned regardless of how much any one cell
  wrapped.
- All four changes are additive to `wrapRuns`/`drawWrappedLines`'s
  signatures (new trailing optional-object parameters) — the ~20 other call
  sites across `src/blocks/types/` and `src/structuralPages/types/` that
  don't need italic/justify/link behaviour compile and run completely
  unchanged.
- **Real font subsetting** (a separate Phase D checklist item) is not part
  of this phase and is now marked blocked-in-this-environment in
  `docs/ROADMAP.md`: pdf-lib 1.17.1 (the installed version) has no
  subsetting API, and getting one would need installing a different or
  forked package — this sandbox has no npm registry access to do that.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` only (clean) plus hand-derivation of the image-rotation
math against pdf-lib's actual operator source (not just assumed). **Manually
verify a real exported PDF**: a justified-theme paragraph's lines reach the
right margin evenly (except its last line), a 90°/180°/270°-rotated image
exports rotated in the same visual position as the on-screen preview, a
paragraph with `<em>`/`<a href>` text shows a visibly different (though not
identical-family) italic and an underlined accent-coloured link, and a table
with a long cell wraps within its column instead of overflowing.

## Phase 40 — Real EPUB3 export, dependency-free (2026-07-31)

The biggest remaining Phase D item. Unlike PDF export, EPUB is reflowable
HTML+CSS, so this never touches pagination, manual text-wrapping, or font
embedding at all — a materially simpler problem than the PDF exporter, once
one real gap was closed: **no zip library is installed, and this sandbox
has no npm registry access to add one** (`npm install` fails here — a
known, standing limitation this whole session). A real Vercel deployment
build *would* be able to fetch a new dependency, but adding one anyway
would mean shipping code I could never actually typecheck or run in this
environment before the user pushes it. Chose instead to write a small,
from-scratch, dependency-free ZIP writer — both more verifiable here and a
smaller footprint for something the ZIP format's STORE/DEFLATE-plus-
central-directory core doesn't really need a whole package for.

- **`src/epub/crc32.ts`** (new): standard IEEE/zlib/PKZIP CRC-32 — a
  table-driven ~20-line implementation, needed because every ZIP header
  requires each entry's CRC.
- **`src/epub/zipWriter.ts`** (new): `buildZip(entries)` writes real local
  file headers, a central directory, and an end-of-central-directory
  record. Compression uses the Web platform's built-in `CompressionStream`
  (`'deflate-raw'`) — no dependency, just a browser-API version floor
  (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) consistent with the rest of
  the app. Supports a `store` flag per entry for EPUB's own requirement
  that its `mimetype` entry be the very first, stored (uncompressed) entry
  in the archive.
- **`src/epub/blockToXhtml.ts`** (new): converts each of the 14
  `ContentBlock` types to semantic XHTML. Paragraph's `html` field (already
  sanitised to `<strong>`/`<em>`/`<a>` by `parser/html.ts`) is reused
  verbatim — it's already valid XHTML. Body heading levels shift down one
  (`h1`→`h2` etc.) since each chapter file uses its own title as that
  file's `<h1>` — the same heading-outline concern
  `accessibility.ts`'s `headingHierarchySkipChecker` checks for, applied
  here to keep the export itself correct.
- **`src/epub/structuralPageToXhtml.ts`** (new): converts front-/back-matter
  structural pages, returning `null` (skip entirely) for a `blank` page
  (a print-pagination-only concept with no reflowable equivalent) or any
  page with no content entered. Barcode pages export their ISBN as text
  only — a scannable barcode graphic is a physical-print requirement with
  no meaning in an ebook file.
- **`src/epub/stylesheet.ts`** (new): generates one CSS file from the
  project's `resolveTheme()` output (fonts, colours, justify, drop-cap via
  `::first-letter`) — no embedded font files (unlike the PDF exporter,
  every EPUB reader ships its own system fonts, so `font-family` with a
  generic fallback is enough for a close, correctly-themed match without
  bundling `.woff2` files into every exported `.epub`).
- **`src/epub/exportEpub.ts`** (new): orchestrates the whole package —
  `mimetype`, `META-INF/container.xml`, `content.opf` (metadata + manifest +
  spine), an EPUB3 `nav.xhtml` plus a `toc.ncx` for older-reader
  compatibility, one XHTML file per chapter and per non-empty structural
  page, and every referenced image (chapter image/gallery blocks, plus
  cover/back-cover/about-the-author's `imageAssetId`) rasterised to PNG via
  the PDF exporter's existing `blobToPng` and embedded once each.
- **`src/epub/useExportEpub.ts`** (new): same shape as `pdf/useExportPdf.ts`,
  but reads the raw manuscript/structural pages directly — `canExport` only
  needs a manuscript to exist, so EPUB export works even before the
  manuscript workspace has rendered this session (no `layout` dependency).
- **`Toolbar.tsx`**: the single "Export PDF" button became an "Export ▾"
  dropdown (using the already-installed `@radix-ui/react-dropdown-menu` —
  no new dependency) offering "Export PDF" and "Export EPUB" separately.

### Verification
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` (clean) plus a real, independent structural
verification of the ZIP format itself: `scripts/test-zip-writer.mjs`
reproduces `crc32.ts`/`zipWriter.ts`'s exact logic standalone (Node 22 also
has `CompressionStream`), builds a small three-entry test archive, and —
rather than trusting my own writer to check its own work — the *result*
was validated against two completely independent, unrelated tools: Python's
`zipfile.testzip()` reports no CRC/structural errors and extracts all three
entries byte-identical to what was written (including the stored,
uncompressed `mimetype` entry), and the `file` command (libmagic) correctly
identifies the archive as `EPUB document` from its magic bytes. This is
real, higher-confidence verification than `tsc` alone, precisely because
`tsc` can't check byte-level file-format correctness — the risk this
project's own history (the pagination/thumbnail bugs from earlier this
session) shows `tsc` alone reliably misses. Still outstanding: opening the
actual exported `.epub` in a real reading app (Apple Books, Calibre, a
Kindle-via-Send-to-Kindle conversion, etc.) to confirm rendering/navigation
end-to-end — no such app is available in this sandbox.

## Recommended next task
Manually verify Phase 40's EPUB export in a real e-reader (see verification
note above). Continuing to Phase 41 below.

## Phase 41 — Pre-export KDP/IngramSpark-style validation gate (2026-07-31)

Research into Phase D's "ISBN + barcode field and placement" and
"Print-on-demand validation profiles" items found the first was already
substantially shipped: `isbn-page`/`barcode` are real, dedicated
back-matter structural page types (Phase 21) with working PDF rendering
(and now EPUB export, Phase 40) — ticked in `docs/ROADMAP.md` with a note
about what's still an honest placeholder (the barcode's bars aren't a real
scannable EAN-13 symbol, documented since Phase 21). The genuinely open
item was validation profiles, closed this phase.

- **`src/virtualEditor/exportReadiness.ts`** (new): `checkExportReadiness(ctx)`
  re-runs *only* the `print`/`commercial` category checkers already built
  in Phase 36 (KDP gutter-margin table, bleed minimums, low-resolution
  images, missing copyright/ISBN/back-cover-blurb/title-page) — deliberately
  not a new rule set or a duplicated checker, per `CLAUDE.md`'s "avoid
  duplicate logic." `hasBlockingReadinessIssues` treats `critical`/`major`
  findings as worth interrupting the user for; `minor`/`suggestion` findings
  don't trigger the gate.
- **`src/hooks/useExportReadiness.ts`** (new): assembles the same
  `CheckerContext` shape `VirtualEditorWorkspace.tsx` builds for a full
  review (manuscript, project, structural pages, assets, and — if
  available this session — real paginated `pages`), memoised, and runs
  `checkExportReadiness` against it.
- **`src/components/common/ExportReadinessDialog.tsx`** (new): lists the
  blocking findings with their `whyItMatters` explanation and offers
  "Go back and fix" or "Export anyway" — never a hard block, matching
  `CLAUDE.md`'s AI Philosophy ("never make destructive edits without
  confirmation") extended to "don't silently ship something that would
  fail a printer's or a reader's expectations without at least asking."
- **`Toolbar.tsx`**: both "Export PDF" and "Export EPUB" now route through
  `handleExportClick`, which checks `hasBlockingIssues` first and only
  opens the confirmation dialog when there's something worth flagging —
  otherwise export proceeds immediately exactly as before, so a
  ready-to-publish book sees zero change in the export flow.

### Verification caveat
No working `npm run build`/`lint`/`test` in this sandbox. Verified via
`npx tsc -b --force` only (clean). **Manually verify**: a project missing a
copyright page or with an under-resolution image shows the readiness
dialog on Export PDF/EPUB, "Export anyway" proceeds with the real export,
"Go back and fix" just closes the dialog, and a project with none of those
issues exports immediately with no dialog at all.

## Phase 42 — Single-file HTML/web-book export (2026-07-31)

Closes another Phase D item, made cheap by Phase 40's EPUB work: EPUB
already needed `blockToXhtml`/`structuralPageToXhtml`/`buildEpubStylesheet`
to convert every block/page type to real semantic HTML+CSS — a single-file
HTML export is the same conversion with different packaging, not a third
implementation of block-to-markup conversion (which would have violated
`CLAUDE.md`'s "avoid duplicate logic").

- **`src/epub/exportHtmlBook.ts`** (new): reuses every EPUB building block
  as-is. The two real differences from `exportEpub.ts`: every image is
  inlined as a base64 `data:` URI (via a new chunked `bytesToDataUri`,
  chunked specifically to avoid `String.fromCharCode(...bytes)` throwing a
  stack-size error on a large image) instead of a separate zip entry, so
  the result is one genuinely self-contained file with nothing else to
  keep track of; and chapters are addressed with in-page `#id` anchors in
  a simple table-of-contents `<nav>` instead of an EPUB nav
  document/spine, since a single flat HTML file has no navigation-document
  format to speak of.
- **`src/epub/exportEpub.ts`**: `collectImageAssetIds` changed from private
  to exported, so the HTML exporter reuses the exact same image-reference
  scan instead of a second copy of it.
- **`src/epub/useExportHtmlBook.ts`** (new): same shape as
  `useExportEpub.ts`.
- **`Toolbar.tsx`**: "Export" dropdown gained a third item, "Export HTML —
  single-file web book"; the pre-export readiness gate (Phase 41) now
  covers all three formats.

### Verification
`npx tsc -b --force` clean. The one genuinely new piece of logic here
(`bytesToDataUri`'s chunking) was verified standalone in Node against a
500KB buffer: encodes without a stack error and round-trips byte-identical
after decoding — the same "don't just trust `tsc`, actually exercise the
new logic" standard `zipWriter.ts`'s Phase 40 verification set. Still
outstanding: opening a real exported `.html` file in a browser to confirm
it renders correctly end-to-end (styling, images, in-page chapter links) —
not exercised here since it needs an actual manuscript with images loaded,
which this sandbox has no project data to generate from.

## Phase 43 — Visual theme gallery + two new built-in themes (2026-07-31)

Closes two Phase E roadmap items together, per `CLAUDE.md`'s "the interface
should be visual rather than settings-based wherever possible": replaces
`ProjectSettingsDialog.tsx`'s plain `<Select>` theme dropdown with a real
visual gallery.

- **`src/theme/presets.ts`**: two new entries in `PRESETS` —
  `modern-minimalist` (clean Inter sans-serif, no justify/drop-cap, wide
  chapter-opener spacer) and `academic-journal` (dense justified Source
  Serif 4, numbered chapters). Both deliberately reuse only the two font
  families this app actually self-hosts and embeds in exported PDFs
  (`"Inter", sans-serif` / `"Source Serif 4", serif` — see `pdf/fonts.ts`'s
  `loadThemeFonts`), so on-screen preview and exported PDF never diverge.
- **`src/types/theme.ts`**: matching `BUILT_IN_THEMES` entries — 7 built-in
  themes total now, up from 5.
- **`src/components/settings/ThemeGallery.tsx`** (new): `ThemePreviewCard`
  renders each theme's *actual* resolved values (`resolveTheme()` output) —
  real background colour, real heading font/weight, real accent-coloured
  rule, real body text with the theme's real justify/drop-cap/line-height
  settings, real chapter-opener numeral/word preview — not just a name and
  a one-line description. `ThemeGallery` lays these out in a responsive
  grid; selecting one still just calls `onChange`, which
  `ProjectSettingsDialog.tsx` wires straight into
  `updateProjectSettings({ themeId })` exactly as the old dropdown did, so
  switching still regenerates the whole book instantly with no
  re-import — the same non-negotiable the dropdown already satisfied.
- **`ProjectSettingsDialog.tsx`**: swapped the old `<Select>` theme picker
  for `<ThemeGallery>`; the `Select`-family imports stayed, since the trim
  size and Style Guide pickers further down the same dialog still use them.

### Verification caveat
`npx tsc -b --force` clean. Not exercised: opening the dialog in a real
browser to confirm the grid renders and clicking a card actually re-themes
the live preview — this sandbox cannot run `vite dev`/`vite build`
(confirmed again this session: `vite.config.ts`'s config loader fails with
a Node ESM syntax error unrelated to this change), so **manually verify**
in Chrome once pushed: open Project Settings, confirm all 7 built-in cards
render distinct real previews, and confirm selecting one instantly
re-themes the open book.

## Phase 44 — Custom theme editor (2026-07-31)

Closes the last piece of Phase E task "theme gallery + custom theme
editor": users can now design and save their own theme, not just pick
from the built-in 7.

- **`src/store/customThemeStore.ts`** (new): a `persist`-backed Zustand
  store holding `customThemes: CustomTheme[]` (global, not per-project — a
  theme a user designs is meant to be reusable across every project, like
  the built-ins). `CustomTheme extends ResolvedBookTheme` with `isCustom:
  true` and a `description`. `addCustomTheme`/`updateCustomTheme`/
  `deleteCustomTheme` actions; deleting one requires no migration — any
  project still pointing at a deleted theme id falls back to the first
  built-in the next time `resolveTheme` runs, the same "optional field,
  default in code" pattern used everywhere else in this codebase.
- **`src/theme/presets.ts`**: `resolveTheme()` now checks
  `useCustomThemeStore.getState().customThemes` before falling back to the
  hardcoded `PRESETS` map, so every existing call site — PDF export,
  on-screen rendering, `HeightMeasurer`, every Virtual Editor checker that
  reads theme data — picks up a custom theme with zero changes elsewhere,
  same as any built-in theme id. `listThemes()` extended the same way.
  Reading a Zustand store from a non-React module is safe (stores are
  plain subscribable objects outside React too); this stays a same-layer
  read (Theme reading Theme data), not a cross-layer violation.
- **`src/components/settings/CustomThemeEditorDialog.tsx`** (new):
  create/edit form for a custom theme — name, heading/body font (a
  `<Select>` restricted to the same two embeddable families Phase 43 used,
  never a free-text field: an arbitrary CSS font-family would render with
  *some* system font on screen but silently fall back to Inter in the
  exported PDF, breaking true WYSIWYG), five `<input type="color">` colour
  fields (background/ink/mutedInk/accent/ruleColor), body size, line
  height, heading weight, chapter-opener label, and `Switch` toggles for
  justify/drop-cap. Deliberately has no margin fields — margins are
  Project settings (Layer 1), already fully customisable per-project
  regardless of theme, per `docs/SYSTEM_ARCHITECTURE.md`'s layer split;
  conflating them into "theme" would be an architecture violation even
  though the original roadmap wording grouped them together.
- **`ThemeGallery.tsx`**: now also lists every custom theme alongside the
  7 built-ins, each with hover-revealed edit/delete icon buttons (built-ins
  never show these), plus a trailing dashed "+ Create custom theme" card.
  Saving a new or edited theme calls `onChange` immediately with the saved
  theme's id, so it applies without a second click. Deleting the
  currently-active theme falls the selection back to the first built-in
  theme immediately, rather than leaving `themeId` pointing at a
  now-deleted id until the next render happens to call `resolveTheme`.

### Verification caveat
`npx tsc -b --force` clean (including the new
`presets.ts` → `customThemeStore.ts` import — a type-only import back from
`customThemeStore.ts` to `presets.ts` keeps this from being a real runtime
cycle). Same as Phase 43: this sandbox cannot run a real browser session,
so **manually verify** once pushed: create a custom theme, confirm it
appears in the gallery and applies instantly; edit it and confirm the
change reflects; delete it while it's the active theme and confirm the
project falls back to Classic Novel without erroring; confirm a custom
theme also renders correctly in an exported PDF (proves the `resolveTheme`
lookup really is used by the PDF layer, not just on-screen).

## Phase 45 — Dedicated cover/back-cover designer (2026-07-31)

Closes Phase E's last buildable item, task #32. Scoped deliberately smaller
than the roadmap wording's full ambition ("layout templates, draggable
element positioning, spine-width calculation for a real wraparound
cover") — a genuinely freeform multi-element x/y canvas and a single
merged wraparound-cover artwork file are both much larger, riskier
rewrites than the remaining milestone budget allows, and would touch
Cover/Back Cover's fundamental one-page-per-side data model (a real
wraparound cover needs front+spine+back as one spread, not two
independent `StructuralPage`s). What shipped is real and used end-to-end
(screen, PDF, and the Inspector), not a mockup:

- **`src/types/structuralPage.ts`**: `CoverPage`/`BackCoverPage.content`
  gained two new optional fields — `layout?: CoverTextLayout` ('centered'
  | 'top' | 'bottom', absent meaning 'centered', so every pre-existing
  project renders identically to before) and `verticalNudge?: number`
  (-1..1, a fine-tune offset within the chosen layout's zone).
- **`src/structuralPages/coverLayout.ts`** (new): the shared layout math
  used by *both* the on-screen renderer and the PDF exporter, so the two
  can never drift apart — `computeCoverLayoutScreenStyle` (flex
  justification + zone padding, computed in real px from `pageBox`, never
  a CSS percentage — padding percentages resolve against the containing
  block's *width*, which would distort a portrait page) and
  `computeCoverLayoutCursorY` (the PDF-side equivalent, in PDF points).
  `COVER_NUDGE_RANGE_PX` is the single shared constant both sides multiply
  by their own unit conversion, so a full drag moves the text by the same
  physical distance on screen and in the exported PDF.
- **`src/structuralPages/shared.tsx`**: new `CoverNudgeHandle` — a small
  drag handle (pointer events, not HTML5 `dataTransfer` drag — this
  codebase's existing asset-drop drag isn't suited to live coordinate
  dragging, and there was zero prior art for freeform positioning
  anywhere in the app before this). Live-drags a local preview value
  (`onLiveChange`) without touching the store, then commits exactly once
  on pointer-up (`onCommitFinal`) — one drag gesture is one undo-history
  entry, not one entry per pointer-move tick. Only rendered while the page
  is selected, matching `ThemeGallery.tsx`'s existing hover/selection-
  gated affordance pattern.
- **`src/structuralPages/types/cover.tsx`** / **`backCover.tsx`**: both
  `*Render` components now compute `computeCoverLayoutScreenStyle` and
  apply it via inline `justifyContent`/padding/`translateY`, and render
  `<CoverNudgeHandle>` above their text/blurb block when selected. Both
  `drawCoverPdf`/`drawBackCoverPdf` now call `computeCoverLayoutCursorY`
  instead of a single hardcoded centred formula — the default/'centered'
  path was written to reproduce the *exact* pre-existing formula bit for
  bit (verified by inspection, not just "should be equivalent"), so no
  project that never touches the new layout picker sees any visual change
  at all.
- **`src/cover/spineWidth.ts`** (new): `computeSpineWidthIn`/
  `computeSpineWidthMm`, using Amazon KDP's own published pages-per-inch
  figures per paper stock (the same public source already cited by
  `virtualEditor/checkers/printReadiness.ts`'s `kdpGutterMarginChecker`).
  Always presented as an estimate, never a guarantee — IngramSpark's own
  constants differ slightly per stock.
- **`src/layout/inspector/StructuralPagePanel.tsx`**: new `LayoutPicker`
  (three one-click buttons: Top/Centered/Bottom, for both Cover and Back
  Cover) and new `SpineWidthInfo` (paper-type `<Select>` + a live
  page-count read from `useExportStore` — the same paginated layout
  `BookRenderer` has on screen, so it reflects the *real* current book,
  not a stale estimate). Deliberately placed as informational/planning
  text, not a live-editable spine element, since there's no single
  wraparound artwork file to edit yet.
- **Deliberately NOT touched**: `src/epub/structuralPageToXhtml.ts` — a
  reflowable e-reader page has no concept of vertical anchoring within a
  fixed page the way print/on-screen preview does (there's no "page
  height" to anchor within), so applying `layout`/`verticalNudge` there
  would have no meaningful reader-visible effect. EPUB/HTML export stay
  exactly as they were.

### Verification caveat
`npx tsc -b --force` clean. As with every phase this session, this
sandbox cannot run a real browser session (`vite`'s config loader still
fails here) — **manually verify** once pushed: select a Cover, switch
between the three layout buttons and confirm the on-screen preview moves;
drag the small handle and confirm a live preview follows the pointer,
then release and confirm it stays (and that Undo reverts the whole drag
in one step, not many); export to PDF and confirm the exported page
matches the on-screen position; open a project that predates this phase
(no `layout`/`verticalNudge` in its stored content) and confirm its
Cover/Back Cover render pixel-identical to before.

## Phase 46 — Cover designer: images, overlay, fonts + EPUB cover fix (2026-07-31)

Requested directly by the user, thinking as a first-time self-published
author with no design experience: "I can't easily pick a photo," "my photo
crops oddly," and "everything's the same font as the interior." Also
fixed a real correctness bug found while researching this: EPUB export
never flagged the cover image as the book's actual cover.

- **`src/types/structuralPage.ts`**: `CoverPage`/`BackCoverPage.content`
  gain `imageFocalPoint?` (`{x,y}`, 0..1), `imageZoom?` (`>=1`),
  `overlayStyle?` (`'flat' | 'gradient-bottom' | 'gradient-top' | 'none'`),
  `overlayOpacity?`, and `typography?` (`{fontChoice, weight, italic,
  sizeScale}`). Every field absent reproduces this milestone's
  pre-existing fixed look exactly — verified by inspection for the
  centred/flat/theme-font defaults, same standard as every prior phase's
  "no regression for existing projects" claim.
- **`src/structuralPages/coverImageFit.ts`** (new): shared focal-point +
  zoom math for both the screen (`object-position` + `scale()` transform,
  pivoted on the focal point) and the PDF exporter (a placement formula
  that mirrors CSS `object-position` semantics exactly, y-axis flipped for
  pdf-lib's bottom-up coordinate space). At the defaults (focal `0.5,0.5`,
  zoom `1`) the PDF formula reduces algebraically to the exact pre-existing
  centred-crop expression.
- **`src/structuralPages/coverOverlay.ts`** (new): shared overlay
  rendering. `'flat'` is unchanged from before. The two gradient options
  render as a real CSS `linear-gradient` on screen; in the PDF (which has
  no native gradient-fill primitive in pdf-lib's high-level API) the same
  fade is approximated with 40 thin, increasingly-transparent horizontal
  bands — a standard technique, not a true PDF shading pattern, documented
  as such.
- **`src/structuralPages/coverTypography.ts`** (new): resolves a cover's
  actual font family/weight/size from an optional override, falling back
  to the book's interior theme when absent. Only two real family choices
  exist (Inter, Source Serif 4) — the only two this app embeds.
- **`src/structuralPages/shared.tsx`**: three new components —
  `CoverImageUploadButton` (hidden `<input type="file">` + `assetStore.
  importFiles`, so uploading doesn't require knowing sidebar
  drag-and-drop exists), `CoverFocalPointPicker` (click-anywhere-on-the-
  photo crosshair), `CoverSafeZoneGuide` (dashed guide at KDP's published
  0.25in minimum text-safety margin beyond bleed — purely on-screen,
  never exported).
- **`src/store/uiStore.ts`**: new `showCoverSafeZone` (persisted app
  preference, not project data — same reasoning as `showThumbnails`).
- **`src/structuralPages/types/cover.tsx`, `backCover.tsx`**: wire all of
  the above into both `*Render` (upload button + focal picker + safe-zone
  guide + resolved overlay/typography) and `drawCoverPdf`/
  `drawBackCoverPdf` (image placement via `computeCoverImagePdfPlacement`,
  overlay via `drawCoverOverlayPdf`, font resolution via
  `resolveCoverFontFamily`/`resolveCoverWeight`/`resolveCoverSizeScale`,
  italic via the existing `pickItalicFont` from Phase 39).
- **`src/layout/inspector/StructuralPagePanel.tsx`**: new
  `ImageAdjustmentsPanel` (zoom slider, overlay-style buttons, overlay-
  strength slider — only shown once an image exists), `CoverTypographyPanel`
  (font-choice/weight buttons, italic switch, size slider), `SafeZoneToggle`.
  Wired into both the Cover and Back Cover sections.
- **`src/epub/exportEpub.ts`**: the cover's image manifest `<item>` now
  gets `properties="cover-image"`, and `<metadata>` gets an EPUB2-
  compatibility `<meta name="cover" content="img-...">` pointer — Kindle
  Previewer, Apple Books, and library-grid views read one of these two to
  decide what to show as a book's thumbnail; previously neither existed,
  so the real cover artwork likely never appeared anywhere outside the
  book's own first page.
- **`public/fonts/custom/README.md`** (new): a folder + documented,
  numbered steps for wiring in more font families once real `.woff2` files
  exist — this sandbox's outbound network is still blocked (re-confirmed
  this session: a direct fetch to `fonts.gstatic.com` for an open-license
  display font returned the same proxy 403 as prior sessions), so an
  agent can't fetch new font files itself; a human (or a future session
  with network access) needs to drop real files in first.

### Verification caveat
`npx tsc -b --force` clean. As with every phase this session, this
sandbox cannot run a real browser session — **manually verify** once
pushed: upload a cover image by clicking (not dragging); click the photo
to move the focal point and confirm the crop follows; drag the zoom
slider and confirm it zooms around the focal point rather than a corner;
switch overlay styles and confirm the gradient options only darken one
edge; change the font/weight/italic/size and confirm the live preview
updates; toggle the safe zone and confirm the dashed guide appears; export
to PDF and confirm all of the above matches the on-screen preview
(image crop, overlay, font, gradient banding); export to EPUB and confirm
the cover shows correctly in an e-reader or the Kindle Previewer's library
view; open a project that predates this phase and confirm its Cover/Back
Cover render pixel-identical to before (no `imageFocalPoint`/`overlayStyle`/
`typography` in its stored content).

## Phase 47 — Editorial notes (2026-07-31)

The other half of a feature discussed with the user two turns before this
one (the plan also covered placeholder content blocks — "photo goes here"
with a description — which is still open, not built this phase; see
`docs/ROADMAP.md` Phase F). Lets a user select any paragraph/block or
structural page and leave a note about it in the Inspector, the same way
Word/Google Docs comments work but simpler (no threading, no multi-user
sharing — that's Phase G's separate, much bigger "real-time collaboration"
item, not this).

- **`src/store/notesStore.ts`** (new): a `persist`-backed Zustand store —
  a new, additive "Annotations" side-channel, not part of `ContentBlock`/
  `StructuralPage` (Layer 2). A `Note` references its target by id only
  (`blockId`+`chapterId`, or `structuralPageId`), exactly the same pattern
  `virtualEditor/types.ts`'s `Finding.location` already uses — never
  mutates Content/Structural Page data, and is never read by PDF/EPUB/HTML
  export (notes are an authoring aid, not book content). Multiple notes
  can target the same block/page, each independently resolvable/
  deletable/editable.
- **`src/store/editorActions.ts`**: four new history-aware wrappers
  (`addNoteWithHistory`, `updateNoteTextWithHistory`,
  `setNoteResolvedWithHistory`, `deleteNoteWithHistory`), same
  snapshot-before-mutate-then-`historyStore.record` shape as every other
  wrapper in this file. Text edits commit on the note textarea's blur, not
  per keystroke — one edit session is one undo step, same convention
  `CoverNudgeHandle` established in Phase 45.
- **`src/store/uiStore.ts`**: `InspectorTab` gains `'notes'`.
- **`src/layout/Inspector.tsx`**: new "Notes" tab.
- **`src/layout/inspector/NotesPanel.tsx`** (new): reads the current
  selection (`selectionStore`'s block or structural-page selection —
  whichever is active) and lists that target's notes (open ones first,
  resolved ones dimmed at the end) above a composer for adding another.
  Selecting nothing shows an empty state explaining what to do.
- **`src/renderer/NoteIndicatorBadge.tsx`** (new) + **`Page.tsx`**: a
  small badge on any block or structural page with at least one
  unresolved note (top-left corner, distinct from `BlockToolbar`/
  `PageToolbar`'s top-right position), showing the open count — clicking
  it selects the target and jumps straight to the Notes tab. Disappears
  entirely once every note on a target is resolved, so a manuscript with
  fully-addressed notes stays visually quiet.

### Verification caveat
`npx tsc -b --force` clean. As with every phase this session, this
sandbox cannot run a real browser session — **manually verify** once
pushed: select a paragraph, add a note, confirm the badge appears on the
block; click the badge and confirm it jumps to the Notes tab with that
exact note; resolve it and confirm the badge disappears (and the note
moves to the dimmed "Resolved" section, still visible in the panel);
undo/redo through an add/edit/resolve/delete sequence and confirm each
step reverses in exactly one step; reload the page and confirm notes
persisted; add a note to a structural page (e.g. the Cover) and confirm
the same flow works there.

## Phase 48 — Placeholder content blocks (2026-07-31)

The other half of the two-part request that also produced Phase 47's
notes feature — "a way of adding placeholder elements like an image box
with text describing what will be there." New `placeholder` content
block, built with the same block-type-registry pattern every prior block
type has used (see `src/blocks/registry.ts`), so it participates in
on-screen rendering, PDF export, and the "+" inserter with the same
mechanism as the other 13 types.

- **`src/types/content.ts`**: `PlaceholderKind = 'image' | 'chart' |
  'table' | 'diagram' | 'generic'`; `PlaceholderBlock { id, type:
  'placeholder', kind, label?, description? }` added to the
  `ContentBlock` union. Doc comment states the deliberate design decision
  carried over from the original plan: placeholders stay **visibly
  rendered in every exported format**, never hidden — a real, obvious
  dashed box beats a silent missing-content gap in a shipped book.
- **`src/blocks/types/placeholder.tsx`** (new): `PlaceholderRender`
  mirrors `callout.tsx`'s editable-field pattern exactly (double-click to
  edit label/description via `useEditableField`); renders a fixed-height
  dashed box with a kind icon (`ImagePlus`/`BarChart3`/`Table2`/`Shapes`/
  `Box`). `drawPlaceholderPdf` draws a real dashed rectangle using
  pdf-lib's native `borderDashArray`, with label/description
  vertically centred inside the box.
- **`src/blocks/registry.ts`** / **`src/blocks/defaultContent.ts`**:
  registered as `placeholder`; insertable via the "+" button (defaults to
  `kind: 'image'`, the most common case — switch it afterward in the
  Inspector).
- **`src/layout/inspector/TypographyPanel.tsx`**: Type tab gets a Kind
  picker (Image/Chart/Table/Diagram/Other button grid) plus a hint about
  double-clicking the preview to edit label/description.
- **`src/epub/blockToXhtml.ts`** / **`src/epub/stylesheet.ts`**: matching
  dashed-box treatment in EPUB/HTML export (`div.bs-placeholder`) — same
  "always visible" rule applies to every export format, not just PDF.
- **`src/virtualEditor/checkers/commercialQuality.ts`**:
  `remainingPlaceholdersChecker` — one `Finding` per remaining
  placeholder block, `critical` severity, full confidence (this is a
  literal content-completeness check, not an editorial judgement call
  like the rest of this file). Added to `COMMERCIAL_QUALITY_CHECKERS`,
  which `exportReadiness.ts` already folds into `READINESS_CHECKERS` —
  `critical` severity already trips `hasBlockingReadinessIssues`, so the
  existing Phase 41 pre-export dialog blocks on unresolved placeholders
  with **zero new UI wiring**.

### Verification caveat
`npx tsc -b --force` clean. Manually verify once pushed: insert a
placeholder block via "+", confirm the dashed box renders with the
correct icon per kind; double-click and edit the label/description,
confirm it saves; switch kind via the Inspector and confirm the icon/
default label updates; export to PDF and confirm the same dashed box
(with `borderDashArray`) appears in the same position as the on-screen
preview; export to EPUB and open in a reader, confirming the dashed CSS
box renders; open the pre-export readiness dialog with an unresolved
placeholder in the manuscript and confirm it's listed as a blocking
(critical) finding that links back to the exact block; resolve it (change
the block to real content or delete it) and confirm the finding clears.

## Phase 49 — Cover/Back Cover: text visibility + colour (2026-07-31)

The user shared four real published-book cover mockups and asked for two
concrete things the designer couldn't do yet: hide the title/subtitle/
author (or blurb/author-bio) entirely for a photo-only cover, and control
font colour rather than the fixed automatic white-on-photo/theme-ink
rule. Researching the ask surfaced two real export bugs along the way,
both fixed in the same pass (see below).

- **`src/types/structuralPage.ts`**: `CoverTextFieldId = 'title' |
  'subtitle' | 'author'`, `BackCoverTextFieldId = 'blurb' | 'authorBio'`;
  `hiddenFields?: CoverTextFieldId[]` / `BackCoverTextFieldId[]` added to
  `CoverPage.content`/`BackCoverPage.content`. `CoverTypographyOverride`
  gains `color?: string` (title/blurb) and `secondaryColor?: string`
  (subtitle/author/author-bio, one shared override rather than three
  separate pickers — matches the app's existing ink/mutedInk two-tier
  model). Absent/empty reproduces every pre-existing project's exact
  current look — no migration.
- **`src/structuralPages/coverVisibility.ts`** (new): `isFieldHidden`/
  `toggleHiddenField` — hiding a field never clears its stored text, only
  whether it's drawn; switching it back on restores it unchanged.
- **`src/structuralPages/coverTypography.ts`**: `resolveCoverColor`/
  `resolveCoverSecondaryColor` — override-wins-else-automatic-fallback,
  same shape as the existing `resolveCoverFontFamily`/`resolveCoverWeight`.
- **`src/structuralPages/shared.tsx`**: `FieldVisibilityToggle` (small
  eye/eye-off pill, only rendered while the page is selected — same
  gating as `CoverNudgeHandle`) and `HideableTextField` (wraps
  `EditableText` with the toggle; a hidden-and-unselected field renders
  nothing at all, matching the real exported look exactly; hidden-and-
  selected shows it dimmed + italic so hiding is never a silent,
  unrecoverable-looking action).
- **`src/structuralPages/types/cover.tsx`**: title/subtitle/author now use
  `HideableTextField`; colours resolved via `resolveCoverColor`/
  `resolveCoverSecondaryColor` on both the on-screen renderer and
  `drawCoverPdf`. **Bug fix**: `drawCoverPdf` previously fell back to the
  literal string `'Untitled'` when the title was empty — that was always
  an on-screen-only editing placeholder (`EditableText`'s `placeholder`
  prop), never something a real export should print; a true photo-only
  cover would otherwise have shipped with "Untitled" baked into the PDF.
  Fixed to draw nothing when the title is hidden or genuinely blank.
- **`src/structuralPages/types/backCover.tsx`**: same treatment for
  `blurb`/`authorBio`, plus the exact same class of bug fix —
  `BLURB_PLACEHOLDER` ("Add back-cover copy — a short, compelling
  summary…") was previously drawn as literal PDF text when the blurb was
  empty; now only ever shown on screen as an editing cue, never exported.
- **`src/layout/inspector/StructuralPagePanel.tsx`**: `CoverTypographyPanel`
  gains two `<input type="color">` swatches (reusing the exact pattern
  `CustomThemeEditorDialog.tsx` already uses) with a "Reset" button that
  clears back to automatic; new `FieldVisibilitySwitch` component mirrors
  the on-canvas eye toggle as a `Switch` next to each Title/Subtitle/
  Author/Blurb/Author-bio field, for users who don't spot the small
  on-page icon.
- EPUB export needed no changes — it embeds the raw cover image asset
  only (`exportEpub.ts`'s `properties="cover-image"`), never a
  text-composited render, so text visibility/colour has no EPUB-side
  effect to wire up.

### Verification caveat
`node node_modules/typescript/bin/tsc -b --force` clean (28.8s; direct
node invocation used this session after `npx tsc -b` repeatedly hit this
sandbox's 45s tool timeout on triggering — same compiler, just skips
npm's package-resolution overhead). Manually verify once pushed: hide the
Cover's subtitle via the on-canvas eye icon, confirm it disappears from
the live preview and the exported PDF, and that re-showing it restores
the exact original text; set a custom title colour and confirm it applies
on screen and in the PDF; reset it and confirm the automatic white-on-
photo behaviour returns; do the same blurb-hide/colour check on the Back
Cover; confirm a cover with an empty, non-hidden title exports with no
text at all (no more literal "Untitled"); open a project saved before
this phase and confirm its Cover/Back Cover render pixel-identical to
before (no `hiddenFields`/`color`/`secondaryColor` in its stored content).

## Phase 50 — Markdown import bug fix + cover font wiring (2026-07-31)

The user uploaded a real 16-chapter manuscript ("The Forest Garden") and
reported two symptoms on import: two visibly different "contents" pages,
and chapters labelled with the wrong number. Also asked for the 7 Google
Fonts families they'd downloaded (per the previous session's suggestion)
to be wired into the cover designer, and for a review of everything
shipped in Phases 45–49.

### Root cause (confirmed by reading the manuscript + the parser, then
### verified with an isolated script running the real fix against the
### real file — see Verification below)
The manuscript opens with a title-page-style `# The Forest Garden` H1 (a
book-title heading, not a real chapter) followed by a hand-typed
`## Contents` section — a heading plus a bullet list of links to each
real chapter — before the real `# Chapter One: ...` heading. Two
pre-existing, unrelated mechanisms combined badly with this common
manuscript shape:

- **`parser/markdown.ts`** splits a new chapter on every H1 with no
  concept of "front matter" — so the title H1 became a bogus first
  "chapter," and its manually-authored Contents list was imported as
  literal body content: a heading block plus a list block whose items
  were unresolved raw markdown link syntax (`plain()` strips
  bold/italic/code markers but never touches `[text](#anchor)`).
- **`renderer/paginate.ts`** already reserves page 1 for a real,
  auto-generated Table of Contents built from every chapter's title —
  correct in itself, but it now listed the bogus "The Forest Garden"
  chapter as a fake first entry, sitting a few pages before the
  manuscript's own broken, permanently-stale hand-typed list. Two
  visibly different "contents" pages, exactly as reported.
- **`renderer/chapterOpenerLabel.ts`** auto-numbers each chapter's opener
  label from its array position, not from any number embedded in its own
  title text — so the bogus leading chapter shifted every real chapter's
  auto-generated label ("Chapter One"/"1", "Chapter Two"/"2", ...) one
  higher than the number already written into that chapter's own title
  (e.g. the real "Chapter One: The Living Garden" would have rendered
  under an auto-generated "Chapter Two" label).

### Fix
- **`src/parser/markdown.ts`**: converted the token loop to index-based
  so a heading handler can peek at (and skip) the very next token.
  Any heading matching `/^(table of )?contents$/i` is now dropped along
  with the list immediately following it, rather than imported as body
  content — a manually-authored contents section is always redundant
  with, and permanently out of sync with, this app's own real
  auto-generated TOC page. After building chapters, any *leading* run of
  chapters containing only heading-type blocks (no real paragraph/list/
  table/quote content) is dropped too — the common "title-page H1 with
  no real prose before Chapter One" shape. Deliberately scoped to the
  front of the book only, not applied to every chapter, so an
  intentional, real heading-only chapter elsewhere isn't silently
  deleted.
- This is a parser-level fix, so it benefits every future Markdown
  import with this shape, not just this one manuscript.

### Cover font wiring
The user had already downloaded the 7 families suggested last session
(Anton, Bebas Neue, Oswald, Playfair Display, DM Serif Display, Abril
Fatface, Fraunces) into `public/fonts/custom/`.

- **`src/index.css`**: one `@font-face` block per real weight/style file
  actually present for each family.
- **`src/types/structuralPage.ts`**: `CoverFontChoice` extended with the
  7 new ids.
- **`src/structuralPages/coverTypography.ts`**: `CUSTOM_FAMILY_CSS` maps
  each new id to its `@font-face` CSS string.
- **`src/pdf/fonts.ts`**: refactored from two hardcoded named families
  (`interRegular`/`serifSemiBold`/etc.) to a generic `FontWeightSet` per
  family plus a `loadFamily()` helper, so adding a family is now "one
  `loadFamily()` call + one matcher regex," not touching `ThemeFontSet`'s
  shape by hand. `loadFamily` cascades missing weights to the nearest
  real one it has (bold → semiBold → medium → regular) rather than
  jumping straight to regular, and reuses an already-embedded `PDFFont`
  object for any fallback rather than re-embedding the same file bytes a
  second time (an early draft of this function did exactly that —
  caught and fixed during this session's own review, see Verification).
  Families with no real italic cut (Anton, Bebas Neue, Oswald, Abril
  Fatface) fall back to a standard-14 italic, matching the pre-existing
  Inter/Source Serif 4 precedent.
- **`src/layout/inspector/StructuralPagePanel.tsx`**: `FONT_CHOICE_OPTIONS`
  extended; the picker grid changed from 3 to 2 columns since several of
  the new labels ("Playfair Display", "DM Serif Display") are long.
- **`public/fonts/custom/README.md`**: rewritten to describe the current,
  real wiring (was previously a forward-looking plan for zero real
  families).
- Deliberately **not** added to `CustomThemeEditorDialog.tsx`'s interior
  theme font options — these are all cover-title/display faces, several
  unreadable as running body text (Anton, Bebas Neue), so offering them
  for a whole book's interior typography would be a design mistake, not
  useful choice.

### Review of Phases 45–49
Re-read the cover image/overlay/typography/visibility code end to end.
Found and fixed one cosmetic issue: `cover.tsx`'s PDF export used
`subtitleHidden`/`authorHidden` to mean "don't draw and don't reserve
space for" — which conflates an explicit hide with a field simply being
empty. Renamed to `skipSubtitle`/`skipAuthor` with a comment explaining
why the combined meaning is intentional, no behaviour change. Notes
store/panel and placeholder blocks were re-read and found correct;
`notesStore.ts`'s `getNotesForBlock`/`getNotesForStructuralPage` methods
are unused dead code (every consumer selects the raw per-project array
and filters in the render body instead, which is actually the more
correct pattern for a Zustand selector) — harmless, flagged for later
cleanup rather than fixed now since removing public store methods is a
better fit for a dedicated pass.

### Verification caveat
This sandbox's own `node_modules` has two pre-existing environment
issues unrelated to this session's changes: `npx tsc`/`vite` intermittently
exceed the tool's 45s command timeout on the very first cold run of a
session (worked around by invoking `node node_modules/typescript/bin/tsc`
directly, skipping `npx`'s package-resolution overhead — same compiler,
consistently fast once warm), and `vite`'s dev server fails to parse its
own config here, so a real running instance of the app could not be
opened in a browser this session — Chrome couldn't reach a dev server
that never started. In place of that, the actual fixed `parseMarkdown`
function was run against the real uploaded manuscript via an isolated
`tsx` script (bypassing the app's other stores/UI entirely): confirmed
16 chapters, titled exactly `Chapter One: ...` through
`Chapter Sixteen: ...`, zero bogus leading chapter, zero broken
markdown-link list content. `node node_modules/typescript/bin/tsc -b`
clean. **Please verify live once pushed**: re-import the same manuscript
and confirm the Structure tab shows exactly 16 chapters correctly
numbered, the auto-generated Contents page lists only real chapters, and
the new fonts appear and render correctly in the Cover's Font picker (on
screen and in an exported PDF) — none of this could be visually confirmed
in a live browser this session.

## Phase 51 — Placeholder upload, sidebar paragraph editing, manual page breaks, project save/load, add-chapter (2026-07-31)

Five features from one "think about it" request covering five separate
usability gaps, plus a follow-up chapter-management gap reported
immediately after. All five approved via `AskUserQuestion` before building.

### 1. Click an image placeholder to upload a real photo
`useImageUpload` (`src/hooks/useImageUpload.ts`, new) is a shared "open a
file picker, import via `assetStore.importFiles`, hand back an asset id"
hook — extracted so the Cover designer's existing upload button
(`CoverImageUploadButton`), the "+" block inserter's new "Image" option,
and the placeholder-to-photo conversion all go through one implementation
instead of three. `editorActions.replaceBlockWithHistory` (new) is the
forward-facing wrapper around `contentStore.replaceBlock` (a full,
non-merging replace already existed as `editBlock`'s own undo mechanism,
but had no history-tracked forward call site until now) — needed because
swapping a `PlaceholderBlock` for an `ImageBlock` is a type change, not a
field update. `BlockContentProps` gained `projectId`/`onReplace`, threaded
through `Page.tsx` to every block's `Render`. `placeholder.tsx` shows an
"Upload photo" button for `kind === 'image'` placeholders in editable
mode, converting to a real `ImageBlock` on pick. `InsertBlockButton.tsx`
rewritten with an "Image" option above the existing type list, opening
the same picker.

### 2. Paragraph text editor in the Inspector sidebar
`TypographyPanel.tsx`'s new `ParagraphTextEditor` renders an always-
editable contentEditable box under the Type tab when a paragraph is
selected — a second entry point alongside the existing on-canvas
double-click editing, useful when the preview is small or the exact
double-click target is fiddly to hit. Reuses the exact same
`useEditableField` (html mode) and commits through the same
`editorActions.editBlock`, so both editing surfaces go through one
sanitiser/history path, never two. Keyed by `block.id` so switching the
selected paragraph fully remounts (and re-enters edit mode); removing the
node from the DOM while focused fires a real blur first, so an in-progress
edit still commits before the remount, the same behaviour the on-canvas
editor already relies on.

### 3. Manual page-break-after toggle
`ContentBlock` gained a cross-cutting `breakAfter?: boolean` — added by
intersecting the whole 14-member discriminated union with `{ breakAfter?:
boolean }` rather than editing every interface individually (there's no
shared base interface — see `docs/MODULAR_PAGE_SYSTEM_PLAN.md`).
`paginate.ts`'s main loop calls `flush()` right after pushing a block with
`breakAfter` set — a one-line addition, safe even on a chapter's last
block since the post-loop flush-if-anything-left check then finds nothing
to do. Because PDF export consumes the exact same `LaidOutPage[]` this
produces (`exportStore.ts` imports `LaidOutPage` from `renderer/paginate`),
the fix is print-accurate for free — no separate PDF-side pagination to
touch. EPUB (reflowable, no real pagination) gets a best-effort
equivalent: `blockToXhtml.ts` appends an empty `<div class="bs-page-break">`
after a `breakAfter` block, styled with `page-break-after`/`break-after`
in `stylesheet.ts` — most e-reader apps honour it even though EPUB content
is technically reflowable. UI: a new toggle icon
(`SeparatorHorizontal`, accent-coloured when active) in `BlockToolbar.tsx`,
wired to `editBlock(..., { breakAfter: !block.breakAfter })` in `Page.tsx`.
Verified with an isolated `paginate()` call (small fixed block heights
that would normally all fit one page, one block flagged `breakAfter` —
correctly split into two pages at that exact point) rather than through
the browser, for the same sandbox reasons noted in Phase 50.

### 4. Save/load a project as a portable file
New `.bookstudio` format (a real ZIP): `manifest.json` (format version,
project name/category/settings), `manuscript.json`, `structuralPages.json`,
`notes.json`, `customTheme.json` (only if `settings.themeId` is a custom
theme — built-in presets need nothing bundled), and `assets/` (each image's
actual bytes, plus `assets/manifest.json` for their metadata) — deliberately
a superset of `snapshotDb.ts`'s existing autosave snapshots, which never
bundle asset blobs since they assume the same browser's IndexedDB is still
around; this format is the one meant to actually travel.

Wrote `src/epub/zipReader.ts` as the read-side counterpart to the existing
`zipWriter.ts` (End-Of-Central-Directory + Central Directory parsing,
`DecompressionStream('deflate-raw')`, CRC-32 verified on read) — both files
are generic ZIP primitives despite living under `epub/`, reused as-is by
`src/projectFile/{export,import}ProjectFile.ts` rather than a second
archive implementation. Also deduplicated a pre-existing `saveBlob`
helper that `useExportPdf`/`useExportEpub`/`useExportHtmlBook` each kept
their own near-identical copy of (one had already been generalised to take
description/mimeType/extension params, the other two hardcoded a single
format) — now one `src/utils/saveBlob.ts`, all four export paths import it.

Store changes: `structuralPageStore.replaceAllPages`, `notesStore.
replaceAllNotes` (bulk-set primitives, mirroring `contentStore.
setManuscript`'s existing "bulk import, not a tracked edit" shape — none of
the three are wrapped in undo/redo history) and `customThemeStore.
importCustomTheme` (upserts under the theme's own exact id, unlike
`addCustomTheme` which always mints a fresh one — needed because a
project's `settings.themeId` only keeps resolving if the theme comes back
under the same id it was exported with).

Import always creates a **new** project (`projectStore.createProject`)
rather than overwriting anything already in the library, even if the file
was exported from what is now an existing project id — five separate
stores are keyed by project id here, and reusing the original id risked
silently clobbering unrelated data in any one of them if the id happened
to collide. The one deliberate exception: `assetStore.restoreAsset` keeps
each image's own original id (only `projectId` is repointed), because
`ImageBlock.assetId` references inside the imported manuscript/structural
pages were captured at export time and only resolve if the asset comes
back under that same id.

UI: "Save"/"Load" buttons in the top `Toolbar.tsx` (the "more obvious save
button" the user asked for), plus a "Load Project" button on
`ProjectsPage.tsx` for starting from a file before any project is open.
Verified with an isolated round-trip script (`buildProjectFile` →
`parseProjectFile`, a manuscript with a heading/paragraph/image block plus
one fake image asset) — chapters, block types, and asset bytes all came
back byte-identical; `tsc -b`/`oxlint` both clean throughout.

### 5. Add a new chapter (follow-up report: "there should be a way to add/remove new chapters")
Delete already existed (Phase 34); add didn't. `contentStore.insertChapter`
(new) mirrors `insertBlock`'s exact "insert this exact object after this
id, not-found falls back to the start" contract, with one addition: if no
manuscript exists yet for the project, it starts a brand-new one — so "Add
chapter" also works as a from-scratch starting point, not just something
available after an import. `editorActions.addChapterWithHistory` wraps it
with undo/redo. `Sidebar.tsx`'s Chapters tab gained a header row with a
"+" button (mirroring the Structure tab's existing per-section "+"
pattern) that always appends after the current last chapter and
immediately enters rename mode — plus an "Add Chapter" action on the
empty state, since "no chapters yet" previously only offered "import a
manuscript" with no from-scratch path.

### Verification
`node node_modules/typescript/bin/tsc -b` and `node_modules/.bin/oxlint`
both clean after every feature and again at the end of the batch. Live
browser verification remains unavailable in this sandbox (`vite`'s dev
server fails to parse its own config here — see Phase 50's note); every
piece of genuinely new logic (pagination's `breakAfter` split, the ZIP
round-trip) was instead verified with isolated `tsx` scripts that exercise
the real functions directly. **Please verify live once pushed**: uploading
a photo onto an image placeholder, editing a paragraph from the sidebar
box, toggling a page break and confirming both the screen preview and an
exported PDF split there, saving a project then loading it back (ideally
in a different browser/profile to confirm it's genuinely self-contained),
and adding a chapter from an empty project.

## Phase 52 — Chapter reordering (2026-07-31)

Immediate follow-up: chapter add/delete/rename existed, reordering didn't.
`contentStore.moveChapter(projectId, chapterId, direction)` is a simple
adjacent-swap within `manuscript.chapters` — the chapter-level counterpart
to `moveBlock` (swaps within a chapter's own blocks) and
`structuralPageStore.movePage` (swaps within a category); no-ops at the
start/end of the book, same convention as both. `editorActions.
moveChapterWithHistory` wraps it for undo/redo, identical shape to
`moveBlockWithHistory`/`movePageWithHistory`. `Sidebar.tsx`'s chapter rows
gained up/down chevron buttons (disabled + dimmed at the first/last
chapter, matching `BlockToolbar.tsx`'s existing disabled-button treatment
rather than `StructuralPageRow`'s always-enabled-no-op style, since a
264px-wide sidebar row already carries four action icons and a visibly
disabled boundary reads clearer than a silent no-op there).

`tsc -b`/`oxlint` clean.

## Phase 53 — Live-audit fixes (2026-07-31)

A live, end-to-end Chrome audit of the deployed app (real 16-chapter
manuscript, every workspace exercised as a real author would) surfaced five
issues, written up in `UX_Audit_2026-07-31.md` at the project root. Three
were real, fixable bugs; one was a genuine UX gap around a pre-existing,
known perf issue; one turned out not to be a bug at all. Fixed/resolved:

- **Chapters sidebar icon crowding.** `Sidebar.tsx`'s chapter rows used
  `gap-2.5` between the title button and its four action icons
  (up/down/rename/delete) — the same row `StructuralPageRow` uses `gap-1`
  for. Fine with the two icons this row had before Phase 52 added
  reordering; with four, the wider gap left too little room for real
  chapter titles, which truncated on hover. Changed to `gap-1` to match, and
  added a native `title` attribute to the truncated `<span>` so the full
  title is always reachable via hover tooltip regardless of available width.
- **Inspector's dead "Theme" tab.** Permanently showed a stale "Theme
  editing arrives in Phase 4" placeholder, even though a full Theme Gallery
  has existed in Project Settings since Phase 43 — misleading, since a user
  on this tab had no way to know theme switching was possible anywhere.
  `ProjectSettingsDialog`'s open state was `Toolbar`-local, so it couldn't
  be reached from `Inspector`; lifted to `uiStore.projectSettingsOpen` (a
  new field, deliberately excluded from persistence via `partialize` — a
  dialog shouldn't reopen itself after a reload). The Theme tab now shows
  the resolved current theme's real name (`resolveTheme(settings.themeId).name`,
  not the previous raw `themeId.replace('-', ' ')`) plus a "Change theme…"
  button that opens the real gallery.
- **Inspector's 5-tab row overflow.** At the panel's fixed 300px width, the
  shared `Tabs`/`TabsTrigger` component's default `px-3`/`text-sm`/`gap-1`
  genuinely overflowed with 5 tabs (Page/Type/Image/Notes/Theme) — labels
  truncated on both edges depending on scroll position, confirmed live.
  Didn't touch the shared component (Sidebar's own 3-tab row fits fine at
  the defaults); overrode just this instance's `TabsList`/`TabsTrigger`
  classNames to `gap-0.5`/`px-1.5`/`text-xs`, which fits comfortably.
- **Virtual Editor's "Review Entire Book" gives zero feedback while it
  runs.** `runPipeline` (`virtualEditor/pipeline.ts`) is genuinely
  synchronous and blocks the main thread for real seconds on a large
  manuscript — confirmed live, repeatedly, CDP screenshot timeouts and all,
  and consistent with the freeze `docs/ROADMAP.md` Phase J already flags
  ("Profile and fix the structural-page mutation freeze"). The click
  handler called `runPipeline` with no state change beforehand, so nothing
  ever told the user a review was in progress — the app just looked hung.
  Didn't attempt the deep fix (moving the pipeline to a Web Worker would
  need `Finding.suggestedFix.apply` — a function value — and other
  non-serialisable context to cross a `postMessage` boundary, a materially
  bigger and riskier change than could be verified live in this session).
  Instead added `virtualEditorStore.reviewingByProject` + `isReviewing`:
  `runReview` now sets the flag, defers the actual `runPipeline` call one
  tick via `setTimeout`, and the button shows the same `Loader2`
  spin+"Reviewing…" pattern `Toolbar.tsx`'s Export/Save/Load buttons already
  use. Doesn't shorten the freeze — turns "looks broken" into "visibly
  working," which is what the live audit actually flagged. The real fix
  stays exactly where `docs/ROADMAP.md` Phase J already has it.
- **Version History showing zero autosaved versions — investigated, not a
  bug.** `useAutosaveSnapshots.ts` already runs a real 5-minute
  `setInterval`, correctly gated on `contentStore`'s revision counter so it
  skips a tick if nothing changed. The audit session repeatedly recreated
  Chrome tabs (working around unrelated CDP screenshot timeouts on the
  large manuscript), which reloads the SPA and restarts that interval from
  zero each time — no single tab session ran uninterrupted for a full 5
  minutes, so no autosave tick ever had the chance to fire. `UX_Audit_2026-
  07-31.md`'s claim on this point was wrong and should be read as
  superseded by this entry.

### Verification caveat
`tsc -b` is clean (typechecks the whole project, these five files
included). `npm run build`'s bundling stage and `npx oxlint` could not be
run to completion in this sandbox: `vite build` fails loading
`vite.config.ts` because `node_modules/@tailwindcss/node/dist/index.mjs` is
truncated mid-file (confirmed by inspecting the file directly — it ends
mid-string-literal), and `oxlint`'s native binding crashes with a bus
error. Both reproduce identically against an untouched copy of the repo in
a scratch directory with none of this phase's changes present, so they're
pre-existing sandbox/`node_modules` corruption — likely the same thing
`docs/ROADMAP.md` Phase J's "stray partially-installed `node_modules`
artifact" item already flags — not a regression from this phase. No
network access to `npm install` a repair in this sandbox (registry request
returned 403). Recommend re-running `npm run build`/`npm run lint` in a
normal (non-sandboxed) dev environment before the next deploy to get a real
green signal on this phase's changes.

## Phase 54 — Cover Canvas Milestone 1: free-form drag-and-drop elements (2026-08-01)

Requested directly: "the front and back cover should have truly drag and drop elements
like canva, such as rectangles." Full design in `docs/COVER_CANVAS_PLAN.md` — short
version below. Purely additive alongside every existing Cover/Back Cover field (Phases
45–50); an existing project's cover renders identically until a user actually adds an
element.

- **Data model** (`types/structuralPage.ts`): a new `CoverElement` discriminated union
  (`CoverShapeElement` for `'rect' | 'ellipse' | 'line'`, `CoverTextElement` for `'text'`),
  each with normalised 0..1 `x`/`y`/`width`/`height` (same portable-across-trim-sizes
  convention as the existing `verticalNudge`) plus a `zIndex`. `CoverPage.content` and
  `BackCoverPage.content` each gained an optional `elements?: CoverElement[]`. No
  `rotation` field yet — deliberately: Milestone 1 ships no rotate handle, and a property
  only some renderers honoured would be exactly the WYSIWYG-drift risk
  `structuralPages/registry.ts`'s `StructuralPageTypeDefinition` doc comment warns against.
- **A real TypeScript narrowing gotcha, confirmed and worked around.** The installed `tsc`
  (6.0.3) doesn't reliably narrow a discriminated union to its final member via a bare
  trailing `else` when that union has a member whose own discriminant is itself a
  multi-value literal type (`CoverShapeElement.kind: 'rect' | 'ellipse' | 'line'`) — an
  `if (el.kind === 'rect') ... else if (... === 'ellipse') ... else if (... === 'line')
  ... else { /* should be CoverTextElement here */ }` chain left `el` as the full,
  unnarrowed union inside that final `else`, breaking on every `CoverTextElement`-only
  field access. Confirmed with a minimal standalone repro against this exact `tsc` binary
  before concluding it wasn't a mistake in the type definitions themselves. Fixed by giving
  every branch an explicit positive `el.kind === 'text'` check instead of relying on the
  trailing `else` — see the comment in `structuralPages/coverElements.ts`'s
  `drawCoverElementsPdf`.
- **Pure data helpers + PDF drawing** (`structuralPages/coverElements.ts`):
  `createCoverElement`/`addElement`/`updateElement`/`removeElement`/`bringToFront`/
  `sendToBack`, all pure functions over the array, plus `drawCoverElementsPdf` (draws
  rect/ellipse/line/text into the PDF at the same normalised-fraction → point conversion
  every other cover measurement already uses, offset by `bleedPt` since the media box
  extends past the trim edge). No new history-store wiring needed anywhere: every mutation
  is a full `elements` array replacement handed to the existing `onCommit({ elements })` →
  `updatePageContentWithHistory`, which already snapshots/restores whole `content` objects
  generically.
- **Interactive on-screen layer** (`structuralPages/coverElementLayer.tsx`): drag-to-move
  and 4-corner drag-to-resize, computed entirely in container-relative fractions via
  `getBoundingClientRect()` at gesture start (zoom-agnostic — the same approach
  `CoverFocalPointPicker` already uses, not `pageBox.widthPx` pixel math), live-previewing
  locally and committing exactly once on pointer-up (one undo step per gesture, matching
  `CoverNudgeHandle`'s existing convention). A small floating toolbar (send back/bring
  forward/delete) appears above the selected element. Used identically by `cover.tsx` and
  `backCover.tsx`, sandwiched between the background image/overlay and the title/
  subtitle/author text block in the DOM, same stacking order in both.
- **Add-element menu** (`structuralPages/coverElementToolbar.tsx`): a small dropdown
  (Rectangle/Ellipse/Line/Text box), shown top-right whenever the page is selected —
  adding an element also selects it immediately so a user can start styling/dragging it
  without a second click.
- **Inspector property panel** (`layout/inspector/CoverElementPanel.tsx`): shown above the
  rest of the Cover/Back Cover fields whenever `selectionStore.selectedCoverElementId` is
  set. Text elements get content/font/align/italic/size/colour; shapes get fill/fill
  opacity/stroke/stroke width, plus corner radius for rectangles. Position/size are
  deliberately not editable here — dragging on canvas is the intended gesture, matching
  `docs/COVER_CANVAS_PLAN.md`'s interaction design.
- **Selection state** (`store/selectionStore.ts`): new `selectedCoverElementId` +
  `selectCoverElement`, cleared by every existing selection action
  (`select`/`selectForEdit`/`selectStructuralPage`/`clear`) so switching away from a cover
  can never leave a stale element "selected" against the wrong page.
- **Deliberately deferred past Milestone 1** (now tracked in `docs/ROADMAP.md` Phase E):
  rotation, icons/badges (the pre-existing "cover accessories" item — closing this is
  Milestone 2, now that the underlying element/layer system exists), secondary images,
  smart alignment/snap guides, grouping, on-canvas double-click text editing (the whole
  element box already doubles as this layer's drag target, so click-to-select-and-drag and
  double-click-to-edit-text would fight each other on the same surface — text is edited via
  the Inspector panel instead), and the wrap-aware front+spine+back view.

`tsc -b` clean (see the narrowing-gotcha note above for the one real issue hit and fixed
along the way). `npm run build`'s bundling stage and `npx oxlint` remain blocked by the
same pre-existing sandbox `node_modules` corruption documented in Phase 53's verification
caveat — not re-litigated here, still unresolved, still needs a real environment to get a
green build/lint signal before the next deploy.

## Phase 55 — Cover Canvas Milestone 2: icons + badges (2026-08-01)

Closes the long-deferred "cover accessories" item (Phase E) now that Milestone 1's
element/layer system exists. Two new `CoverElement` kinds — decorative line-icons
(seals/marks) and text badges (circular seal or ribbon with centred text, e.g.
"Bestseller"/"2nd Edition") — following the exact same additive pattern as Milestone 1
(purely optional entries in the same `elements` array; an existing project renders
identically until a user adds one).

- **Data model** (`types/structuralPage.ts`): `CoverElementKind` gained `'icon' | 'badge'`.
  `CoverIconElement` (`iconId`, `color`, `strokeWidth`) and `CoverBadgeElement` (`shape:
  'circle' | 'rect'`, `text`, `backgroundColor`, `textColor`, `borderColor`/`borderWidth`,
  `fontSize`, `fontChoice`) both extend the same `BaseCoverElement`, `kind` still declared
  independently on each leaf type per Milestone 1's narrowing note. `CoverIconId` is a
  curated 14-icon union (star/award/crown/leaf/feather/book-open/shield/sparkles/quote/
  heart/medal/trophy/badge-check/gem) — deliberately not "any lucide icon"; every id has
  matching PDF geometry (below), so adding an id without also registering its geometry is a
  compile error at the draw call site, not a silently blank icon.
- **Icon registry** (`structuralPages/coverIcons.ts`, new): `COVER_ICON_COMPONENTS` (the
  real `lucide-react` components, for on-screen rendering) and `COVER_ICON_PDF_NODES` (raw
  path/circle geometry for the PDF renderer). The PDF geometry is hand-transcribed verbatim
  from this project's installed `lucide-react` v1.27.0 source
  (`node_modules/lucide-react/dist/esm/icons/*.mjs`'s exact `__iconNode` arrays), not
  reconstructed from memory — guarantees the printed icon is the same geometry as the
  on-screen one, not an approximation. Flagged in that file's doc comment: if
  `lucide-react` is ever upgraded and an icon's path data changes upstream, this registry
  will silently drift — there's no automated check tying the two together today.
- **A real bug caught by rendering and visually inspecting a test PDF, not just `tsc`.**
  `drawCoverElementsPdf`'s icon branch initially pre-multiplied the SVG stroke width by
  the icon's own render scale before passing it to `drawSvgPath`. But `drawSvgPath`
  applies its own `scale()` to the current transform matrix before stroking, and per the
  PDF spec a stroke's line width is *itself* subject to the CTM in effect at stroke time —
  so the pre-scaled width got scaled a second time, rendering every icon as a solid
  overstroked blob instead of a thin outline (confirmed by rendering a standalone
  reproduction with `pdf-lib` + rasterising it with `pdftoppm`/Ghostscript, both available
  in this sandbox, and looking at the actual pixels). Fixed by passing the *raw*,
  un-scaled stroke width to `drawSvgPath` (matching how `lucide-react`'s own SVG source
  specifies `stroke-width="2"` directly in the un-scaled 24-unit viewBox and lets the
  viewport's own scale do the rest) — re-rendered and visually confirmed clean outlines
  before considering this shipped. `drawEllipse` calls (for icons like `award`/`sparkles`
  that include a circle sub-node) have no equivalent transform and keep the pre-multiplied
  width, which was already correct.
- **PDF drawing** (`structuralPages/coverElements.ts`): icon — a square icon
  (`Math.min(wPt, hPt)`) centred within the element's own possibly-non-square box, every
  sub-path/circle drawn in `zIndex` order with `LineCapStyle.Round` to match `lucide`'s
  default cap style; badge — background shape (`drawEllipse` for `'circle'`,
  `drawRectangle` for `'rect'`) then centred text on top, sharing the same
  `resolveCoverFontFamily`/`pickFont` path the free-text element already uses.
- **On-screen rendering** (`structuralPages/coverElementLayer.tsx`'s `ElementBody`): icon
  renders the actual `lucide-react` component at `size-full`, relying on SVG's default
  `preserveAspectRatio="xMidYMid meet"` to stay square and centred inside a non-square box
  — deliberately the same "square icon inside a possibly non-square box" behaviour as the
  PDF path, verified by inspection rather than assumed to match. Badge renders a
  background `div` (rounded-full for `'circle'`) with a centred `span`.
  
- **Add-element menu + Inspector panel**: `coverElementToolbar.tsx` gained Icon/Badge
  entries (default star icon / default red "NEW" circle badge, immediately selected and
  restyleable, same convention as every other element kind). `CoverElementPanel.tsx`
  gained a 5-per-row icon picker + colour + stroke-width slider for icons, and
  text/shape/background/text-colour/size/border fields for badges — following the
  existing `element.kind === X` branch pattern (extended from the old `!== 'text'`
  catch-all, which would otherwise have wrongly tried to render fill/stroke controls for
  the two new non-shape kinds).

`tsc -b` clean. The icon stroke-width bug above was caught and fixed via a real rendered
PDF, not just typechecking or code review — see the smoke-test methodology note. Live
interactive verification in the running app (drag/resize/style an icon or badge on an
actual Cover page in Chrome) was **not possible in this sandbox**: `npm run dev` fails to
even start, for the same pre-existing reason `npm run build` fails (Phase 53's
verification caveat — `node_modules/@tailwindcss/node/dist/index.mjs` is truncated,
breaking Vite's config load). Recommend a quick manual check in a normal dev environment
before the next deploy: add one of each new kind to a Cover, drag/resize it, change its
icon/colour/badge text, and export a PDF to confirm the on-screen and printed results
still match.

## Phase 56 — Two small UX fixes from user report (2026-08-01)

User reported three issues while using the app; investigated all three before touching
anything.

- **"Clicking a page like the cover should take you to its editor" — investigated, not a
  bug.** `Page.tsx`'s structural-page render already wires `onSelect` to
  `selectStructuralPage` + `setInspectorTab('page')` on the page's own root `onClick`
  (`structuralPages/types/cover.tsx`/`backCover.tsx`), the exact same action the
  Sidebar's Front Matter rows use — confirmed by reading `selectionStore.ts`'s own doc
  comment, which already documents this as intentional. Clicking a page in the live
  preview already opens its Inspector panel; no fix needed here.
- **Long chapter titles unreadable in the Sidebar — fixed.** The title span used
  `truncate` (single line + ellipsis), with only a hover-only native `title` tooltip as
  a fallback (added in Phase 53). Changed to `line-clamp-2` so a long title wraps and
  stays fully readable in the row itself; the row's icon-button (up/down/rename/delete)
  switched from `items-center` to `items-start` alignment so those icons sit at the top
  of a now-possibly-taller row instead of awkwardly centred against two lines of text.
  `title={chapter.title}` kept as a fallback for the rare title that still overflows two
  lines. `src/layout/Sidebar.tsx`.
- **Cover preview disappears when scrolling the Inspector — fixed, confirmed real.** The
  Inspector's `<aside>` had no internal scroll container, so a long panel (Cover with
  several stacked element property panels, easy to hit now that Milestone 2 added
  icons/badges) simply overflowed and the *whole app shell* became the scroll container
  — scrolling the Inspector scrolled the Sidebar and canvas (including the Cover preview
  itself) along with it, unlike the canvas's own already-correct independent
  `overflow-auto`. Fixed by splitting the Inspector into a `shrink-0` tab-bar region and
  a `min-h-0 flex-1 overflow-y-auto` content region — `min-h-0` is load-bearing here (a
  flex child won't shrink to allow its own scrollbar without it). `src/layout/
  Inspector.tsx`.

`tsc -b` clean. Not independently verified live in Chrome — same sandbox `npm run dev`
blocker as Phase 55 (Phase 53's verification caveat). Worth a 30-second manual check
(long chapter title in Sidebar, add several cover elements and scroll the Inspector)
before the next deploy.

## Phase 57 — Cover canvas: fix element-drag/focal-point conflict + snap-to-centre (2026-08-01)

User report: "you can't move an element if an image is added as it just wants to change
the focal point." Root-caused before fixing (not guessed at).

- **Root cause.** `CoverFocalPointPicker` (`structuralPages/shared.tsx`) renders a
  full-page `absolute inset-0 z-[5]` click-catcher for setting the background image's
  focal point, with no pointer-events exclusion of its own. `CoverElementLayer`'s
  container had no `z-index` at all (`z-index: auto`) — per CSS stacking rules, an
  explicit positive z-index always paints above an unset one regardless of DOM order, so
  the picker intercepted every click across the *entire* cover, including directly on top
  of an element, once an image existed (the picker only renders when `selected &&
  imageUrl`, matching exactly when the bug appeared).
- **Fix** (`structuralPages/coverElementLayer.tsx`): the container is now
  `pointer-events-none` (click-through by default, inherited by children) with `z-10`
  (above the picker's `z-5`), and each individual element's own div opts back in with
  `pointer-events-auto` — the same "click-through overlay, clickable hotspots" pattern
  `CoverElementToolbar`'s button already used elsewhere in this file. Empty cover area
  still reaches the focal-point picker underneath; clicking an actual element now reaches
  that element first. Shared by both `cover.tsx` and `backCover.tsx` (one component, no
  duplicate fix needed).
- **Snap-to-centre** (same file): a move-drag now snaps an element's centre exactly onto
  the page's horizontal/vertical centre line, independently per axis, once it comes
  within ~1.2% of the trim box of that line — plus a thin accent-coloured guide line while
  snapped, matching Figma/Canva's alignment-guide convention. Closes part of
  `docs/ROADMAP.md` Phase E's long-deferred "smart alignment/snap guides" item (snapping
  to *other elements'* edges, not just page centre, remains open).
- **Deliberately not done in this phase** (discussed with the user, not built pending
  their direction): converting the background image and/or the title/subtitle/author
  text block into full `CoverElement`s so they're draggable/resizable the same way
  shapes are. Real trade-off, not just extra work — existing projects store
  image/focalPoint/title/subtitle/author as dedicated typed `CoverPage.content` fields,
  not `CoverElement`s, plus real feature-specific behaviour on top of them (focal-point
  crop, text-visibility toggles + colour overrides from Phase 49, the layout-preset
  system) that a generic element wouldn't automatically carry over. A full conversion
  needs a real migration path to avoid the exact "never modify existing projects" risk
  `CLAUDE.md`'s non-negotiables warn about, not just new UI.

`tsc -b` clean. Not independently verified live in Chrome — same sandbox `npm run dev`
blocker as Phases 55–56.

## Phase 58 — Cover canvas: 2D text-block drag, duplicate, arrow-nudge, align buttons (2026-08-01)

Direct follow-up to Phase 57's discussion — the user asked for the lighter-weight
middle-ground option (2D drag instead of full `CoverElement` conversion) plus three more
small, low-risk canvas conveniences, all agreed rather than independently decided.

- **2D drag for the Cover's title/subtitle/author block.** New `CoverPage.content.
  horizontalNudge` (Front Cover only — Back Cover's blurb is a full-width flowing block
  with no "centred column" to offset, so `BackCoverPage.content` has no matching field).
  `CoverNudgeHandle` (`structuralPages/shared.tsx`) gained an optional `horizontal` prop
  that, when passed, drags both axes in one gesture instead of vertical-only — omitted
  entirely at Back Cover's call site, so its existing behaviour is untouched.
  `computeCoverLayoutScreenStyle` (`coverLayout.ts`) gained a 4th optional parameter
  (backward-compatible; existing 3-arg callers unaffected) returning a `translateXPx`
  alongside the existing `translateYPx`. `drawCoverPdf`'s `centerX` gets the matching
  `horizontalNudge * COVER_NUDGE_RANGE_PX * PX_TO_PT` offset, same conversion pattern
  `computeCoverLayoutCursorY` already uses for the vertical axis — screen/PDF parity.
- **Duplicate element** (`structuralPages/coverElements.ts`'s new `duplicateElement`):
  clones with a fresh id, nudged down-right like a freshly-added element, brought to
  front. Wired into both the on-canvas floating toolbar (new Copy icon next to
  bring-forward/send-back/delete) and the Inspector panel — both immediately select the
  new copy.
- **Arrow-key nudge** (`coverElementLayer.tsx`): plain arrow moves the selected element a
  small fixed fraction, Shift+arrow a bigger one, one undo entry per keypress (discrete
  by design, not batched like a drag gesture). Ignores arrow keys while focus is in an
  input/textarea/contenteditable, so it doesn't hijack typing elsewhere (an Inspector
  text field, a title input). The listener is a `useEffect` declared *before* the
  component's existing `!elements` early return — hooks must run unconditionally on
  every render, so a hook can't go after an early return no matter how natural that
  placement would otherwise read.
- **Align-to-page buttons** (`layout/inspector/CoverElementPanel.tsx`): one row, 6
  buttons (left/centre/right, top/middle/bottom), rendered once above every kind-specific
  field block since alignment is position-only and applies identically to every element
  kind. Precision complement to Phase 57's drag-based snap-to-centre — a click lands
  exactly on flush-left/right/top/bottom the way a drag can't as reliably.

`tsc -b` clean. Not independently verified live in Chrome — same sandbox `npm run dev`
blocker as Phases 55–57.

## Phase 59 — Free-positioned title/subtitle/author, pointer-conflict fixes, secondary image elements (2026-08-01)

Direct response to the user's five-part request: two bug reports, one explicit reversal
of Phase 57's "not taken" decision, one new element kind, and a request to think through
what's still missing.

- **"Drop a cover image here" / drag-to-reposition not working — root cause.** The
  title/subtitle/author wrapper `div` (Cover) and the blurb/author-bio wrapper `div`s
  (Back Cover) are `absolute inset-0` with no `pointer-events` restriction. A plain div's
  hit-test area is its *whole box*, not just the pixels its text actually occupies — so
  once that div existed (i.e. basically always), it silently caught every click/drag
  across almost the entire page, leaving `StructuralImageDropZone` and `CoverNudgeHandle`
  underneath unreachable except on the exact pixels covered by rendered text glyphs.
  Fixed the same way Phase 57 fixed the element-layer/focal-point-picker conflict:
  `pointer-events-none` on the wrapper, `pointer-events-auto` opted back in on each real
  interactive child (the nudge handle, the visibility toggles). Same fix applied to both
  `cover.tsx` and `backCover.tsx`.
- **"Add cover image" / "Add element" buttons unclickable once an element sits on top" —
  root cause.** Both buttons and `CoverElementLayer`'s container were `z-10`; at equal
  z-index, later DOM order wins the paint (and hit-test) order, and `CoverElementLayer`
  renders after the buttons. Bumped both buttons to `z-20` in both `cover.tsx` and
  `backCover.tsx`.
- **Independent free-positioning for title/subtitle/author — the Phase 57 decision
  reversed, on explicit request.** New `CoverFieldPosition` (`{ x, y }`, trim-box
  fractions) and three optional fields on `CoverPage.content`
  (`titlePosition`/`subtitlePosition`/`authorPosition`), each unset until the user first
  drags that specific field. New `DraggableCoverField` (`structuralPages/shared.tsx`):
  wraps one field, measures its own origin via `getBoundingClientRect()` on first
  pointer-down, live-previews via local state, commits once on release
  (`onCommit`/`updatePageContentWithHistory`, one undo entry per drag) — and
  distinguishes an ordinary click (select the page, double-click to edit, tap the
  visibility toggle) from an actual drag via a 3px movement threshold, so a plain click
  doesn't spuriously "detach" a field with zero real movement. A small
  `ResetFieldPositionButton` (only shown once a field has a position override) clears it
  back to the automatic layout-preset position. Wired into both screen rendering (each
  field's wrapper switches from the shared centred-column layout to an absolute,
  anchor-centred `transform: translate(-50%,-50%)` once positioned) and PDF export (new
  `fieldPdfXY` helper in `cover.tsx`, same trim-box-fraction-to-points conversion every
  other cover measurement already uses). Deliberately Front-Cover-only, matching Phase
  58's horizontalNudge scope decision — Back Cover's blurb/author-bio stay as flowing
  blocks, not freely repositioned.
- **Secondary image elements — new `'image'` `CoverElementKind`.** Distinct from the
  page's one background cover image: a freely positioned/resized/duplicated photo layered
  on top, for things like an author headshot or a publisher/series logo. Reuses
  `coverImageFit.ts`'s existing `computeCoverImagePdfPlacement` scoped to the element's
  own box instead of the full media box (confirmed generic before use, no new crop math
  needed) — always centred cover-fit for now, no focal-point/zoom controls on secondary
  images yet. `drawCoverElementsPdf` (`coverElements.ts`) is now `async` (both call sites
  in `cover.tsx`/`backCover.tsx` updated to `await` it) so it can `getAssetBlob` →
  `blobToPng` → `ctx.page.doc.embedPng` per element. Because a cover-fit-scaled secondary
  image routinely overflows its own (usually smaller-than-page) box — unlike the
  full-bleed background image, which never overflows the page — the PDF draw wraps the
  `drawImage` call in a real pdf-lib clip (`pushGraphicsState()` → `rectangle(...)` →
  `clip()` → `endPath()` → draw → `popGraphicsState()`), verified with a standalone
  rasterized test PDF (not just code review): an oversized image placed inside a small
  clipped box painted only inside that box, and a shape drawn after `popGraphicsState()`
  confirmed the clip doesn't leak into later drawing. On screen, `ElementBody` renders the
  asset via `useAssetStore`'s `getObjectUrl` with `object-fit: cover`, or an empty-state
  placeholder ("Select, then choose an image in the panel") when no asset is set yet —
  matching `StructuralImageDropZone`'s "empty state prompts for content" pattern. Content
  edits (choosing/replacing the image) go through the Inspector panel
  (`CoverElementPanel`, via the shared `useImageUpload` hook), not on-canvas, consistent
  with this canvas's existing convention that position/size are dragged on-canvas while
  content is set in the Inspector.

`tsc -b --force` clean. `oxlint` crashes with a sandbox-level bus error on this machine
(pre-existing, unrelated to these changes) so it could not be run this phase — flagging
so a future session with a working `oxlint` re-checks these files. Not independently
verified live in Chrome — same sandbox `npm run dev` blocker as Phases 55–58.

### Brainstorm: what else the cover/back-cover editor needs before calling it "finished"
Asked for directly by the user. Grouped roughly by effort — see `docs/ROADMAP.md` Phase E
for the items already tracked there (rotation, snap-to-other-elements, on-canvas
double-click text editing, wrap-aware spine view — all still open).

Small, low-risk follow-ups:
- **Delete/Backspace keyboard shortcut** for the selected element — duplicate and nudge
  already have keyboard affordances; delete currently only has the toolbar trash icon.
- **A "remove image" action** on image elements (revert to the empty placeholder), not
  just "replace" — currently the only way back to empty is deleting the whole element.
- **Opacity control** on icon/badge/image elements — rect/ellipse already have
  `fillOpacity`; the newer kinds don't.
- **Focal point + zoom on secondary images** — shipped centred-only this phase; a
  headshot or logo that isn't naturally centred in its source photo has no way to
  recrop, unlike the page's main background image.

Bigger, real design decisions:
- **A layers list/panel.** With several elements able to fully overlap (badges over
  images, icons over shapes), clicking through a stack to select the one underneath is
  already awkward and will get worse as covers get more complex — a Figma/Canva-style
  layer list solves this properly; incremental z-order nudges (forward/back one step, not
  just all-the-way front/back) are a smaller partial fix.
  Multi-select and grouping are the same underlying gap.
- **Per-element accessibility/contrast checking.** The app's existing Accessibility
  checker looks at manuscript content; it doesn't yet know free-form cover text elements
  exist, so a white title over a light patch of a background photo currently ships
  unflagged.
- **Back Cover parity decision.** Blurb/author-bio deliberately stayed flowing blocks
  this phase (matching Phase 58's scope cut) — worth a deliberate yes/no on whether Back
  Cover ever gets the same free-positioning Front Cover just did, rather than leaving it
  an unstated asymmetry.

## Phase 60 — Cover elements: delete shortcut, remove-image, opacity, secondary-image focal point/zoom (2026-08-01)

The user picked the "quick-win bundle" from Phase 59's brainstorm — all four small,
low-risk items shipped together.

- **Delete/Backspace keyboard shortcut.** Extended the same `useEffect`/`handleKeyDown`
  in `coverElementLayer.tsx` that already handles arrow-key nudge, rather than adding a
  second listener — one `keydown` handler, one `isNudgeKey`/`isDeleteKey` branch each.
  Same input/textarea/contenteditable guard as nudge (matters even more here, since
  Delete/Backspace are the keys actually used to edit text elsewhere). Deselects before
  removing, one undo entry per keypress, matching the discrete-not-batched convention
  duplicate/nudge already established.
- **"Remove image" action.** A small `X` button next to "Replace image" in
  `CoverElementPanel.tsx`'s image block, shown only once `imageAssetId` is set — clears
  `imageAssetId`/`imageFocalPoint`/`imageZoom` together, reverting to the empty
  placeholder without deleting the whole element.
- **Opacity control.** New `opacity?: number` on `BaseCoverElement` (not per-kind), so
  every element kind gets it uniformly — one slider in `CoverElementPanel.tsx`, rendered
  once alongside "Align to page" rather than duplicated per kind-specific block. On
  screen, `coverElementLayer.tsx`'s `ElementBody` now wraps its kind-specific content
  (renamed to `ElementBodyContent`) in a single outer div carrying this opacity, so it
  composes correctly with `rect`/`ellipse`'s existing `fillOpacity` (nested CSS opacity
  multiplies) without touching their pre-existing behaviour. In the PDF, every
  `drawCoverElementsPdf` branch now passes an `elementOpacity` computed once per element
  to its draw call(s) — verified opacity actually blends correctly in the exported PDF
  with a standalone rasterized test (a 40%-opacity red square over white rendered as the
  correct blended pink, not full-strength red).
- **Focal point + zoom for secondary images.** `CoverImageElement` gained
  `imageFocalPoint?: CoverImageFocalPoint` and `imageZoom?: number` — the exact same
  shape the main background image already uses, so `coverImageFit.ts`'s placement math
  needed no changes at all, just real values instead of the `undefined`/`undefined`
  Phase 59 passed. Deliberately **not** an on-canvas click-to-set picker like the
  background image's `CoverFocalPointPicker`: a secondary image element's whole box is
  already the drag-to-move/resize target, so a click-anywhere-to-set-focal-point gesture
  on the same area would recreate the exact pointer-conflict bug Phase 57/59 just fixed.
  Used two X/Y sliders plus the same zoom slider pattern the main image's Inspector
  control already uses instead — consistent with this canvas's established convention
  that content/style edits go through the Inspector while position/size are dragged on
  canvas.

`tsc -b --force` clean. `oxlint` still crashes with the same sandbox-level bus error
noted in Phase 59 — unrelated to these changes, flagging again for a future session with
a working `oxlint`. Not independently verified live in Chrome — same sandbox `npm run
dev` blocker as every phase since 55.

## Phase 61 — Cover elements: layers panel + incremental z-order (2026-08-01)

Build order for the next stretch of work settled with the user 2026-08-01: Phase E
(finish) → Phase F → Phase D → Phase B, nothing that needs an API/LLM until further
notice. Two open roadmap questions were also resolved first (see the commit right before
this one): Kindle/MOBI export dropped from Phase D, and Layer 0 (AI Publishing Workspace)
will live in its own new top-level mode/tab. This phase is the first concrete Phase E
item against that plan — the layers-list panel flagged in Phase 59's brainstorm as the
biggest remaining gap.

- **`bringForward`/`sendBackward`** (`coverElements.ts`): move an element exactly one
  step in paint order by swapping `zIndex` with its actual sorted neighbour, not by
  adding/subtracting 1 — `bringToFront`/`sendToBack` deliberately leave gaps (`max + 1`,
  `min - 1`), so two adjacent-in-stacking-order elements can be many `zIndex` units
  apart. A naive `±1` would sometimes no-op and sometimes jump past several elements
  depending on those gaps; swapping with the sorted neighbour is correct regardless.
- **`CoverLayersPanel`** (new `layout/inspector/CoverLayersPanel.tsx`): lists every
  element topmost-first (Figma/Canva convention), each row showing a kind icon + a
  content-aware label (a text/badge element's own text, not just "Text box" — useless
  for telling five text elements apart in a list). Click selects; per-row chevrons call
  `bringForward`/`sendBackward`, disabled at the top/bottom of the stack. Rendered in
  `StructuralPagePanel.tsx` whenever the Cover/Back Cover has any elements at all,
  deliberately *not* gated behind "an element is already selected" — it's a picker as
  much as a status display, so gating it behind a precondition it exists to solve would
  defeat the point.
- **One-step nudges added to `CoverElementPanel`'s existing toolbar row too** —
  alongside the pre-existing jump-to-front/jump-to-back buttons, not replacing them.
  Caught and fixed a real (if minor) pre-existing UX bug while here: those two buttons
  were labelled "Send backward"/"Bring forward" but always jumped straight to the
  back/front — accurate now that true one-step versions exist alongside them under
  "Send to back"/"Bring to front".
- **Deliberately not attempted this pass:** multi-select and grouping, the other half
  of Phase 59's "biggest open gap" framing. The layers list and incremental z-order
  solve the concrete "can't find/reorder a buried element" pain on their own; multi-
  select is a materially bigger interaction-model change (drag-selection rectangle or
  shift-click, a shared-transform gesture across several elements at once) better
  scoped as its own pass rather than folded in here.

`tsc -b --force` clean. Not independently verified live in Chrome — same sandbox `npm
run dev` blocker as every phase since 55 (confirmed still broken this phase: `vite
--config-loader runner` fails with a syntax error loading `vite.config.ts`, consistent
with the pre-existing `node_modules` corruption documented since Phase 53).

## Phase 62 — Cover elements: rotation, double-click editing, snap guides; Back Cover
parity; per-element contrast checking; wrap preview (2026-08-01)

Closes out every remaining Phase E item from Phase 59's brainstorm and Phase 61's
"what's left" list, per the user's "finish the phase, then decide what's next"
instruction — six pieces of work, in the order built:

- **Rotation.** `rotation?: number` added to `BaseCoverElement` (CSS `transform:
  rotate()` convention, clockwise-positive, pivoting on the element's own centre). A new
  rotate handle in `coverElementLayer.tsx` (a circular dot above the selected element,
  `RotateCw` icon) computes drag angle from the pointer's position relative to the
  element's screen-space centre; Shift snaps to 15° steps. PDF export wraps the whole
  per-element draw dispatch in a `pushGraphicsState()` → `translate(centre)` →
  `rotateRadians` → `translate(-centre)` → *(unchanged draw calls)* → `popGraphicsState()`
  transform in `coverElements.ts`, rather than computing per-shape corner-pivot offsets —
  this makes image+clip rotation work for free, since the clip rectangle is drawn inside
  the already-rotated coordinate frame. PDF's rotation convention is counter-clockwise-
  positive (the mirror of CSS), so `pdfRotationRad = -rotationDeg`; verified empirically
  with three separate rasterized test PDFs (a bounding-box swap test, an asymmetric-
  marker test to unambiguously pin down rotation *direction* — a symmetric shape's
  bounding box can't distinguish CW from CCW — and a rect+image-clip integration test
  showing a clean diamond with no spillover) before shipping, per the roadmap item's own
  "not without empirical verification" note. Also added a Rotation slider (-180°..180°,
  with a conditional Reset button) to `CoverElementPanel.tsx`.
- **On-canvas double-click text editing.** Double-clicking a `text`/`badge` element now
  swaps its display span for an `EditingTextField` — a styled `<input>` matching the
  element's own font/size/colour/alignment, autofocused with the text pre-selected.
  Enter blurs (commits); Escape cancels via a `cancelledRef` flag set synchronously
  before calling the cancel callback directly — needed because React's unmount-
  triggered blur would otherwise still fire the commit-on-blur handler *after* the
  explicit cancel, silently saving the discarded edit. Found and fixed a real
  pre-existing bug along the way: every plain click on an element (not just double-
  clicks) was writing a spurious no-op "move" entry to undo history, because
  `startDrag`/`commitDrag` had no guard against a drag gesture that moved nothing —
  fixed with an equality-check guard before committing, in both `commitDrag` and the
  new `commitRotate`.
- **Snap-to-other-elements + safe-zone guides.** Extended the existing snap-to-page-
  centre logic (`applyDelta`'s 'move' branch) to also collect each other element's
  leading-edge/centre/trailing-edge and the safe-zone inset (both axes) as snap targets,
  picking the closest match within a threshold and rendering a guide line at whichever
  target fraction was hit (`guideX`/`guideY` now carry the actual fraction rather than a
  hardcoded `left-1/2`). `COVER_SAFE_ZONE_MM` exported from `shared.tsx` for this; the
  safe-zone-to-trim-fraction conversion is `(COVER_SAFE_ZONE_MM * PX_PER_MM) / trimSizePx`
  — the bleed term cancels out since both the safe-zone inset and the trim edge are
  measured from the same bleed-box reference edge, confirmed numerically (0.25in KDP
  margin ⇒ `frac × trimWidthInches = 0.25`).
- **Back Cover free-positioning parity.** `blurbPosition?`/`authorBioPosition?:
  CoverFieldPosition` added to `BackCoverPage.content`, closing the asymmetry Phase 59
  left open (Front Cover's title/subtitle/author got independent free-drag positioning;
  Back Cover's two fields didn't). Wired through the same `DraggableCoverField`/
  `ResetFieldPositionButton` components `cover.tsx` already uses, with a `rootRef` added
  to `BackCoverRender`'s root div. PDF export gained a `fieldPdfXY`-equivalent helper in
  `drawBackCoverPdf`; the blurb (a multi-paragraph wrapped block, unlike title/subtitle/
  author's single line) anchors its position at the block's own centre — matching the
  screen's `translate(-50%, -50%)` — keeping the pre-existing `contentWidthPt` wrapping
  column width recentred under the drag point rather than attempting to replicate the
  screen's shrink-to-fit auto-width for a dragged block, a documented, honest
  simplification (see the code comment in `backCover.tsx`) rather than a silent
  approximation.
- **Per-element accessibility/contrast checking.** New checker
  `accessibility.cover-element-contrast` in `virtualEditor/checkers/accessibility.ts`
  does real WCAG 1.4.3 contrast-ratio math (sRGB relative luminance, from scratch — no
  existing contrast/luminance utility existed anywhere in the codebase) for Cover/Back
  Cover's `text`/`badge` `CoverElement`s. Background resolution: a badge's own
  `backgroundColor` is always self-contained; a plain text element looks for the nearest
  fully-opaque `rect`/`ellipse`/`badge` beneath it (lower `zIndex`, its own centre point
  falling inside that candidate's box), falling back to the page's flat tint colour when
  no image is set (`tintHex(theme.page.accent, 0.85 | 0.92)` — the exact literal amounts
  `cover.tsx`/`backCover.tsx` themselves paint). Text over a photo, or over a translucent
  element, is reported as a `suggestion`-severity, low-confidence "unverifiable" finding
  rather than a guess — the same soft-uncertainty idiom
  `galleryMissingDescriptionsChecker` already established, since this codebase's
  `Severity` type has no dedicated "info" tier. Verified the luminance/contrast formula
  against known WCAG reference values in a standalone Node script (white/black = 21:1
  exact; `#767676` vs white ≈ 4.54:1, a commonly-cited "just passes AA" boundary colour)
  before wiring it into the checker. Deliberately out of scope: Cover's own title/
  subtitle/author/blurb/author-bio fields, whose colour has a more involved automatic-
  fallback rule (`resolveCoverColor`) this pass doesn't attempt to replicate.
- **Wrap-aware front+spine+back cover view.** New `WrapCoverPreviewButton`
  (`structuralPages/WrapCoverPreview.tsx`), surfaced once in `StructuralPagePanel.tsx`
  whenever a Cover or Back Cover page is selected (and both exist — otherwise renders
  nothing). Opens a dialog rendering Back Cover, a spine strip, and Cover side by side —
  the order a real printed wraparound cover reads left to right laid flat with the spine
  centred — reusing `coverPageType.Render`/`backCoverPageType.Render` directly (the
  exact components `Page.tsx` renders in the normal flow) with `selected={false}` and
  no-op `onSelect`/`onCommit`, the same "render for display only" convention `Page.tsx`'s
  own `decorative` prop already established, scaled down with the `absolute` +
  `origin-top-left` + `scale()` technique `ThumbnailPage.tsx` established rather than
  inventing a second one. Spine width reuses `cover/spineWidth.ts`'s existing live-page-
  count calculation (already shipped for the text-only estimate in `SpineWidthInfo`) —
  genuinely read-only, no merged wraparound file or shared data model between the two
  pages, per the roadmap item's own "without merging the two pages' underlying data"
  scope note.

`tsc -b --force` clean throughout (checked after each of the six pieces individually,
not just once at the end). `oxlint` still crashes with the same sandbox-level bus error
noted since Phase 59. Not independently verified live in Chrome — same sandbox `npm run
dev` blocker as every phase since 55.

## Phase 63 — Layer 0 (AI Publishing Workspace): entity schema + store + Planning
mode (2026-08-01)

First Phase F item, per the settled E → F → D → B build order. Builds the foundation
`docs/AI_WORKSPACE_VISION.md` calls for — a structured entity bible, not a folder-of-
files — plus a genuinely usable (not just inert data-layer) new top-level "Planning"
screen, since a store nothing reads isn't really a shipped milestone.

- **`types/layer0.ts`.** Eight entity interfaces (`Character`, `Location`,
  `TimelineEvent`, `GlossaryTerm`, `ReferenceEntry`, `IllustrationBrief`, `StyleRule`,
  `ResearchNote`), all extending `BaseLayer0Entity` (`id`/`createdAt`/`updatedAt`, same
  shape `notesStore.ts`'s `Note` already uses). Deliberately a single lean v1 schema,
  not a per-genre variant — `docs/AI_WORKSPACE_VISION.md`'s own "Open questions for a
  future session" explicitly leaves "exact entity schema per genre template" open for
  its own design pass, not assumed here. `TimelineEvent.when` is free text ("Day 3",
  "Spring, Year 1") rather than a calendar date — most fiction timelines aren't real
  dates at all — with a separate numeric `order` as the actual manual-reorder source of
  truth (reorder UI itself is deferred, see below). `Layer0Bible` bundles all eight
  collections for one project; `LAYER0_KIND_TO_COLLECTION`/`LAYER0_KIND_LABELS`/
  `LAYER0_ENTITY_KINDS` are the one place kind↔collection↔display-label mapping lives,
  so the store/UI code goes kind → collection generically instead of each writing its
  own switch statement.
- **`store/layer0Store.ts`.** One `Layer0Bible` per project (`byProject`), the same
  shape every other per-project store already uses. `addEntity`/`updateEntity`/
  `deleteEntity` are each ONE generic method parameterized by `collection: K extends
  keyof Layer0Bible`, not eight near-identical CRUD triplets — the exact duplicate-logic
  CLAUDE.md's Code Standards ask to avoid. TypeScript can't statically prove every
  `Layer0Bible[K]` element extends `BaseLayer0Entity` from inside a function generic
  over `K` (indexed-access types don't carry that constraint), so one small, documented,
  internal `asEntities` cast bridges that gap — every public method signature stays
  fully generic and type-safe for callers regardless.
- **History wrappers in `editorActions.ts`.** `addLayer0EntityWithHistory`/
  `updateLayer0EntityWithHistory`/`deleteLayer0EntityWithHistory` — again one generic
  triplet, not eight — following the exact snapshot → mutate-via-published-action →
  `historyStore.record` shape the Notes wrappers already established. Every Layer 0 edit
  is undoable exactly like every other kind of edit in this app; there was no real
  "per-item CRUD with deliberately no history" precedent anywhere in the codebase to
  follow instead (confirmed by research before building — the only no-history
  precedent found was bulk *replace-all* for project-file import, a different
  operation).
- **`uiStore.appMode: 'editor' | 'planning'`.** A new, separate concept from the
  existing `workspaceMode` (which only ever swaps `AppShell`'s centre column) — `appMode`
  decides which top-level *shell* renders at all, one level higher up, in `EditorPage
  .tsx`. This is the concrete implementation of the "new top-level mode/tab, not a
  sidebar section" placement decided with the user 2026-08-01 (`AI_WORKSPACE_VISION.md`).
- **`layout/planning/PlanningShell.tsx` + `EntityListPanel.tsx`.** A structurally
  separate screen (its own header bar with a "Back to editor" button, not a fourth
  column bolted onto `AppShell`) — a pure-manuscript user who never clicks the new
  "Planning" toolbar button never mounts any of this. Left-hand category list (all
  eight kinds, with live counts) + one generic list/add/edit/delete pane on the right,
  covering all eight entity kinds through a single component rather than eight near-
  duplicate list+form screens — `layout/planning/layer0FormConfig.ts` is the one place
  each kind's editable fields (`{ key, label, type }`) are declared, since every field
  across all eight kinds is plain text or optional plain text. Add/edit uses a `Dialog`
  form; delete is immediate (no confirmation step — matches this codebase's existing
  convention for low-stakes, easily-undoable deletes, e.g. cover elements' Delete key).
- **Deliberately deferred, flagged in `docs/ROADMAP.md` as new unchecked items rather
  than silently left out:** Layer 0 isn't wired into `exportProjectFile.ts`/
  `importProjectFile.ts` yet, so a saved `.bookstudio` file won't include Planning data
  (it still persists locally via the store's own `localStorage` persistence — not lost,
  just not in the portable file yet); `TimelineEvent` has no drag-reorder UI (new events
  append at the end via `order`). Also out of scope for this foundation pass, per
  `docs/AI_WORKSPACE_VISION.md` itself: the scoped AI prompt generator
  (`ClipboardProvider`), the paste-response-back diff, and the Continuity checker — all
  build on top of this store, not part of it.

`tsc -b --force` clean throughout (checked after each piece). `oxlint` still crashes
with the same sandbox-level bus error noted since Phase 59; `npm run dev`/`vite build`
still fail with the same pre-existing `vite.config.ts` load error noted since Phase 55 —
neither is new to this phase, both re-confirmed before writing this entry.

## Phase 64 — Fix off-page ProjectSettingsDialog; live word count (2026-08-01)

User-reported bug plus a user-prompted product question, both handled before resuming
Phase F.

- **Off-page `ProjectSettingsDialog` fix.** Root cause: `components/ui/dialog.tsx`'s
  `DialogContent` had no max-height or scroll — it rendered at its full natural height
  (`ProjectSettingsDialog` alone is name + trim size + four margin fields + the whole
  `ThemeGallery` grid + six style-guide selects), centred via `top-1/2
  -translate-y-1/2`. Any dialog tall enough to exceed the viewport simply extended off
  both the top and bottom, unreachable, with nothing to scroll — reported as "appears
  off page at 100%." Fixed generically in the shared `DialogContent` component (not
  patched per-dialog) so every dialog in the app is protected the same way, including
  ones added this session (`WrapCoverPreviewButton`, Layer 0's entity edit dialog):
  `max-h-[85vh]` caps the dialog to the viewport, and the padding moved from the outer
  `fixed`-positioned element onto a new inner `overflow-y-auto` wrapper — the close
  button stays an `absolute` sibling of that wrapper (not a child), so it stays pinned
  top-right rather than scrolling away with the content, a well-known gotcha with
  putting `overflow-y-auto` directly on an absolutely-positioned element's own
  containing block.
- **Word count / search / spellcheck / thesaurus — investigated, one shipped, three
  roadmapped.** User asked whether Book Studio should have these; audited what
  actually exists before answering. Findings: `wordCount()`/text-extraction already
  existed internally (`TypographyPanel.tsx`, several Virtual Editor checkers) but was
  never surfaced in the UI — genuinely just a "finish exposing it" gap, not a missing
  feature, so shipped immediately: new `hooks/useManuscriptWordCount.ts` reuses
  `virtualEditor/textExtract.ts`'s `extractTextSpans` (no new text-walking logic) and
  is now shown live next to the project name in the Toolbar, memoized on the
  `Manuscript` reference so it only recomputes on a real edit-commit, not per
  keystroke or per unrelated re-render. Search (find/find-and-replace across
  manuscript text), a real dictionary-backed spell-checker (today there's only the
  browser's own uninstrumented `contentEditable` default — `spellCheck` is never
  explicitly set anywhere, confirmed by grep), and a thesaurus/synonym lookup are all
  genuinely absent — added to `docs/ROADMAP.md` as new, reasoned, unchecked items
  (Phase B for search, Phase B for real spellcheck since `proofreading.ts`'s own doc
  comment already explicitly scoped spelling out as "no dictionary lookup" — a
  deliberate prior decision now flagged for revisiting, not an oversight — and Phase F
  for thesaurus, lowest priority of the three) rather than either building all three
  under time pressure or silently doing nothing.

`tsc -b --force` clean. `oxlint`/`vite build` unchanged sandbox failures, re-confirmed
before writing this entry, not new.

## Phase 65 — Wire Layer 0 into project-file save/load (2026-08-01)

Closes the gap flagged when the Layer 0 store shipped (Phase 63): a saved
`.bookstudio` file didn't include Planning data, so "Save to file" → "Load" on another
machine would silently drop the story bible even though everything else round-tripped.

- **`types/projectFile.ts`.** `ProjectFileBundle` gained `layer0Bible: Layer0Bible`.
  Deliberately no `PROJECT_FILE_VERSION` bump — same additive-field convention every
  other purely-additive field in this codebase already uses (e.g. `CoverElement
  .rotation`); a file saved before this shipped just has no `layer0.json` entry.
- **`exportProjectFile.ts`/`useExportProjectFile.ts`.** One new ZIP entry
  (`layer0.json`), read from `useLayer0Store` with the usual `EMPTY_LAYER0_BIBLE`
  fallback for a project that never touched Planning mode — same pattern every other
  per-project store's export wiring already follows.
- **`importProjectFile.ts`.** New `optionalJson` helper alongside the existing
  throwing `json` helper — `layer0.json` is read leniently (missing entry → empty
  bible) rather than treated as file corruption, so every `.bookstudio` file saved
  before this phase still opens without error.
- **`useImportProjectFile.ts`.** Calls `layer0Store.replaceBible` alongside the other
  five stores' bulk-replace actions — now six per-project stores a fresh imported
  project's data gets written into, doc comment updated to match.

`tsc -b --force` clean. Not runtime-tested end-to-end via a real save→load round trip
(same sandbox `npm run dev`/`vite build` blocker as every phase since 55) — the change
mirrors the exact existing `notes.json`/`customTheme.json` pattern closely enough that
this is a reasonable confidence level, but flagging the gap honestly rather than
claiming a live-tested guarantee.

## Phase 66 — AI Workspace: `ClipboardProvider` scoped prompt generator (2026-08-01)

The first real AI-Workspace feature on top of Layer 0: turns the entity bible into a
prompt the user takes to their own Claude/ChatGPT, rather than Book Studio calling an
AI itself. Three new files plus one `PlanningShell.tsx` wiring change.

- **`types/aiProvider.ts`.** The swappable `AiProvider` interface
  (`{ id, label, sendPrompt(text): Promise<void> }`) `docs/AI_WORKSPACE_VISION.md`
  called for, plus the v1 `clipboardProvider` implementation — `navigator.clipboard
  .writeText`, no backend, no billing. `ApiKeyProvider` (direct call, streamed diff)
  stays deferred to Phase G/H; nothing about `promptContext.ts` or the panel UI will
  need to change when it eventually exists, since both only ever call
  `provider.sendPrompt(text)`.
- **`layout/planning/promptContext.ts`.** The actual context-curation logic —
  `docs/AI_WORKSPACE_VISION.md`'s "the actual hard problem: context curation, not
  storage." `detectMentionedEntityIds` is a deliberately deterministic, no-dictionary/
  no-NLP word-boundary regex match of each character/location/glossary-term name
  against a chapter's plain text (reusing the Virtual Editor's own `blockPlainText`
  extractor) — the same cheap/predictable idiom every Virtual Editor checker already
  follows, not a new kind of logic. Timeline events/references/illustration briefs/
  research notes/style rules are excluded from auto-detection (their labels aren't
  literal recurring prose the way a name is) and left for manual opt-in; style rules
  are pre-checked by default instead, since they're meant to always apply.
  `buildPromptText` assembles the final markdown prompt: task description, optionally
  the target chapter's title, an optional previous-chapter tail excerpt (last 600
  characters, for continuity/tone reference — not a duplicate full copy), then only
  the user-selected entities grouped by kind. Deliberately never the whole bible,
  keeping the "minimum-relevant bundle" framing from the vision doc rather than
  dumping every entity into every prompt.
- **`layout/planning/PromptGeneratorPanel.tsx`.** The UI — task textarea, chapter
  picker (defaults to "no specific chapter"), a checkbox list per entity kind with a
  live "mentioned" badge on auto-detected rows, a "include previous chapter tail"
  toggle, and a live-updating prompt preview with one-click copy (via
  `clipboardProvider.sendPrompt`, not a second clipboard implementation). An
  `EmptyState` guards the case where the bible has nothing in it yet, pointing the
  user back to the entity categories.
- **`layout/planning/PlanningShell.tsx`.** Left nav gained a `Separator` and a
  "Generate Prompt" entry below the eight entity categories, backed by a new
  `activeView: Layer0EntityKind | 'prompt-generator'` union (renamed from the old
  `activeKind`). Selecting it swaps the right pane from `EntityListPanel` to
  `PromptGeneratorPanel`.

One implementation note: the generic `bible[LAYER0_KIND_TO_COLLECTION[kind]]` reads in
`promptContext.ts` needed `as unknown as Record<string, unknown>[]` (not a direct `as`)
to satisfy the compiler — TypeScript can't prove a union of the eight concrete entity
array types structurally overlaps `Record<string, unknown>[]` from inside a function
generic over `kind`, the same limitation `layer0Store.ts`'s `asEntities()` helper
already works around elsewhere in this codebase. `EntityListPanel.tsx` uses the
identical two-step cast for the same reason.

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox `npm run dev`/
`vite build` blocker as every phase since 55) — the clipboard-copy path is standard
Web API usage with no unusual browser-support risk, but flagging the gap honestly.

## Phase 67 — Toolbar overflow fix; auto-expand Inspector on selection (2026-08-01)

Two user-reported UX issues, fixed together as a small batch rather than folded
silently into the next feature phase.

- **Word count overlapping the theme toggle.** `Toolbar.tsx`'s project-name/
  word-count group sat in a `flex-1` div with no `overflow-hidden`; the word-count
  `<p>` was `shrink-0 whitespace-nowrap`, so once the fixed-width button group to
  its right grew crowded (Planning/Version History/Save/Load/Project Settings/
  Export/Inspector-toggle/Keyboard-shortcuts all now live there), the word count had
  nowhere to shrink to and visually spilled past its container's edge into the
  adjacent light/dark mode button instead of yielding space — flex children with
  `overflow: visible` aren't clipped by their own box. Fix: `overflow-hidden` on the
  wrapping div (hard guarantee against any future overlap, regardless of how tight
  this row gets) plus both the project name and word count now `min-w-0 shrink
  truncate` (word count at `shrink-[2]` so it yields first — the project name stays
  legible longer, since it's the more identifying piece of the two).
- **Clicking a page/block did nothing if the Inspector was collapsed.** Investigated
  the reported "have to navigate to Structure then Cover to edit" friction. Turned
  out clicking a structural page (Cover, Back Cover, etc.) or a manuscript block
  directly in the main canvas *already* called `selectStructuralPage`/`select` +
  `setInspectorTab(...)` — every structural page type's `Render` wires `onClick`
  straight to `onSelect` (confirmed across all 18 types in `structuralPages/types/`).
  The real gap: `uiStore.setInspectorTab` only ever set the tab, never touched
  `inspectorCollapsed` — so if the Inspector happened to be collapsed, the click
  silently succeeded internally while showing nothing, and a user in that state would
  reasonably conclude clicking the page does nothing at all and go looking for
  another way in. Fix: `setInspectorTab` now also sets `inspectorCollapsed: false`,
  so selecting anything on the canvas is guaranteed to surface its editor
  immediately — one click, no separate discovery of the Sidebar's Structure tab
  required. `toggleInspector` (the explicit collapse control) is untouched; this
  change only ever re-opens the panel, never closes it.

`tsc -b --force` clean.

## Phase 68 — AI Workspace: paste-response-back with reviewable diff (2026-08-01)

Closes the round trip `ClipboardProvider` opened (Phase 66): generate a prompt, take
it to your own Claude/ChatGPT, paste the reply back in, review before anything
touches the story bible. Re-read `docs/AI_WORKSPACE_VISION.md`'s "Bible sync must be
a reviewable diff, never automatic" section closely before building this — it
specifically scopes V1 to *suggested field updates*, explicitly warning that "free-text
extraction of an AI response back into structured fields is unsolved and
error-prone." That ruled out the more ambitious "diff the AI's prose against the
manuscript and offer to insert new chapter content" interpretation — a real, useful
feature, but a different one (and now a candidate for its own future roadmap item,
not this one).

- **`layout/planning/pasteBackSuggestions.ts`.** `splitIntoSentences` breaks pasted
  text into sentence-ish chunks (split by line, then by sentence-ending punctuation
  — not linguistically perfect, but excerpts are user-editable before accepting, so a
  slightly-off boundary costs a small edit rather than a wrong suggestion).
  `extractBibleSuggestions(bible, pastedText)` then finds every existing Character/
  Location whose name appears as a whole word in some sentence (word-boundary regex,
  reusing `promptContext.ts`'s `escapeRegExp` — exported for this — rather than a
  second copy) and returns one `BibleSuggestion` per unique matching sentence.
  `appendToNotes(existing, excerpt)` appends with a blank-line separator, never
  overwrites. Deliberately Character/Location only (not all eight Layer 0 kinds) —
  both are the only shapes with a free-text `notes` field that's always safe to
  append to; appending arbitrary prose into `GlossaryTerm.definition` or
  `StyleRule.rule` would corrupt a single-purpose field instead of helping.
- **`layout/planning/PasteBackPanel.tsx`.** Textarea for the pasted response, live
  `useMemo`'d suggestion list below it. Each suggestion renders as a card styled
  identically to the Virtual Editor's `FindingRow` (Phase C) — `bg-panel`,
  `rounded-[var(--radius-card)]`, `opacity-60` once resolved — with an editable
  excerpt (`Textarea`, so the user can trim/fix the auto-detected sentence before
  committing) and Accept ("Add to notes")/Reject buttons. Accept calls
  `updateLayer0EntityWithHistory` (undo/redo-safe, matching every other Layer 0
  write) with `{ notes: appendToNotes(entity.notes, excerpt) }`; Reject only updates
  local component state. An `EmptyState` covers "pasted text but no name matches."
- **`PlanningShell.tsx`.** New "Paste Response" nav entry (`ClipboardPaste` icon)
  alongside "Generate Prompt," extending the `PlanningView` union a second time.

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox blocker as every
phase since 55).

## Phase 69 — Layer 0: TimelineEvent manual reorder UI (2026-08-01)

Closes the gap flagged when the Layer 0 store shipped (Phase 63): `TimelineEvent
.order` existed on the data model and new events appended at the end, but nothing in
`PlanningShell` let the user actually reorder one. Mirrors the codebase's established
reorder pattern (chapters, structural pages) rather than introducing native HTML5
drag-and-drop — Up/Down buttons, not a drag handle.

- **`layer0Store.ts`.** New `moveTimelineEvent(projectId, id, direction)`: sorts
  `timelineEvents` by `order`, swaps the target with its immediate by-order neighbour,
  renumbers the whole array sequentially (0..n-1). Same adjacent-swap-then-renumber
  shape as `structuralPageStore.movePage` — there scoped per category, here across the
  whole timeline (there's only one timeline, no sub-grouping to respect). No-ops at a
  boundary or a missing id, matching `movePage`'s own boundary handling.
- **`editorActions.ts`.** `moveTimelineEventWithHistory` wraps it exactly like
  `movePageWithHistory`/`moveChapterWithHistory` — the swap primitive is its own
  inverse, so undo calls the same function with `direction` flipped and redo repeats
  the original call, no snapshot needed.
- **`EntityListPanel.tsx`.** For `kind === 'timelineEvent'` only: the displayed list is
  now sorted by `order` (previously just insertion order, which happened to usually
  match but wasn't guaranteed once entries could ever be reordered), and each row
  gains `ChevronUp`/`ChevronDown` buttons (disabled at the first/last position),
  calling the new history-wrapped action. Every other entity kind is untouched — no
  `order` field, no buttons rendered.

`tsc -b --force` clean.

## Recommended next task
The AI-Workspace round trip (generate → paste back → review) and Layer 0's one
remaining structural gap (timeline reordering) are both done. Reasonable next pieces,
in rough priority order: (1) the Continuity checker, extending the Virtual Editor's
checker architecture over Layer 0 data — the natural next AI-Workspace item; (2) the
project-creation wizard and outlining/story-structure templates, which don't depend on
any Layer 0 AI-Workspace piece at all; (3) the bigger "insert AI-drafted prose into the
manuscript with a reviewable diff" feature flagged in Phase 68 — distinct from
bible-sync, needs its own scoping pass (reusing `src/parser/`'s import pipeline per
`AI_WORKSPACE_VISION.md`). Also still open and worth folding in opportunistically:
manuscript search/find, real spellcheck, and a thesaurus (docs/ROADMAP.md Phase B/F,
flagged 2026-08-01).

## Phase 70 — Project-creation wizard: genre/audience starting template (2026-08-01)

Read `docs/AI_WORKSPACE_VISION.md`'s "Reject the folder-of-files model" section again
before starting, since its "a genre template just turns subsets on/off and relabels
them" line is the obvious anchor for this ticket — but its own "Open questions"
explicitly defers "exact entity schema per genre template" to a future design pass.
Built the lightest version that satisfies `docs/ROADMAP.md`'s actual wording ("decides
which Layer 0 entity subset a new project starts with") without pre-empting that
deferred design pass: no relabeling, no per-project category visibility toggling, no
new dialog step.

- **`data/projectTemplates.ts`.** `CATEGORY_TEMPLATES: Record<ProjectCategory,
  { trimSize: TrimSize; seedKinds: Layer0EntityKind[] }>` — one small static map. Trim
  sizes follow real-world publishing convention per category (novel/nonfiction `6x9`;
  children's/educational/coffee-table `8.5x11`, the largest option this app's
  `TrimSize` union has; nature/scientific `7x10` for figure/table width). `seedKinds`
  is 1-3 genre-relevant Layer 0 kinds per category (a novel seeds Character/Location/
  Style Rule; nonfiction seeds Reference/Research Note/Glossary Term; a coffee-table
  book seeds Illustration Brief/Reference; `other` seeds just Character, a minimal safe
  default). `seedProjectTemplate(projectId, category)` loops those kinds through a
  plain `switch`-based `seedExampleEntity` (not generic-over-`kind` — each branch needs
  its own concrete field literal, so genericizing it would only reintroduce the cast
  dance `layer0Store.ts`'s `asEntities()` already documents as the accepted escape
  hatch elsewhere, not worth it for eight short one-offs), each call going through
  `addLayer0EntityWithHistory` so every seeded entity is undoable exactly like a user's
  own edit. Every seeded entity's text ends with "This is a starter example — edit or
  delete it," and since Layer 0 is never read by PDF/EPUB/HTML export (`types
  /layer0.ts`'s own doc comment), an unedited example can never leak into a shipped
  book even if the user never touches it.
- **`pages/NewProjectDialog.tsx`.** No new step — `ProjectCategory` was already the
  genre/audience axis the picker collects. `handleCreate` now also calls
  `updateProjectSettings(project.id, { trimSize: CATEGORY_TEMPLATES[category]
  .trimSize })` and `seedProjectTemplate(project.id, category)` right after
  `createProject`. Added one line of copy under the category picker so this isn't a
  silent side effect: "We'll set a matching trim size and add a few example Planning
  entries you can edit or delete — nothing is exported until you write it yourself."

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox blocker as every
phase since 55).

## Phase 71 — Outlining / story-structure templates (2026-08-01)

The other half of this phase's "wizard + templates" pairing. Reuses Layer 0's
`TimelineEvent` collection (which already has the ordered-beat shape this needs, and
gained manual reordering in Phase 69) rather than inventing a new data model —
"outlining" is just seeding the Timeline with a structure's beats up front instead of
one at a time.

- **`data/outlineTemplates.ts`.** Five templates as plain data (`OutlineTemplate {
  id, label, description, beats: OutlineBeat[] }`): Three-Act Structure (8 beats), The
  Hero's Journey (12), Save the Cat Beat Sheet (15), Problem → Solution for
  non-fiction (9), Picture Book Arc for children's (6) — spanning the `ProjectCategory`
  space Phase 70's wizard already established. Beat names are standard, widely-taught
  narrative-theory/screenwriting vocabulary; every beat's one-line description is
  original, not quoted from any source. `applyOutlineTemplate(projectId, template,
  startOrder)` seeds each beat as a new `TimelineEvent` via `addLayer0EntityWithHistory`
  — purely additive, always appended after `startOrder` (the current timeline length),
  never touching or reordering events that already exist.
- **`layout/planning/OutlineTemplatesPanel.tsx`.** A card per template (label,
  description, beat count) with an "Apply to Timeline" button; the button label switches
  to "Add N events to Timeline" once the project already has timeline events, so
  applying a second template is transparently additive rather than looking like a
  silent overwrite.
- **`PlanningShell.tsx`.** New "Outline Templates" nav entry (`ListTree` icon) above
  "Generate Prompt"/"Paste Response." A third copy-pasted nav-button block would have
  repeated itself for the third time, so this phase also pulled the shared markup into
  a small `ToolNavButton` component used by all three tool entries — the entity-kind
  rows above stay separate since they render a count badge these never need.

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox blocker as every
phase since 55).

## Recommended next task
Phase F's two "wizard + templates" items are both done. Reasonable next pieces: (1) the
Continuity checker, extending the Virtual Editor's checker architecture over Layer 0
data — the last major unbuilt AI-Workspace item; (2) word-count goals/writing-session
tracking, or distraction-free writing mode, both independent of everything shipped so
far this phase; (3) the bigger "insert AI-drafted prose into the manuscript with a
reviewable diff" feature flagged in Phase 68. Also still open and worth folding in
opportunistically: manuscript search/find, real spellcheck, and a thesaurus
(docs/ROADMAP.md Phase B/F, flagged 2026-08-01).

## Phase 72 — Word-count goals and writing-session tracking (2026-08-01)

The daily-goal layer on top of the live word-count total already in `Toolbar.tsx`
(Phase B). Deliberately app-preference-shaped, not a Layer 2 Content concern — this
never reads or writes manuscript data itself, only observes the total
`useManuscriptWordCount` already computes.

- **`store/writingSessionStore.ts`.** One small per-project record: `dailyGoal`
  (0 = unset) and `log: Record<dateStr, number>` — the *net* words written per local
  calendar date (can be negative on a day with more deletion than addition; shown as-is
  rather than clamped, so the log stays honest). `recordWordCount(projectId,
  currentTotal)` diffs against a running `lastKnownTotal`/`lastKnownDate` baseline: the
  first observation ever, or the first observation after a calendar-date change,
  re-establishes the baseline without attributing anything to "today" — the load-
  bearing detail that keeps opening an existing 50,000-word manuscript for the first
  time from instantly reading as "50,000 words written today," and keeps a fresh day
  from silently carrying yesterday's already-counted total forward as a gain.
- **`hooks/useWritingSessionTracking.ts`.** Feeds `useManuscriptWordCount`'s live total
  into `recordWordCount` on every change via a `useEffect` — no separate polling loop,
  since the word count already recomputes on every manuscript edit. Mounted once in
  `Toolbar.tsx`, which already reads the same live count for display.
- **`components/common/WritingGoalDialog.tsx`.** Today's net words (with a `Progress`
  bar once a goal is set), a daily-goal number input (commits on blur/Enter), and the
  last 7 calendar dates including zero-activity days (so a gap in a streak is visible,
  not silently skipped, negative days shown in `text-danger`). Opens by clicking the
  word-count text itself in `Toolbar.tsx` — deliberately not a new toolbar button/icon,
  given the crowding already flagged in `docs/SUGGESTIONS.md`'s Phase 67 entry; this
  reuses an existing element's click target instead of adding a twelfth control to an
  already-busy row.

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox blocker as every
phase since 55) — in particular, the day-boundary logic is straightforward but
untested live across an actual local-midnight rollover.

## Phase 73 — Distraction-free writing mode + reading mode (2026-08-01)

The user asked for a reading mode alongside the already-roadmapped distraction-free
writing mode, so both shipped together as one shared mechanism rather than two
independent features — they're mutually exclusive states of the same "hide the chrome"
concept, not two unrelated additions.

- **`store/uiStore.ts`.** New `FocusMode = 'none' | 'write' | 'read'`, `focusMode`
  state (default `'none'`), `setFocusMode` action — excluded from persistence (same
  reasoning as `projectSettingsOpen`: a focus session shouldn't resume itself after a
  reload).
- **`renderer/Page.tsx`'s existing `decorative` prop is the whole read-mode
  mechanism.** It already suppressed every interactive affordance (no `BlockToolbar`,
  no insert-block drop zones, no `PageToolbar`, no `contentEditable`, no
  `NoteIndicatorBadge`) for `ThumbnailPage.tsx`'s tiny-scale copies — confirmed nothing
  about it assumes thumbnail scale, so reading mode just threads the same flag through
  at full size instead of inventing a second non-interactive rendering path.
  `LazySpread.tsx` gained a pass-through `decorative?: boolean` prop (forwarded to
  `Page`); `BookRenderer.tsx` gained `decorative?: boolean` and `hideThumbnails?:
  boolean` props (the latter overrides `uiStore.showThumbnails` without touching the
  user's actual preference, so the rail comes back exactly as they left it once they
  exit focus mode).
- **`layout/FocusModeLayout.tsx`** (new). Renders instead of the three-column
  `AppShell` whenever `focusMode !== 'none'` — just `BookRenderer` full-screen with
  `hideThumbnails` always on, plus one small floating pill (mode label, "Esc to exit"
  hint, an explicit `X` button) as the only chrome. `write` passes `decorative=false`
  (today's normal fully-editable behaviour); `read` passes `decorative=true`. A
  project with no manuscript yet shows a plain "nothing to show" message with an exit
  button rather than an empty full-screen void.
- **`layout/AppShell.tsx`.** One new branch: `if (focusMode !== 'none') return
  <FocusModeLayout .../>`, placed *after* `useKeyboardShortcuts`/`useAutosaveSnapshots`
  are called so both stay active inside focus mode (Escape-to-exit and autosave both
  keep working).
- **`hooks/useKeyboardShortcuts.ts`.** `Escape` now checks `focusMode` first — exiting
  takes priority over the existing deselect behaviour, since Sidebar/Inspector
  selection has nothing to show while focus mode's chrome-free layout is active anyway.
- **`layout/Toolbar.tsx`.** One combined `DropdownMenu` (a single `Focus`-icon button,
  disabled when there's no manuscript) with two items, "Distraction-free writing" and
  "Reading mode" — deliberately not two more toolbar buttons, given the crowding
  already flagged in `docs/SUGGESTIONS.md`'s Phase 67 entry.
- **`KeyboardShortcutsDialog.tsx`.** Updated the existing `Esc` row's label to mention
  both behaviours.

`tsc -b --force` clean. Not runtime-tested end-to-end (same sandbox blocker as every
phase since 55) — worth a live check that `zoom`/spread-view/thumbnail-rail state
genuinely restores untouched after exiting focus mode, since `hideThumbnails` is a
render-time override rather than a state mutation and should leave `uiStore
.showThumbnails` itself alone, but this is the kind of prop-plumbing that's easy to get
subtly wrong without seeing it run.

## Recommended next task
Per the settled build order (Phase F before D/B), Phase F's item list is now down to
one: the Continuity checker, extending the Virtual Editor's checker architecture over
Layer 0 data — the last major unbuilt AI-Workspace item, and probably the natural next
piece of work once it's reached. Also still open and worth folding in
opportunistically: manuscript search/find, real spellcheck, a thesaurus
(docs/ROADMAP.md Phase B/F, flagged 2026-08-01), and the bigger "insert AI-drafted
prose into the manuscript with a reviewable diff" feature flagged in Phase 68.
