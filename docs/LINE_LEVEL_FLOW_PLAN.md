# Line-level text flow — design, cost, and why it isn't a phase

**Status: designed, not built. Written 2026-09-06 (Phase 163).**

Pagination is block-level: a paragraph moves to the next page whole rather
than splitting mid-way. `docs/STATUS.md` has carried this under "Known
simplifications" since Version 1, described as "the natural next step if
tighter page-fill is wanted".

This document exists because that next step is a project, not a phase, and
the difference matters enough to write down before anyone starts.

## What it would buy — measured, not assumed

`scripts/e2e/pdfFidelity.e2e.mjs` now reports it on every run, per page:

```
INFO — plain:       block-level flow leaves 19% of a full page unused
INFO — every block: block-level flow leaves 9%, 29%, 6%, 7% (mean 13%)
```

Between **6% and 29% of a full page**, mean 13–19%. On a 300-page novel that
is roughly 40 pages of paper — real money at print-on-demand rates, and the
visible difference between a book that looks typeset and one that looks
laid out by a word processor.

So the feature is worth wanting. That is not the question.

## What it would cost

Four problems, in rising order of difficulty. The first two are ordinary
work. The third and fourth are why this is not a phase.

### 1. Per-line measurement (ordinary)

`HeightMeasurer` measures whole blocks with
`getBoundingClientRect().height`. Splitting needs the offset of every line
box within a block, which the DOM will give up via `Range.getClientRects()`
— the same call `pdfFidelity.e2e.mjs` already uses to read line positions.
Output shape: `lineTops: Record<blockId, number[]>` alongside the existing
`heights`.

### 2. A model for a partial block (ordinary)

`LaidOutPage.blocks` becomes a list of slices — `{ block, fromLine, toLine }`
— and `paginate`'s flow loop gains a "how many lines fit in the space left"
branch, plus widow/orphan rules that block-level flow never needed (never
strand one line at the foot of a page or carry one line alone to the top).

`exportPdf` is the easy consumer: `drawWrappedLines` already draws a list of
wrapped lines, so it draws a subrange instead of all of them.

### 3. Rendering a slice on screen, while it stays editable (hard)

This is the real problem. The canvas is not a preview — it is the editor. A
sliced paragraph has to be rendered across two pages *and remain a single
editable field*, and every mechanism the editor depends on assumes one
block is one element on one page:

- **`contenteditable`.** A clip-window rendering (`overflow: hidden` plus a
  negative offset) shows the right lines, but the browser scrolls the
  nearest scroll container to reveal the caret, which silently desyncs the
  offset the moment someone types near the boundary.
- **`data-block-id` would appear twice.** Scroll-to-block, the Virtual
  Editor's Locate/Edit, the block toolbar, note and idea anchors, and
  `pdfFidelity.e2e.mjs` all resolve a block by that attribute.
- **Live spellcheck** (`useLiveSpellcheck`) rewrites the block's innerHTML to
  paint underlines, and maps caret offsets through that rewrite. It would
  now have to do so across two DOM subtrees.
- **Every keystroke changes the split.** Typing re-wraps the paragraph,
  which changes which line the page boundary falls on, which repaginates,
  which remounts the spread — the exact sequence behind the Phase 139
  caret-loss bug, now firing on every character typed near a page break.

### 4. Two independent wrappers have to agree, line for line (hard)

The screen wraps text with the browser; the PDF wraps it with
`src/pdf/textWrap.ts`. Phase 159–162 established that they currently agree —
the fidelity suite matches every line on a page to within half a pixel — but
today a disagreement costs *spacing*. After a split it costs *content*: if
the browser fits 21 lines where `wrapRuns` fits 22, the line at the boundary
is dropped or printed twice.

That is the asymmetry that decides the schedule. Block-level flow fails
gracefully — a paragraph moves whole, and the worst case is white space.
Line-level flow fails loudly, in a printed book, on the one page nobody
proofreads because it looked fine on screen.

## The path, if it is taken

Four milestones, each shippable and verifiable on its own:

1. **Per-line measurement**, published alongside `blockHeights`, with a
   fidelity assertion that the browser's line count per block equals
   `wrapRuns`'s. This is worth doing on its own merits: it turns "the two
   wrappers agree" from an observation about whole pages into an enforced
   per-block invariant, and it is the prerequisite for everything else.
2. **Split in the read-only paths first** — PDF, reading mode, thumbnails —
   behind a project setting, so the typography can be judged in a real book
   before the editor is touched. The editable canvas keeps block-level flow,
   and the setting is explicitly a preview of unfinished work.
3. **The editable canvas**, which is the whole of problem 3 and needs its
   own design: most likely one editable element that spans the boundary
   visually rather than two clipped halves, which probably means the page
   break becomes a rendering concern rather than a DOM boundary.
4. **Widow and orphan control**, which only becomes possible once splitting
   exists, and which `docs/BOOK_LAYOUT_RULES.md` will want.

Milestone 1 is a phase. Milestone 2 is a phase. Milestone 3 is not — it is
a rewrite of how the canvas relates to pages, and it should not begin until
1 and 2 have been living in the app long enough to trust the wrapping
invariant.

## Recommendation

Don't start this to "finish the layout engine". Start it when tighter
page-fill is worth a rewrite of the editing canvas — and start with
milestone 1, which pays for itself as verification whether or not the rest
ever gets built.
