import { useRef, useState } from 'react'
import { Trash2, ArrowUpToLine, ArrowDownToLine } from 'lucide-react'

import type { CoverElement } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'
import { updateElement, bringToFront, sendToBack, removeElement } from '@/structuralPages/coverElements'
import { COVER_ICON_COMPONENTS } from '@/structuralPages/coverIcons'
import { cn } from '@/lib/utils'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Minimum element size, as a fraction of the trim box — keeps a resize
 * gesture from collapsing an element to nothing. */
const MIN_SIZE = 0.03

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
    return {
      x: clamp(origin.x + dx, 0, 1 - origin.width),
      y: clamp(origin.y + dy, 0, 1 - origin.height),
      width: origin.width,
      height: origin.height,
    }
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

  return (
    <div ref={containerRef} className="absolute inset-0" onPointerMove={handlePointerMove}>
      {sorted.map((el) => {
        const rect: Rect = drag?.id === el.id ? applyDelta(drag.mode, drag.origin, drag.curFracX - drag.startFracX, drag.curFracY - drag.startFracY) : el
        const isSelected = pageSelected && selectedElementId === el.id

        return (
          <div
            key={el.id}
            className={cn('absolute', pageSelected && 'cursor-move', isSelected && 'outline outline-2 outline-[var(--color-accent)] outline-offset-2')}
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
    </div>
  )
}

function ElementBody({ element, theme }: { element: CoverElement; theme: ResolvedBookTheme }) {
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

function ElementToolbar({ onDelete, onBringToFront, onSendToBack }: { onDelete: () => void; onBringToFront: () => void; onSendToBack: () => void }) {
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
