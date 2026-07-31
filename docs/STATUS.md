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
