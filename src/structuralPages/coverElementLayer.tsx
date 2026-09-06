import { useEffect, useRef, useState } from 'react'
import { Trash2, ArrowUpToLine, ArrowDownToLine, Copy, ImagePlus, RotateCw } from 'lucide-react'

import type { CoverElement } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { PageBox } from '@/renderer/pageGeometry'
import { PX_PER_MM } from '@/renderer/pageGeometry'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'
import { updateElement, bringToFront, sendToBack, removeElement, duplicateElement } from '@/structuralPages/coverElements'
import { COVER_ICON_COMPONENTS } from '@/structuralPages/coverIcons'
import { computeCoverImageScreenStyle } from '@/structuralPages/coverImageFit'
import { COVER_SAFE_ZONE_MM } from '@/structuralPages/shared'
import { useAssetStore } from '@/store/assetStore'
import { cn } from '@/lib/utils'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Minimum element size, as a fraction of the trim box — keeps a resize
 * gesture from collapsing an element to nothing. */
const MIN_SIZE = 0.03

/** How close one of a dragged element's own edges/centre needs to get to a
 * snap target (the page centre, the safe-zone inset, or another element's
 * own edge/centre) — as a fraction of the trim box — before a move-drag
 * snaps onto it. Originally page-centre-only; generalised in Phase 61 to
 * the full set of "smart guide" targets `snapTargetsFor` builds. */
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

/** Live state for a rotate-handle drag — kept separate from `DragState`
 * rather than folded into `applyDelta`'s move/resize modes, since rotation
 * doesn't touch x/y/width/height at all and works off pointer *angle*
 * around the element's centre, not a fraction delta. */
interface RotateState {
  id: string
  /** Element centre in viewport pixels, captured once at gesture start —
   * rotation never moves the element, so this stays valid for the whole
   * gesture without re-measuring on every pointer move. */
  centerX: number
  centerY: number
  /** Pointer angle (degrees, `atan2`) at gesture start. */
  startPointerAngle: number
  /** The element's committed rotation when the gesture started. */
  startRotation: number
  /** Live preview value, updated on every pointer move. */
  liveRotation: number
}

/** Keeps a rotation value inside `(-180, 180]` — matters because the drag
 * gesture accumulates `startRotation + (pointerAngle delta)` across the
 * whole drag, which would otherwise grow unboundedly across multiple full
 * turns instead of wrapping like a real angle. */
function normalizeRotation(deg: number): number {
  let r = deg % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r
}

/** Every fraction-space position a move-drag can snap onto, on one axis —
 * built once per gesture (`snapTargetsFor`), not recomputed per pointer
 * move. Includes the page centre, the safe-zone guide's inset boundary on
 * each side, and every OTHER element's own edges/centre — the "smart
 * guides" Figma/Canva show while dragging one object near another. */
interface SnapTargets {
  x: number[]
  y: number[]
}

/** Builds this gesture's snap targets once: the dragged element's own
 * position obviously isn't a target for itself, so `excludeId` filters it
 * out of `elements`. `safeZoneFracX`/`safeZoneFracY` are the safe-zone
 * guide's inset converted from `COVER_SAFE_ZONE_MM` to a fraction of the
 * trim box — see `computeSafeZoneFraction` below for why the bleed cancels
 * out of that conversion. */
function snapTargetsFor(elements: CoverElement[], excludeId: string, safeZoneFracX: number, safeZoneFracY: number): SnapTargets {
  const x = [0.5, safeZoneFracX, 1 - safeZoneFracX]
  const y = [0.5, safeZoneFracY, 1 - safeZoneFracY]
  for (const el of elements) {
    if (el.id === excludeId) continue
    x.push(el.x, el.x + el.width / 2, el.x + el.width)
    y.push(el.y, el.y + el.height / 2, el.y + el.height)
  }
  return { x, y }
}

/** The safe-zone guide's inset (`CoverSafeZoneGuide`'s `insetPx = bleedPx +
 * COVER_SAFE_ZONE_MM * PX_PER_MM`, measured from the bleed-box edge)
 * re-expressed as a fraction of the TRIM box — the coordinate space every
 * `CoverElement.x/y` already lives in. The trim edge itself sits `bleedPx`
 * from the bleed-box edge, so subtracting it back out cancels the bleed
 * term entirely: the safe-zone's distance from the TRIM edge is just
 * `COVER_SAFE_ZONE_MM * PX_PER_MM`, independent of bleed size. */
function safeZoneFraction(trimSizePx: number): number {
  return (COVER_SAFE_ZONE_MM * PX_PER_MM) / trimSizePx
}

/** Tries snapping one axis of a move-drag: checks the dragged element's own
 * leading edge, centre, and trailing edge against every candidate target,
 * and applies whichever match is closest if any is within
 * `SNAP_THRESHOLD`. Returns the (possibly adjusted) position and, when a
 * snap fired, the exact fraction-space coordinate to draw a guide line at —
 * distinct from the old page-centre-only version, which only ever needed to
 * check back against a hardcoded `0.5`. */
function snapAxis(pos: number, size: number, targets: number[]): { pos: number; guide?: number } {
  let best: { delta: number; target: number } | undefined
  for (const point of [pos, pos + size / 2, pos + size]) {
    for (const target of targets) {
      const delta = target - point
      if (Math.abs(delta) < SNAP_THRESHOLD && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, target }
      }
    }
  }
  return best ? { pos: pos + best.delta, guide: best.target } : { pos }
}

/** Applies a drag/resize gesture's total fraction delta to an element's
 * original rect, producing the live (or final, at commit time) rect. Pure —
 * used identically by the render path and by `commitDrag`, so the two can
 * never disagree about where an element ends up. `snapTargets` is only
 * consulted for `mode === 'move'`; resize handles don't snap (Milestone 1
 * scope, unchanged). */
function applyDelta(mode: DragMode, origin: Rect, dx: number, dy: number, snapTargets: SnapTargets): Rect & { guideX?: number; guideY?: number } {
  if (mode === 'move') {
    const x = clamp(origin.x + dx, 0, 1 - origin.width)
    const y = clamp(origin.y + dy, 0, 1 - origin.height)

    const xSnap = snapAxis(x, origin.width, snapTargets.x)
    const ySnap = snapAxis(y, origin.height, snapTargets.y)

    return { x: xSnap.pos, y: ySnap.pos, width: origin.width, height: origin.height, guideX: xSnap.guide, guideY: ySnap.guide }
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
  /** Trim/bleed dimensions in px — used only to convert the safe-zone
   * guide's `COVER_SAFE_ZONE_MM` inset into a trim-box fraction for smart
   * snapping (`safeZoneFraction`), the same conversion `CoverSafeZoneGuide`
   * already does for drawing the guide itself. */
  pageBox: PageBox
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
 * Text content of a 'text'/'badge' element can also be edited directly by
 * double-clicking it on canvas (Phase 61), alongside the pre-existing
 * Inspector text field — the two gestures don't actually fight each other
 * the way Milestone 1's doc comment worried they might: a real `dblclick`
 * only fires after two non-moving clicks, so it's naturally distinct from a
 * drag, and once editing starts the wrapper's own drag-start is disabled for
 * that element (see the `onPointerDown` guard below) so a click inside the
 * input just places the caret. See `EditingTextField`.
 *
 * Drag/resize math is done entirely in container-relative fractions via
 * `getBoundingClientRect()` at gesture start, not `pageBox.widthPx` pixel
 * math — the preview can be shown at any zoom level, and this is the same
 * zoom-agnostic approach `CoverFocalPointPicker` already uses.
 */
export function CoverElementLayer({ elements, theme, pageBox, pageSelected, selectedElementId, onSelectElement, onCommitElements }: CoverElementLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [rotateDrag, setRotateDrag] = useState<RotateState | null>(null)
  // On-canvas double-click text editing (Phase 61) — the Milestone 1 scope
  // cut this closes (see this file's top doc comment): editing was
  // Inspector-only because the whole element box already doubles as the
  // drag target, so click-to-select-and-drag and double-click-to-edit would
  // fight over the same gesture. Resolved the same way `DraggableCoverField`
  // resolves an analogous conflict elsewhere in the cover canvas: a real
  // browser `dblclick` only fires after two clicks that don't move the
  // pointer, so it's naturally distinct from a drag — no threshold needed
  // here, just `commitDrag`'s no-op-move guard (above) so a double-click's
  // two clicks don't themselves spam undo history before `dblclick` fires.
  // Only 'text'/'badge' kinds have inline text to edit at all.
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

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

  // Computed once per render, reused by every `applyDelta` call below —
  // cheap even for a few dozen elements, and keeps `applyDelta` itself pure
  // (no need to thread `elements`/`pageBox` through it directly). Excludes
  // whichever element is currently being dragged (if any) from its own
  // snap targets; harmless to compute even when nothing is being dragged.
  const snapTargets = snapTargetsFor(elements, drag?.id ?? '', safeZoneFraction(pageBox.widthPx), safeZoneFraction(pageBox.heightPx))

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

  /** Element centre in viewport pixels, from its current fractional rect —
   * the same container-relative-fraction-to-pixel conversion `fracFromEvent`
   * does in reverse, so the rotate handle stays correct at any zoom level. */
  function centerClient(rect: Rect): { x: number; y: number } {
    const containerRect = containerRef.current!.getBoundingClientRect()
    return {
      x: containerRect.left + (rect.x + rect.width / 2) * containerRect.width,
      y: containerRect.top + (rect.y + rect.height / 2) * containerRect.height,
    }
  }

  function startRotate(e: React.PointerEvent, id: string, origin: Rect, currentRotation: number) {
    if (!pageSelected) return
    e.stopPropagation()
    e.preventDefault()
    onSelectElement(id)
    const center = centerClient(origin)
    const startPointerAngle = (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI
    setRotateDrag({ id, centerX: center.x, centerY: center.y, startPointerAngle, startRotation: currentRotation, liveRotation: currentRotation })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (drag) {
      const frac = fracFromEvent(e)
      setDrag((prev) => (prev ? { ...prev, curFracX: frac.x, curFracY: frac.y } : prev))
    }
    if (rotateDrag) {
      const angle = (Math.atan2(e.clientY - rotateDrag.centerY, e.clientX - rotateDrag.centerX) * 180) / Math.PI
      let next = rotateDrag.startRotation + (angle - rotateDrag.startPointerAngle)
      // Shift snaps to 15° increments — same "hold a modifier for precision
      // snapping" convention Figma/Canva use for rotation specifically.
      if (e.shiftKey) next = Math.round(next / 15) * 15
      setRotateDrag((prev) => (prev ? { ...prev, liveRotation: next } : prev))
    }
  }

  function commitDrag() {
    if (!drag) return
    const rect = applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY, snapTargets)
    // Skip the commit entirely when nothing actually moved — every plain
    // click on an element goes through this same pointerdown-then-pointerup
    // path (`startDrag` unconditionally begins a 'move' drag on
    // pointerdown), so without this guard a simple click-to-select was
    // silently writing a no-op "move" into undo history on every click.
    // Caught while adding double-click-to-edit below, where the same gap
    // would otherwise double up (two no-op commits before the browser's
    // `dblclick` fires).
    const changed = rect.x !== drag.origin.x || rect.y !== drag.origin.y || rect.width !== drag.origin.width || rect.height !== drag.origin.height
    if (changed) onCommitElements(updateElement(elements, drag.id, rect))
    setDrag(null)
  }

  function commitRotate() {
    if (!rotateDrag) return
    // Same no-op guard as `commitDrag` — a plain click on the rotate handle
    // (no actual drag) shouldn't write a history entry either.
    if (rotateDrag.liveRotation !== rotateDrag.startRotation) {
      onCommitElements(updateElement(elements, rotateDrag.id, { rotation: normalizeRotation(rotateDrag.liveRotation) }))
    }
    setRotateDrag(null)
  }

  function startEditing(el: CoverElement) {
    if (el.kind !== 'text' && el.kind !== 'badge') return
    onSelectElement(el.id)
    setEditingElementId(el.id)
    setEditingText(el.text)
  }

  function commitEditing() {
    if (!editingElementId) return
    const id = editingElementId
    setEditingElementId(null)
    const current = elements?.find((e) => e.id === id)
    // Only 'text'/'badge' ever start editing (`startEditing` guards on
    // kind), so `current` is always one of those two here — but `.text`
    // isn't on `BaseCoverElement`, so this still needs its own narrowing
    // check for `updateElement`'s generic `Partial<CoverElement>` patch.
    if (current && (current.kind === 'text' || current.kind === 'badge') && current.text !== editingText) {
      onCommitElements(updateElement(elements, id, { text: editingText }))
    }
  }

  /** Escape discards in-progress edits — exits without ever calling
   * `onCommitElements`, unlike blur/Enter which save. */
  function cancelEditing() {
    setEditingElementId(null)
  }

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  // Drives the guide lines below — only meaningful mid-`move`-drag (resize
  // gestures don't snap). `guideX`/`guideY` are the exact fraction-space
  // coordinate a snap fired at (page centre, safe-zone edge, or another
  // element's own edge/centre) — `undefined` when that axis isn't currently
  // snapped, same "only lit up while actually snapped" behaviour the
  // page-centre-only version had, just generalised to any target instead of
  // a single hardcoded `0.5`.
  const draggingRect = drag && drag.mode === 'move' ? applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY, snapTargets) : null
  const guideX = draggingRect?.guideX
  const guideY = draggingRect?.guideY

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
        const rect: Rect = drag?.id === el.id ? applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY, snapTargets) : el
        const isSelected = pageSelected && selectedElementId === el.id
        const displayRotation = rotateDrag?.id === el.id ? rotateDrag.liveRotation : (el.rotation ?? 0)

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
              // Pivots on the box's own centre (CSS's default
              // `transform-origin`) — matches the PDF export's rotation
              // pivot exactly (`drawCoverElementsPdf`'s
              // `translate(centre) -> rotate -> translate(-centre)`), so
              // rotating an off-centre element looks identical on screen
              // and in the exported PDF. Resize handles/toolbar are
              // children of this div, so they rotate along with it — the
              // same behaviour Figma/Canva use for a selected rotated
              // object's own handles.
              transform: displayRotation !== 0 ? `rotate(${displayRotation}deg)` : undefined,
            }}
            onPointerDown={(e) => {
              // While this element is being edited, let pointer-down inside
              // it behave like a normal text field (place the caret, drag to
              // select) instead of starting a move drag — the input itself
              // is what's rendered below, so this only matters for clicks
              // that land on it.
              if (editingElementId === el.id) return
              startDrag(e, el.id, 'move', { x: el.x, y: el.y, width: el.width, height: el.height })
            }}
            onPointerUp={commitDrag}
            onClick={(e) => {
              if (!pageSelected) return
              e.stopPropagation()
              onSelectElement(el.id)
            }}
            onDoubleClick={(e) => {
              if (!pageSelected) return
              e.stopPropagation()
              startEditing(el)
            }}
          >
            {editingElementId === el.id && (el.kind === 'text' || el.kind === 'badge') ? (
              <EditingTextField element={el} theme={theme} value={editingText} onChange={setEditingText} onCommit={commitEditing} onCancel={cancelEditing} />
            ) : (
              <ElementBody element={el} theme={theme} />
            )}

            {isSelected && !editingElementId && (
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
                <RotateHandleDot
                  onPointerDown={(e) => startRotate(e, el.id, { x: el.x, y: el.y, width: el.width, height: el.height }, el.rotation ?? 0)}
                  onPointerUp={commitRotate}
                />
              </>
            )}
          </div>
        )
      })}

      {/* Smart guide lines — shown only while a move-drag is actively
       * snapped onto a target (the page centre, the safe-zone inset, or
       * another element's own edge/centre), positioned at whichever exact
       * fraction-space coordinate `guideX`/`guideY` fired on, not always
       * the page's middle any more. Same Figma/Canva alignment-guide visual
       * language as before. Purely visual (`pointer-events-none`, inherited
       * from the container anyway, stated explicitly for clarity). */}
      {guideX !== undefined && (
        <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--color-accent)]" style={{ left: `${guideX * 100}%` }} />
      )}
      {guideY !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 z-20 h-px bg-[var(--color-accent)]" style={{ top: `${guideY * 100}%` }} />
      )}
    </div>
  )
}

/**
 * On-canvas inline text editor for a 'text'/'badge' element, swapped in for
 * `ElementBody` while that element is being edited (Phase 61 — closes the
 * Milestone 1 scope cut documented at this file's top). Styled to match
 * `ElementBodyContent`'s own font/size/colour/align for that kind as
 * closely as an `<input>` can, so entering/leaving edit mode doesn't cause
 * a jarring visual swap.
 *
 * Blur or Enter saves (`onCommit`, reading the latest `value` at that
 * moment); Escape discards (`onCancel`). The `cancelledRef` flag exists
 * because Escape's `onCancel` unmounts this input (the parent's
 * `editingElementId` becomes `null`), and React may still fire a blur
 * event through that unmount — without the flag, that blur would call
 * `onCommit` right after `onCancel` already decided to discard, silently
 * saving the very edit the user just pressed Escape to reject.
 */
function EditingTextField({
  element,
  theme,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  element: Extract<CoverElement, { kind: 'text' | 'badge' }>
  theme: ResolvedBookTheme
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const cancelledRef = useRef(false)
  const fontFamily = resolveCoverFontFamily({ fontChoice: element.fontChoice }, theme.fonts.body)
  const isBadge = element.kind === 'badge'

  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus -- entering edit mode
      // via double-click is itself the explicit user action that should
      // move focus here; there's no other reasonable place for it to go.
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (cancelledRef.current) return
        onCommit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelledRef.current = true
          onCancel()
        }
      }}
      // Edit mode intentionally disables the wrapper's drag-to-move (see
      // the `onPointerDown` guard in the caller) so a click here just
      // places the caret like a normal text field, but `stopPropagation`
      // is kept too as a second line of defence — cheap insurance against
      // any future change to that guard silently reintroducing the
      // pointer-conflict class of bug Phase 57/59 already fixed twice.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="size-full border-none bg-transparent text-center outline-none"
      style={{
        fontFamily,
        fontWeight: isBadge ? 600 : (element.weight ?? 400),
        fontStyle: !isBadge && element.italic ? 'italic' : 'normal',
        fontSize: isBadge ? (element.fontSize ?? 15) : (element.fontSize ?? 24),
        color: isBadge ? (element.textColor ?? '#ffffff') : (element.color ?? '#ffffff'),
        textAlign: isBadge ? 'center' : (element.align ?? 'center'),
      }}
    />
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

/**
 * Rotate handle — a small round grip above the element's top-centre,
 * further out than `ElementToolbar` (`-top-9`) so the two don't collide.
 * Rotates with the element (it's a child of the same wrapper `div` that
 * gets the `rotate()` transform), same as the resize handles — after a 90°
 * rotation this handle now sits to the side rather than above, matching
 * Figma/Canva's own behaviour for a rotated selection's handles. Hold
 * Shift while dragging to snap to 15° increments (`CoverElementLayer`'s
 * `handlePointerMove`).
 */
function RotateHandleDot({
  onPointerDown,
  onPointerUp,
}: {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}) {
  return (
    <div
      // audit-copy-ok: cover element handles only render on a selected,
      // non-decorative page, and mobile's page preview is always decorative
      title="Drag to rotate — hold Shift to snap to 15°"
      className="absolute -top-16 left-1/2 z-20 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-[var(--color-accent)] shadow-[var(--shadow-sm)] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <RotateCw className="size-3 text-white" />
    </div>
  )
}
