# Modular Page System — Architecture Review & Implementation Plan

Status: **proposal, not yet implemented.** No code should be written against this plan
until it's confirmed. This document is the senior-architect review requested before
building Book Studio's page-template/plugin system, per `CLAUDE.md`'s "plan before
implementing."

## 1. What already exists

Book Studio's Version 1 (Phases 1–13, see `STATUS.md`) is a working, tested, deployed
app built around one core idea: **a manuscript is a flat, auto-flowing stream of
content, and pages are a computed output, not authored data.**

Concretely:

- **Content model** (`src/types/content.ts`): a `Manuscript` is `Chapter[]`. A `Chapter`
  is `{ id, title, order, blocks: ContentBlock[] }`. `ContentBlock` is a closed union of
  six types — `heading`, `paragraph`, `image`, `list`, `table`, `quote`. There is no
  concept of a "page" anywhere in this model.
- **Layout Engine** (`src/renderer/paginate.ts`): a pure function that greedily flows
  `Chapter[]` into `LaidOutPage[]` using real measured block heights
  (`HeightMeasurer.tsx`). Pages are `PageKind = 'toc' | 'chapter-start' | 'content' |
  'blank'` — four hardcoded kinds. Every page is *recomputed from scratch* whenever
  content, theme, or trim size changes (`BookRenderer.tsx`'s `measureKey`); nothing
  about a page is ever stored, reordered, or duplicated, because pages don't persist —
  only chapters and blocks do.
- **Theme** (`src/theme/presets.ts`): a `ResolvedBookTheme` is a small, flat bag of
  tokens (page colours, two fonts, typography settings, chapter-opener style). Five
  hardcoded presets. Themes style the *existing* four page kinds and six block types
  only.
- **Rendering** (`src/renderer/BookRenderer.tsx` → `LazySpread.tsx` → `Page.tsx` →
  `BlockContent.tsx`): a single component per block type, dispatched via a `switch` in
  `BlockContent.tsx`. Lazily mounted per spread for performance.
- **PDF Export** (`src/pdf/exportPdf.ts`): a second, independent `switch` over the same
  six block types plus the four page kinds, hand-drawing each one with `pdf-lib`
  primitives, mirroring the on-screen layout exactly (published via `exportStore` so PDF
  and screen can never drift).
- **Mutation surface** (`src/store/contentStore.ts`): four actions —
  `updateBlock`/`insertBlock`/`deleteBlock`/`renameChapter` — each bumping a
  `revisionByProject` counter. This is the *only* sanctioned way anything edits
  manuscript content, and it's deliberately narrow.

## 2. Strengths worth preserving

- **Strict layer separation is real, not aspirational.** Content, Theme, Layout Engine,
  Rendering and PDF Export genuinely don't reach into each other's data. This is why five
  theme switches and a dozen content edits have shipped this project without ever
  breaking a previous feature.
- **Deterministic, WYSIWYG-guaranteed rendering.** The PDF exporter consumes the exact
  laid-out pages the screen just rendered (`exportStore`), not a re-derivation. Any new
  page/content type must keep this guarantee or it silently breaks print quality.
- **A proven schema-evolution pattern.** Every optional field added this project
  (`widthPercent`, `widthMm`, `grayscale`, `align`, `altText`, ...) follows the same rule:
  add it as optional, default it in code, never migrate persisted data. This has let six
  schema changes ship with zero data-loss risk and zero migration code.
- **A proven delegation + independent-verification workflow.** Every milestone this
  project (Phases 9–13) was scoped narrowly, built by one agent against a precise brief,
  and independently re-verified (fresh install, build/lint/test) before being considered
  done. This scales to a large taxonomy of new page types if the work is batched
  correctly (see §7).
- **A real, passing test harness** (100 jsdom smoke tests today) that already covers
  content mutation, image sizing math, PDF display-width/alignment logic, and Virtual
  Editor scroll-targeting — a strong regression net for a refactor like this.

## 3. Weaknesses relative to the new objective

The new objective — "books built from reusable, reorderable, duplicatable Page
Components, addable via a plugin architecture" — exposes four real gaps:

1. **There is no first-class Page object.** Pages are ephemeral render output, not data.
   You cannot reorder, duplicate, or save a page as a template today, because nothing
   about a page is stored — only the chapters/blocks that produce it. This is the
   central gap the whole feature request is asking to close.
2. **No front/back matter concept exists at all**, beyond one hardcoded `toc` page kind.
   Cover, Title Page, Copyright, Dedication, Glossary, Index, ISBN Page, etc. have no
   home in the current model.
3. **The `ContentBlockType` union and its three parallel switches don't scale.** Adding
   one new block type today means editing `BlockContent.tsx`, `exportPdf.ts`, and
   `paginate.ts`'s `blockSpacing` by hand, in lockstep, correctly, every time. Thirty new
   content types this way is thirty opportunities for the two renderers to drift apart —
   exactly the WYSIWYG risk called out above. This directly blocks the "plugin
   architecture, new types without modifying existing logic" requirement.
4. **The theme model has no extension point for new types.** `ResolvedBookTheme` is a
   fixed, flat shape. A new page/block type has nowhere themed to plug into without
   hand-editing all five presets every time one is added.

## 4. What should stay unchanged

- `contentStore`'s existing actions, its revision-counter mechanism, and the
  chapter-flow pagination algorithm in `paginate.ts` — this is Book Studio's proven core
  and none of the new requirements require touching it.
- The on-screen/PDF WYSIWYG-via-`exportStore` approach.
- The per-layer Zustand store convention (one store per architectural layer, never
  cross-imported for mutation).
- The "optional field, default in code, never migrate" schema-evolution rule — the new
  Page/Structural-Page model should follow it exactly.
- The delegate-one-scoped-milestone-then-independently-verify workflow.

## 5. What should be refactored, and why

**A key framing decision drives everything below.** The taxonomy in the request mixes
two genuinely different kinds of "page":

- **Structural, book-scoped pages** (all of Front Matter, all of Back Matter: Cover,
  Half Title, Title Page, Copyright, Dedication, Foreword, Preface, Contents,
  Acknowledgements, ... Conclusion, Bibliography, Glossary, Index, Appendix, About the
  Author, ISBN Page, Barcode, Blank Page). These are genuinely independent,
  order-arbitrary, one-off units — exactly what "insert/duplicate/reorder/save as
  template" describes. They don't reflow.
- **Rich content components** (Pull Quote, Tip/Warning/Info Box, Case Study, Timeline,
  Gallery, Recipe, Species Profile, FAQ, Statistics, Checklist, ...). These are meant to
  sit *inside* a chapter's flowing narrative, sized to their content, reflowing across
  pages exactly like a paragraph or image does today.

Forcing the second group into "independent, page-granular objects" would mean
rebuilding the auto-flow pagination engine from scratch — throwing away Book Studio's
best-tested subsystem for something CLAUDE.md explicitly warns against ("never replace
working systems unnecessarily"). Modelling them as **new `ContentBlock` types that flow
through the existing, proven `paginate.ts`** gets the same visual result with a fraction
of the risk and work. Recommended refactors, in order of how foundational they are:

1. **Block/page type registry** (mechanical, not a rewrite). Replace the three hardcoded
   switches with a lookup: `registerBlockType(id, { render, drawPdf, defaultContent,
   icon, label, category })`. `BlockContent.tsx` and `exportPdf.ts` become thin dispatch
   loops over the registry; today's six types become the first six registry entries,
   moved verbatim (not rewritten) into their own modules. This single refactor is what
   makes "new types without modifying existing logic" actually true, and it's low-risk
   because it changes *where* code lives, not *what* it does — provable via the existing
   100 tests plus a handful of new "registry dispatch matches the old switch" tests.
2. **A new, additive `StructuralPage` concept**, separate from `Chapter`/`ContentBlock`:
   an ordered `StructuralPage[]` at the `Manuscript` level (front matter before chapters,
   back matter after), each `{ id, pageType, category, content, themeOverrides?,
   metadata?, assets?, printSettings?, exportSettings? }` matching the shape requested.
   Existing manuscripts default to an empty array — zero migration.
3. **A theme extension point**: `ResolvedBookTheme.pageStyles?: Record<string,
   PageTypeStyleTokens>`, optional, with sane per-type fallback defaults baked into the
   registry itself so a theme is never *required* to know about a type it doesn't
   style. Presets can add entries incrementally.
4. **A `forcePageBreakBefore` concept in `paginate.ts`** for the one genuinely page-level
   item in the "Content" list — Section Divider — and for "Chapter Opening" (which
   already exists as `chapter-start`). Small, additive change to the flow algorithm, not
   a rewrite of it.
5. **A `pageTemplateStore`** (mirrors `assetStore`'s persistence pattern) so any
   `StructuralPage`'s `content`+`pageType` can be saved and re-inserted elsewhere — "save
   as reusable template."

## 6. New components required

Following existing folder conventions:

- `src/blocks/registry.ts` + `src/blocks/types/*.ts` — the block/page-type registry and
  the six existing types migrated into it verbatim.
- `src/types/structuralPage.ts` — the new `StructuralPage` shape.
- `src/store/structuralPageStore.ts` — mirrors `contentStore`'s action/revision pattern
  (`insertPage`/`duplicatePage`/`deletePage`/`reorderPage`/`updatePage`).
- `src/store/pageTemplateStore.ts` — saved reusable page templates.
- `src/layout/BookStructurePanel.tsx` — a new "Structure" tab in `Sidebar.tsx` (next to
  the existing Chapters/Assets tabs), listing front matter → chapters → back matter as
  one reorderable list.
- `src/layout/structuralPage/*` — per-page-type Inspector editing panels, following the
  existing `TypographyPanel.tsx`/`ImagePanel.tsx` pattern.
- `src/layout/dragTypes.ts` gains a `PAGE_DRAG_MIME` constant alongside the existing
  `ASSET_DRAG_MIME`, reusing the exact drag-and-drop mechanics already shipped.

**Reused as-is, not rebuilt:** `dragStore.ts`'s drag-tracking pattern, `selectionStore`'s
`scrollRequest` mechanism (already extended to block-level granularity this session —
extending it to structural-page granularity is one more small variant, not new
infrastructure), the chapter-rename-in-place UI pattern, `ScrollArea`/`Tabs` primitives,
`exportStore`'s WYSIWYG publish mechanism, the whole PDF font/color/text-wrap toolkit in
`src/pdf/`.

## 7. Safest implementation order

Each milestone below leaves the app fully working, per `CLAUDE.md`'s iteration rule.

1. **Registry refactor only.** Zero user-visible change. Migrate the six existing block
   types into the registry; `BlockContent.tsx`/`exportPdf.ts` become dispatch loops.
   Verify byte-identical output against all 100 existing tests. This unlocks everything
   else and should ship alone first.
2. **`StructuralPage` data layer + minimal UI**, proven on 3–4 page types only (Cover,
   Title Page, Copyright, Blank Page) — insert/duplicate/delete/reorder, no rich
   per-type editors yet. Goal: prove the full pipe (create → reorder → render on-screen
   → render in PDF) end to end before scaling to ~35 types.
3. **Rendering + PDF export wiring** for structural pages — splice them around the
   existing chapter-flow output in `BookRenderer`/`exportPdf.ts`.
4. **Remaining front/back-matter types**, batched (5–8 per milestone) — mechanical once
   1–3 land, since each is "add a registry entry."
5. **New in-chapter content block types**, batched — generalize where sensible (e.g. one
   `CalloutBlock` with a `variant: 'tip' | 'warning' | 'info'` instead of three near-
   identical block types) to avoid taxonomy bloat.
6. **Page templates + theme `pageStyles` extension** — "save as reusable template,"
   drag-reorder polish, letting themes meaningfully differentiate the new types.
7. **Domain-heavy specialty types last** (Recipe, Species/Plant/Animal Profile,
   Worksheet, Tutorial, Maps/Infographic/Diagram) — these need real structured-data
   editors, not just a rendering template, so they're highest effort/lowest shared-
   infrastructure reuse and should come once the registry pattern is battle-tested.

## 8. Risks and mitigations

- **Scope creep across ~60 page types.** Mitigated by strict batching (§7) and the
  proven one-agent-one-scoped-milestone-plus-independent-verification workflow already
  used for Phases 9–13.
- **WYSIWYG drift** between screen and PDF for new types. Mitigated by making the
  registry require *both* a `render` and a `drawPdf` implementation before a type is
  considered shipped — same discipline just enforced for the image-editing milestone.
- **Breaking "never require re-import."** Not a risk: everything proposed here is new,
  optional, additive data (`StructuralPage[]` defaults to `[]`); `Manuscript.chapters`
  and `ContentBlock` are untouched.
- **Theme presets needing hand-editing for every new type.** Mitigated by
  `pageStyles`'s fallback-default design — themes opt in, never required to know about a
  type.
- **User data migration.** None required — this is the same "optional field, default in
  code" pattern already proven six times this project.

## 9. UX integration recommendation

One new "Structure" tab in the existing `Sidebar.tsx`, next to Chapters/Assets — not a
new screen. Rows are draggable using the exact same HTML5 DnD mechanics already shipped
for image placement. An "Add Page" affordance opens a picker grouped into the three
categories exactly as specified (Front Matter / Content / Back Matter). Clicking a
structural page selects and scrolls to it via the same `scrollRequest` signal just
extended to block-level granularity in Phase 13 — one more target variant, not new
plumbing. This keeps the editor exactly as simple as it is today; the only new surface
area is one tab and one "Add Page" picker.

## Recommended next step

Confirm this plan (or redirect it), then start with **Milestone 1 only** (the registry
refactor) — it's the lowest-risk, highest-leverage step and has no user-visible effect,
making it the safest possible first commit toward this feature.
