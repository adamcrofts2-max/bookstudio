# Cover Canvas — Free-form Drag-and-Drop Elements

Status: **Milestone 1 in progress.** Additive to the existing Cover/Back Cover designer
(`docs/STATUS.md` Phases 45–50) — nothing below changes an existing field's behaviour or
requires migrating an existing project.

## Why

The Cover/Back Cover designer today is deliberately *parametric*: `CoverPage.content` is a
flat set of typed, optional fields (title/subtitle/author, layout anchor + nudge, image
focal point/zoom, overlay, per-field typography and colour). Every field defaults safely,
which is exactly why it's been reliable across six phases of extension — but it's a fixed
set of slots, not a Canva-style canvas a user can drop arbitrary shapes/text/icons onto.
Requested directly: "the front and back cover should have truly drag and drop elements
like canva, such as rectangles."

## Approach: additive layer, not a replacement

`CoverPage`/`BackCoverPage` keep every existing field exactly as-is. A new optional
`elements?: CoverElement[]` array sits on top as an independent, freely-positioned layer.
An existing project's `elements` is simply absent/empty — renders identically to today. A
user only opts in by actually adding a shape or text box. This mirrors the same
purely-additive convention `structuralPage.ts`'s top doc comment already establishes for
the whole structural-page system.

## Data model

```ts
export type CoverElementKind = 'rect' | 'ellipse' | 'line' | 'text'

interface BaseCoverElement {
  id: string
  kind: CoverElementKind
  // Normalized 0..1 fractions of the TRIM box (not the bleed box) — same
  // convention as CoverPage.content.verticalNudge, so an element stays in
  // the same proportional place across trim-size changes and is trivially
  // portable between the screen coordinate space and the PDF's point space.
  x: number
  y: number
  width: number
  height: number
  // Paint order among elements only — always above the background image/
  // overlay, always below the title/subtitle/author text block, matching
  // the existing DOM order in cover.tsx/backCover.tsx.
  zIndex: number
}

export interface CoverShapeElement extends BaseCoverElement {
  kind: 'rect' | 'ellipse' | 'line'
  fill?: string          // hex; absent = transparent
  fillOpacity?: number   // 0..1; absent = 1
  stroke?: string        // hex; absent = none
  strokeWidth?: number   // px, same physical convention as theme.typography.bodySize
  cornerRadius?: number  // rect only; px
}

export interface CoverTextElement extends BaseCoverElement {
  kind: 'text'
  text: string
  color?: string
  fontChoice?: CoverFontChoice   // reuses the existing cover font list
  weight?: number
  italic?: boolean
  fontSize?: number       // px, same convention as bodySize — NOT normalized
  align?: 'left' | 'center' | 'right'
}

export type CoverElement = CoverShapeElement | CoverTextElement
```

No `rotation` field in Milestone 1. Every existing structural-page type is only considered
shipped once its on-screen render and PDF `drawPdf` visually match exactly
(`structuralPages/registry.ts`'s `StructuralPageTypeDefinition` doc comment) — since
Milestone 1 ships no rotate handle, adding a `rotation` field that only *some* renderers
honoured would be exactly the WYSIWYG-drift risk that rule exists to prevent. Add it in a
later milestone alongside a real rotate handle, once both renderers can support it
together.

## Rendering

Both `x`/`y`/`width`/`height` (normalized) and `fontSize`/`strokeWidth` (real px, identical
convention to every other size in this codebase) convert to screen pixels via
`pageBox.widthPx`/`heightPx` and to PDF points via the existing `PX_TO_PT` + `bleedPt`
offset every structural page's `drawPdf` already uses. One shared pair of functions —
`structuralPages/coverElements.ts` (pure data helpers + `drawCoverElementsPdf`) and
`structuralPages/coverElementLayer.tsx` (the interactive on-screen layer) — is used
identically by `cover.tsx` and `backCover.tsx`, so front and back cover get the feature at
once with no duplicated logic. EPUB export needs no change: a cover's EPUB representation
is already a single flattened raster image, produced from the same DOM the screen renders.

## Interaction (Milestone 1 scope)

- Select an element by clicking it (only live while the parent Cover/Back Cover page
  itself is selected — same gating every existing cover control already uses).
- Drag to move, drag a corner handle to resize — both live-preview locally and commit
  exactly once on pointer-up, the identical pattern `CoverNudgeHandle` already established
  (one undo step per gesture, not one per pointer-move tick).
- Add via a small toolbar (Rectangle / Ellipse / Line / Text) shown while the page is
  selected.
- Delete, plus "bring to front" / "send to back" — both on a small floating toolbar above
  the selected element, and duplicated in the Inspector's Page panel.
- Text content is edited via the Inspector's Page panel (a plain text input), not by
  double-clicking on canvas. The whole element box doubles as this layer's drag target, so
  click-to-select-and-drag and double-click-to-edit-text would fight each other on the same
  surface; on-canvas inline editing is a natural follow-up once that's worth solving
  properly, not a Milestone 1 goal.

Deliberately deferred past Milestone 1 (tracked in `docs/ROADMAP.md` Phase E): rotation,
icons/badges (the pre-existing "cover accessories" item), secondary images, smart
alignment/snap guides, grouping, and the wrap-aware front+spine+back view.

## Undo/redo

No new history-store wiring needed. Every element mutation is expressed as a full
`elements` array replacement passed through the existing `onCommit` →
`updatePageContentWithHistory` path, which already snapshots and restores whole `content`
objects generically. `structuralPages/coverElements.ts`'s helpers (`addElement`,
`updateElement`, `removeElement`, `reorderElement`) are pure functions over the array —
the interactive layer computes the next array and hands it to `onCommit({ elements })`.

## Migration safety

Purely additive optional field — no `structuralPageStore` migration code, matching every
prior schema addition in this file (`imageFocalPoint`, `overlayStyle`, `typography`,
`hiddenFields`, ...).
