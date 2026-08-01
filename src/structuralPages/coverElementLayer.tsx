import { useEffect, useRef, useState } from 'react'
import { Trash2, ArrowUpToLine, ArrowDownToLine, Copy, ImagePlus } from 'lucide-react'

import type { CoverElement } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'
import { updateElement, bringToFront, sendToBack, removeElement, duplicateElement } from '@/structuralPages/coverElements'
import { COVER_ICON_COMPONENTS } from '@/structuralPages/coverIcons'
import { computeCoverImageScreenStyle } from '@/structuralPages/coverImageFit'
import { useAssetStore } from '@/store/assetStore'
import { cn } from '@/lib/utils'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Minimum element size, as a fraction of the trim box — keeps a resize
 * gesture from collapsing an element to nothing. */
const MIN_SIZE = 0.03

/** How close an element's own centre needs to get to the page's centre line
 * (as a fraction of the trim box) before a move-drag snaps onto it. */
const SNAP_THRESHOLD = 0.012

/** Arrow-key nudge step, as a fraction of the trim box — plain arrow for a
 * small precise move, Shift+arrow for a bigger one. */
const NUDGE_STEP = 0.004
const NUDGE_STEP_LARGE = 0.02

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'
type DragMode = 'move' | ResizeHandle

interface DragState {
  id: string
  mode: DragMode
  startFracX: number
  startFracY: number
  /** Updated on every pointer move — this, not `startFrac*`, is what makes
   * the drag live-preview instead of only jumping on release. */
  curFracX: number
  curFracY: number
  origin: { x: number; y: number; width: number; height: number }
}

type Rect = Pick<CoverElement, 'x' | 'y' | 'width' | 'height'>

/** Applies a drag/resize gesture's total fraction delta to an element's
 * original rect, producing the live (or final, at commit time) rect. Pure —
 * used identically by the render path and by `commitDrag`, so the two can
 * never disagree about where an element ends up. */
function applyDelta(mode: DragMode, origin: Rect, dx: number, dy: number): Rect {
  if (mode === 'move') {
    let x = clamp(origin.x + dx, 0, 1 - origin.width)
    let y = clamp(origin.y + dy, 0, 1 - origin.height)

    // Snap-to-centre: independently on each axis, if the element's own
    // centre lands within `SNAP_THRESHOLD` of the page's centre line, snap
    // it exactly onto that line rather than leaving the user to eyeball
    // pixel-perfect centring by hand. `CoverElementLayer`'s render path
    // detects the snap by comparing the resulting centre back to 0.5, so it
    // can show a guide line — see `isCentered` below.
    if (Math.abs(x + origin.width / 2 - 0.5) < SNAP_THRESHOLD) x = 0.5 - origin.width / 2
    if (Math.abs(y + origin.height / 2 - 0.5) < SNAP_THRESHOLD) y = 0.5 - origin.height / 2

    return { x, y, width: origin.width, height: origin.height }
  }

  let { x, y, width, height } = origin
  if (mode === 'se') {
    width = clamp(origin.width + dx, MIN_SIZE, 1 - origin.x)
    height = clamp(origin.height + dy, MIN_SIZE, 1 - origin.y)
  } else if (mode === 'sw') {
    width = clamp(origin.width - dx, MIN_SIZE, origin.x + origin.width)
    x = origin.x + origin.width - width
    height = clamp(origin.height + dy, MIN_SIZE, 1 - origin.y)
  } else if (mode === 'ne') {
    width = clamp(origin.width + dx, MIN_SIZE, 1 - origin.x)
    height = clamp(origin.height - dy, MIN_SIZE, origin.y + origin.height)
    y = origin.y + origin.height - height
  } else {
    width = clamp(origin.width - dx, MIN_SIZE, origin.x + origin.width)
    x = origin.x + origin.width - width
    height = clamp(origin.height - dy, MIN_SIZE, origin.y + origin.height)
    y = origin.y + origin.height - height
  }
  return { x, y, width, height }
}

interface CoverElementLayerProps {
  elements: CoverElement[] | undefined
  theme: ResolvedBookTheme
  /** Whether the parent Cover/Back Cover page itself is selected — every
   * interactive affordance (selection outline, resize handles, the
   * delete/layer toolbar) is gated on this, same as every other cover
   * control (`CoverNudgeHandle`, `CoverFocalPointPicker`, ...). Elements
   * still render when the page isn't selected — they're part of the
   * design, not a selected-only overlay. */
  pageSelected: boolean
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  /** Persists a full replacement `elements` array — the caller wires this
   * to `onCommit({ elements })`, which already goes through
   * `updatePageContentWithHistory`. One call per drag/resize gesture (on
   * release), matching `CoverNudgeHandle`'s existing one-entry-per-gesture
   * undo convention. */
  onCommitElements: (elements: CoverElement[]) => void
}

/**
 * Renders a Cover/Back Cover's free-form `elements` array (see
 * `docs/COVER_CANVAS_PLAN.md`) with drag-to-move and corner-drag-to-resize,
 * live-previewing locally during a gesture and committing exactly once on
 * pointer-up. Used identically by `cover.tsx` and `backCover.tsx`, sandwiched
 * between the background image/overlay (below) and the title/subtitle/author
 * text block (above) in the DOM.
 *
 * Text content itself is edited via the Inspector's Page panel (a plain text
 * input), not by double-clicking on canvas — a deliberate Milestone 1 scope
 * cut, since the whole element box is also this layer's drag target and the
 * two gestures (click-to-select-and-drag vs. double-click-to-edit-text)
 * would otherwise fight each other. On-canvas inline editing is a natural
 * follow-up once that's worth solving properly.
 *
 * Drag/resize math is done entirely in container-relative fractions via
 * `getBoundingClientRect()` at gesture start, not `pageBox.widthPx` pixel
 * math — the preview can be shown at any zoom level, and this is the same
 * zoom-agnostic approach `CoverFocalPointPicker` already uses.
 */
export function CoverElementLayer({ elements, theme, pageSelected, selectedElementId, onSelectElement, onCommitElements }: CoverElementLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  // Arrow-key nudge (Shift for a bigger step) plus Delete/Backspace to
  // remove the selected element — the toolbar trash icon was previously the
  // only way to delete, unlike duplicate/nudge which already had keyboard
  // affordances (Phase 59 brainstorm). Declared before the `!elements` early
  // return below (hooks must run unconditionally on every render); the
  // listener itself no-ops via its own early returns instead, same effect
  // without breaking hooks rules. One commit per keypress is deliberate, not
  // batched like a drag gesture — each nudge/delete is its own small,
  // discrete, individually-undoable action, matching Figma/Canva's
  // convention.
  useEffect(() => {
    if (!pageSelected || !selectedElementId) return
    // Reassigned to a local const so it stays narrowed to `string` inside
    // `handleKeyDown` below — a nested function closing over the original
    // `string | null` parameter isn't narrowed by the guard above.
    const id = selectedElementId

    const isNudgeKey = (key: string) => key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
    const isDeleteKey = (key: string) => key === 'Delete' || key === 'Backspace'

    function handleKeyDown(e: KeyboardEvent) {
      if (!isNudgeKey(e.key) && !isDeleteKey(e.key)) return
      const target = e.target as HTMLElement | null
      // Don't hijack these keys while the user is typing elsewhere (an
      // Inspector text field, a contenteditable block, a title input) —
      // only act when focus isn't inside a text-editing control. This
      // matters even more for Delete/Backspace than for arrows: those keys
      // are the ones actually used to edit text.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      const current = elements?.find((el) => el.id === id)
      if (!current) return

      if (isDeleteKey(e.key)) {
        e.preventDefault()
        onSelectElement(null)
        onCommitElements(removeElement(elements, id))
        return
      }

      e.preventDefault()
      const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0

      onCommitElements(
        updateElement(elements, id, {
          x: clamp(current.x + dx, 0, 1 - current.width),
          y: clamp(current.y + dy, 0, 1 - current.height),
        }),
      )
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pageSelected, selectedElementId, elements, onCommitElements, onSelectElement])

  if (!elements || elements.length === 0) return null

  function fracFromEvent(e: React.PointerEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  function startDrag(e: React.PointerEvent, id: string, mode: DragMode, origin: Rect) {
    if (!pageSelected) return
    e.stopPropagation()
    e.preventDefault()
    onSelectElement(id)
    const frac = fracFromEvent(e)
    setDrag({ id, mode, startFracX: frac.x, startFracY: frac.y, curFracX: frac.x, curFracY: frac.y, origin })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return
    const frac = fracFromEvent(e)
    setDrag((prev) => (prev ? { ...prev, curFracX: frac.x, curFracY: frac.y } : prev))
  }

  function commitDrag() {
    if (!drag) return
    const rect = applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY)
    onCommitElements(updateElement(elements, drag.id, rect))
    setDrag(null)
  }

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  // Drives the centre guide lines below — only meaningful mid-`move`-drag
  // (resize gestures don't recentre), and only lit up once `applyDelta` has
  // actually snapped that axis (compared back to an exact 0.5, safe because
  // `applyDelta` sets it to precisely `0.5 - width / 2`, not an
  // approximation).
  const draggingRect = drag && drag.mode === 'move' ? applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY) : null
  const snappedX = draggingRect ? Math.abs(draggingRect.x + draggingRect.width / 2 - 0.5) < 1e-9 : false
  const snappedY = draggingRect ? Math.abs(draggingRect.y + draggingRect.height / 2 - 0.5) < 1e-9 : false

  return (
    // `pointer-events-none` + `z-10` together are the fix for a real bug: once a
    // Cover has a background image, `CoverFocalPointPicker` (shared.tsx) renders
    // a full-page `absolute inset-0 z-[5]` click-catcher for setting the focal
    // point, with no pointer-events exclusion of its own — it painted above this
    // layer (whose container previously had no z-index at all) and intercepted
    // every click/drag on the whole cover, including directly on top of an
    // element, so elements became impossible to move once an image existed.
    // Making this container itself click-through (`pointer-events-none`, which
    // is inherited by default) and opting each element's own div back in with
    // `pointer-events-auto` — the same "click-through overlay, clickable
    // hotspots" pattern `CoverElementToolbar`'s button already uses — lets clicks
    // on empty cover area still reach the focal-point picker underneath, while
    // clicks that land on an actual element go to that element first, now that
    // `z-10` also puts it above the picker's `z-5` in paint order.
    <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-none" onPointerMove={handlePointerMove}>
      {sorted.map((el) => {
        const rect: Rect = drag?.id === el.id ? applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY) : el
        const isSelected = pageSelected && selectedElementId === el.id

        return (
          <div
            key={el.id}
            className={cn(
              'pointer-events-auto absolute',
              pageSelected && 'cursor-move',
              isSelected && 'outline outline-2 outline-[var(--color-accent)] outline-offset-2',
            )}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              zIndex: el.zIndex,
            }}
            onPointerDown={(e) => startDrag(e, el.id, 'move', { x: el.x, y: el.y, width: el.width, height: el.height })}
            onPointerUp={commitDrag}
            onClick={(e) => {
              if (!pageSelected) return
              e.stopPropagation()
              onSelectElement(el.id)
            }}
          >
            <ElementBody element={el} theme={theme} />

            {isSelected && (
              <>
                <ElementToolbar
                  onDelete={() => {
                    onSelectElement(null)
                    onCommitElements(removeElement(elements, el.id))
                  }}
                  onDuplicate={() => {
                    const result = duplicateElement(elements, el.id)
                    if (!result) return
                    onCommitElements(result.elements)
                    onSelectElement(result.newId)
                  }}
                  onBringToFront={() => onCommitElements(bringToFront(elements, el.id))}
                  onSendToBack={() => onCommitElements(sendToBack(elements, el.id))}
                />
                {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => (
                  <ResizeHandleDot
                    key={handle}
                    handle={handle}
                    onPointerDown={(e) => startDrag(e, el.id, handle, { x: el.x, y: el.y, width: el.width, height: el.height })}
                    onPointerUp={commitDrag}
                  />
                ))}
              </>
            )}
          </div>
        )
      })}

      {/* Centre guide lines — shown only while a move-drag is actively snapped
       * onto the page's horizontal/vertical centre, same visual language as
       * Figma/Canva's alignment guides. Purely visual (`pointer-events-none`,
       * inherited from the container anyway, stated explicitly for clarity). */}
      {snappedX && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-[var(--color-accent)]" />}
      {snappedY && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-px -translate-y-1/2 bg-[var(--color-accent)]" />}
    </div>
  )
}

/**
 * Renders one element's visual content, wrapped once in a `size-full` div
 * carrying `element.opacity` — declared on `BaseCoverElement` so every kind
 * gets a uniform whole-element opacity control (Phase 59 brainstorm:
 * rect/ellipse already had `fillOpacity`, which only fades the fill and
 * leaves a stroke fully opaque; icon/badge/image had no opacity control at
 * all). Applied here, once, at the outer wrapper — not on the parent
 * `<div>` in `CoverElementLayer`'s map, which also hosts the selection
 * outline/toolbar/resize handles that should stay fully visible regardless
 * of the element's own opacity.
 */
function ElementBody({ element, theme }: { element: CoverElement; theme: ResolvedBookTheme }) {
  return (
    <div className="size-full" style={{ opacity: element.opacity ?? 1 }}>
      <ElementBodyContent element={element} theme={theme} />
    </div>
  )
}

function ElementBodyContent({ element, theme }: { element: CoverElement; theme: ResolvedBookTheme }) {
  // Called unconditionally (hooks can't be conditional) — only read for the
  // 'image' kind below, same tradeoff every other kind-specific branch here
  // already accepts.
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)

  if (element.kind === 'text') {
    const fontFamily = resolveCoverFontFamily({ fontChoice: element.fontChoice }, theme.fonts.body)
    return (
      <div
        className="flex size-full items-center overflow-hidden"
        style={{ justifyContent: element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center' }}
      >
        <span
          style={{
            fontFamily,
            fontWeight: element.weight ?? 400,
            fontStyle: element.italic ? 'italic' : 'normal',
            fontSize: element.fontSize ?? 24,
            color: element.color ?? '#ffffff',
            textAlign: element.align ?? 'center',
          }}
        >
          {element.text || 'Text'}
        </span>
      </div>
    )
  }

  if (element.kind === 'line') {
    return (
      <div className="flex h-full w-full items-center">
        <div className="w-full" style={{ borderTop: `${element.strokeWidth ?? 1}px solid ${element.stroke ?? '#ffffff'}` }} />
      </div>
    )
  }

  if (element.kind === 'icon') {
    // `size-full` on the icon itself (not a wrapper) relies on SVG's default
    // `preserveAspectRatio="xMidYMid meet"` to keep the icon square and
    // centred even when the element's own box isn't — the same "square icon
    // inside a possibly non-square box" behaviour `drawCoverElementsPdf`
    // computes explicitly via `Math.min(wPt, hPt)` for the PDF.
    const Icon = COVER_ICON_COMPONENTS[element.iconId]
    return (
      <div className="flex size-full items-center justify-center">
        <Icon className="size-full" color={element.color ?? '#ffffff'} strokeWidth={element.strokeWidth ?? 2} />
      </div>
    )
  }

  if (element.kind === 'badge') {
    const fontFamily = resolveCoverFontFamily({ fontChoice: element.fontChoice }, theme.fonts.body)
    return (
      <div
        className="flex size-full items-center justify-center overflow-hidden text-center"
        style={{
          background: element.backgroundColor ?? '#dc2626',
          border: element.borderColor ? `${element.borderWidth ?? 1}px solid ${element.borderColor}` : undefined,
          borderRadius: element.shape === 'circle' ? '50%' : undefined,
        }}
      >
        <span
          className="px-[8%]"
          style={{ fontFamily, fontWeight: 600, fontSize: element.fontSize ?? 15, color: element.textColor ?? '#ffffff' }}
        >
          {element.text || 'NEW'}
        </span>
      </div>
    )
  }

  if (element.kind === 'image') {
    const url = element.imageAssetId ? getObjectUrl(element.imageAssetId) : undefined
    if (!url) {
      // Empty state prompts for content, same pattern as
      // `StructuralImageDropZone`'s "Drop an image here" — the actual file
      // picker lives in the Inspector panel (`CoverElementPanel`), not here,
      // matching this layer's existing convention that content edits go
      // through the Inspector while position/size are dragged on canvas
      // (see this file's top doc comment).
      return (
        <div className="flex size-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-button)] border border-dashed border-white/60 bg-black/45 p-1 text-center text-[10px] leading-tight text-white">
          <ImagePlus className="size-4 shrink-0" />
          <span>Select, then choose an image in the panel</span>
        </div>
      )
    }
    // Same focal-point + zoom CSS the main background image already uses
    // (`computeCoverImageScreenStyle`) — set via the Inspector's sliders
    // rather than an on-canvas click-to-set picker like the background
    // image's `CoverFocalPointPicker`, deliberately: this element's whole
    // box is already the drag-to-move/resize target, so a click-anywhere
    // focal-point gesture on the same area would recreate the exact
    // pointer-conflict bug Phase 57/59 just fixed for the background image.
    const { objectPosition, transform, transformOrigin } = computeCoverImageScreenStyle(element.imageFocalPoint, element.imageZoom)
    return (
      <div className="size-full overflow-hidden">
        <img src={url} alt="" className="size-full object-cover" style={{ objectPosition, transform, transformOrigin }} draggable={false} />
      </div>
    )
  }

  return (
    <div
      className="size-full"
      style={{
        background: element.fill,
        opacity: element.fill ? (element.fillOpacity ?? 1) : 1,
        border: element.stroke ? `${element.strokeWidth ?? 1}px solid ${element.stroke}` : undefined,
        borderRadius: element.kind === 'rect' ? (element.cornerRadius ?? 0) : element.kind === 'ellipse' ? '50%' : undefined,
      }}
    />
  )
}

function ElementToolbar({
  onDelete,
  onDuplicate,
  onBringToFront,
  onSendToBack,
}: {
  onDelete: () => void
  onDuplicate: () => void
  onBringToFront: () => void
  onSendToBack: () => void
}) {
  return (
    <div
      className="absolute -top-9 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-[var(--radius-button)] bg-black/70 p-1 shadow-[var(--shadow-sm)] backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" title="Send backward" onClick={onSendToBack} className="rounded-sm p-1 text-white hover:bg-white/20">
        <ArrowDownToLine className="size-3.5" />
      </button>
      <button type="button" title="Bring forward" onClick={onBringToFront} className="rounded-sm p-1 text-white hover:bg-white/20">
        <ArrowUpToLine className="size-3.5" />
      </button>
      <button type="button" title="Duplicate" onClick={onDuplicate} className="rounded-sm p-1 text-white hover:bg-white/20">
        <Copy className="size-3.5" />
      </button>
      <button type="button" title="Delete" onClick={onDelete} className="rounded-sm p-1 text-white hover:bg-danger/70">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

const HANDLE_POSITION: Record<ResizeHandle, string> = {
  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
}

function ResizeHandleDot({
  handle,
  onPointerDown,
  onPointerUp,
}: {
  handle: ResizeHandle
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  return (
    <div
      className={cn('absolute z-20 size-3 rounded-full border-2 border-white bg-[var(--color-accent)] shadow-[var(--shadow-sm)]', HANDLE_POSITION[handle])}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    />
  )
}
