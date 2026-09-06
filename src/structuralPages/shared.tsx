import { useRef, useState } from 'react'
import { GripVertical, ImagePlus, Crosshair, Eye, EyeOff, RotateCcw } from 'lucide-react'

import { useEditableField } from '@/blocks/shared'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { COVER_NUDGE_RANGE_PX } from '@/structuralPages/coverLayout'
import { useImageUpload } from '@/hooks/useImageUpload'
import { PX_PER_MM, type PageBox } from '@/renderer/pageGeometry'
import type { CoverImageFocalPoint, CoverFieldPosition } from '@/types/structuralPage'
import { cn } from '@/lib/utils'
import { canDragOnThisDevice } from '@/lib/pointer'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface EditableTextProps {
  value: string
  placeholder: string
  onCommit: (value: string) => void
  as?: 'h1' | 'p' | 'span'
  className?: string
  style?: React.CSSProperties
}

/**
 * Single-line inline-editable text for structural pages (Cover/Title Page's
 * title/subtitle/author, Half Title's title, ISBN Page's fields, etc.) —
 * reuses `src/blocks/shared.tsx`'s `useEditableField` hook (the same one
 * every content block's inline text uses), just generalized to any tag/
 * style rather than block-specific markup. See `ListItemField`/
 * `TableCellField` in that file for the identical one-component-per-field
 * pattern this mirrors.
 *
 * Deliberately single-line only (Enter commits, per `useEditableField`) —
 * structural pages' longer, multi-paragraph `text` fields (Copyright,
 * Dedication, Foreword, Preface, Acknowledgements, Conclusion, Appendix,
 * About the Author) are NOT wired through this component and stay editable
 * only via the Inspector's "Page" panel `Textarea` (`StructuralPagePanel.tsx`)
 * — seeing "Separate paragraphs with a blank line" is the panel's own
 * placeholder convention, and `useEditableField`'s Enter-commits behaviour
 * would fight that. See docs/ROADMAP.md Phase B for this scope decision.
 *
 * Always editable when mounted — unlike `ContentBlock`'s `editable` prop
 * (opt-in because `HeightMeasurer.tsx` renders blocks off-screen too),
 * structural pages have no separate off-screen measurement pass: `Page.tsx`
 * is the only place that ever renders one, and it always has a real
 * `onCommit` to hand over.
 */
export function EditableText({ value, placeholder, onCommit, as: Tag = 'p', className, style }: EditableTextProps) {
  const field = useEditableField({ mode: 'text', initialValue: value, onCommit })

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onClick={(e) => {
        if (field.isEditing) e.stopPropagation()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        field.startEditing()
      }}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn(
        className,
        'cursor-text rounded-sm outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150 hover:outline-[var(--color-border)]',
        field.isEditing && 'outline outline-[var(--color-warning)]! hover:outline-[var(--color-warning)]',
      )}
      style={style}
    >
      {!field.isEditing ? value || placeholder : null}
    </Tag>
  )
}

interface FieldVisibilityToggleProps {
  hidden: boolean
  label: string
  onToggle: () => void
}

/**
 * Small eye/eye-off pill that hides or shows one Cover/Back Cover text
 * field for a photo-only look — Phase 49. Only ever rendered while the
 * page is selected (same gating as `CoverNudgeHandle`); hiding a field
 * never clears its text, only whether it's drawn on screen/PDF (see
 * `coverVisibility.ts`).
 */
export function FieldVisibilityToggle({ hidden, label, onToggle }: FieldVisibilityToggleProps) {
  return (
    <button
      type="button"
      aria-label={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()} (use just the photo)`}
      title={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()} — use just the photo`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white shadow-[var(--shadow-sm)] backdrop-blur-sm transition-colors hover:bg-black/65"
    >
      {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
    </button>
  )
}

interface HideableTextFieldProps extends EditableTextProps {
  hidden: boolean
  /** Whether the parent page is currently selected — an unselected,
   * hidden field renders nothing at all (matching the real exported
   * look exactly); selected shows it dimmed plus the toggle, so hiding a
   * field is never a silent, unrecoverable-looking action. */
  selected: boolean
  onToggleHidden: () => void
  /** Human label for the toggle button's tooltip, e.g. "Subtitle". */
  fieldLabel: string
}

/**
 * `EditableText` plus a per-field show/hide toggle (Phase 49) — used for
 * Cover's title/subtitle/author. Deliberately a thin wrapper rather than
 * baking visibility into `EditableText` itself: most of this component's
 * callers (every other structural-page field) have no concept of
 * per-field visibility at all.
 */
export function HideableTextField({ hidden, selected, onToggleHidden, fieldLabel, style, ...editableProps }: HideableTextFieldProps) {
  if (hidden && !selected) return null

  return (
    <div className="flex items-center justify-center gap-2">
      {selected && <FieldVisibilityToggle hidden={hidden} label={fieldLabel} onToggle={onToggleHidden} />}
      <EditableText {...editableProps} style={hidden ? { ...style, opacity: 0.45, fontStyle: 'italic' } : style} />
    </div>
  )
}

interface DraggableCoverFieldProps {
  /** Committed independent position, or `undefined` while this field is
   * still part of the shared flex block (`coverLayout.ts`'s `layout` +
   * nudge). */
  position: CoverFieldPosition | undefined
  /** Called continuously while actively dragging, `null` when a drag ends —
   * the caller uses this for a local live-preview position, same
   * live/commit split every other cover drag control uses. */
  onLiveMove: (position: CoverFieldPosition | null) => void
  onCommitMove: (position: CoverFieldPosition) => void
  /** The page's own root element — its bounding box is the 0..1 fraction
   * space, same reference frame `CoverElementLayer` measures against. */
  containerRef: React.RefObject<HTMLDivElement | null>
  pageSelected: boolean
  children: React.ReactNode
}

/** Minimum on-screen movement, in real px, before a pointer-down is treated
 * as a drag rather than a plain click — without this, every ordinary click
 * (selecting the page, double-clicking to start editing, tapping the
 * visibility toggle) would "detach" the field into free-position mode with
 * zero actual movement. */
const DRAG_THRESHOLD_PX = 3

/**
 * Makes one Cover text field (title/subtitle/author) directly draggable to
 * any point on the page, Canva-style — the free-form counterpart to the
 * whole-block `CoverNudgeHandle`. While `position` is `undefined` the field
 * renders in the normal flex flow exactly as before; the *first* drag reads
 * the field's own live `getBoundingClientRect()` as its starting point (so
 * it doesn't jump the instant a drag begins) and, only past
 * `DRAG_THRESHOLD_PX` of real movement, commits a `CoverFieldPosition` that
 * switches it to absolute positioning from then on. See
 * `types/structuralPage.ts`'s `CoverFieldPosition` doc comment for the
 * reset path back to shared-layout mode.
 */
export function DraggableCoverField({ position, onLiveMove, onCommitMove, containerRef, pageSelected, children }: DraggableCoverFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startRef = useRef({ clientX: 0, clientY: 0, x: 0, y: 0 })

  function originFraction(): { x: number; y: number } {
    if (position) return position
    const containerRect = containerRef.current!.getBoundingClientRect()
    const fieldRect = fieldRef.current!.getBoundingClientRect()
    return {
      x: (fieldRect.left + fieldRect.width / 2 - containerRect.left) / containerRect.width,
      y: (fieldRect.top + fieldRect.height / 2 - containerRect.top) / containerRect.height,
    }
  }

  function deltaFraction(clientX: number, clientY: number): { x: number; y: number } {
    const containerRect = containerRef.current!.getBoundingClientRect()
    return { x: (clientX - startRef.current.clientX) / containerRect.width, y: (clientY - startRef.current.clientY) / containerRect.height }
  }

  return (
    <div
      ref={fieldRef}
      className={cn('pointer-events-auto', pageSelected && 'cursor-move')}
      style={
        position
          ? { position: 'absolute', left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: 'translate(-50%, -50%)' }
          : undefined
      }
      onPointerDown={(e) => {
        if (!pageSelected) return
        const origin = originFraction()
        draggingRef.current = true
        movedRef.current = false
        startRef.current = { clientX: e.clientX, clientY: e.clientY, x: origin.x, y: origin.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return
        const dPx = { x: e.clientX - startRef.current.clientX, y: e.clientY - startRef.current.clientY }
        if (!movedRef.current) {
          if (Math.hypot(dPx.x, dPx.y) < DRAG_THRESHOLD_PX) return
          movedRef.current = true
          e.stopPropagation()
        }
        const d = deltaFraction(e.clientX, e.clientY)
        onLiveMove({ x: clamp(startRef.current.x + d.x, 0, 1), y: clamp(startRef.current.y + d.y, 0, 1) })
      }}
      onPointerUp={(e) => {
        if (!draggingRef.current) return
        draggingRef.current = false
        if (!movedRef.current) return // plain click/double-click — untouched, no position committed
        const d = deltaFraction(e.clientX, e.clientY)
        onLiveMove(null)
        onCommitMove({ x: clamp(startRef.current.x + d.x, 0, 1), y: clamp(startRef.current.y + d.y, 0, 1) })
      }}
    >
      {children}
    </div>
  )
}

/** Small reset pill shown next to a free-positioned field (once selected)
 * to rejoin the shared flex layout — the only way back once a field has
 * been dragged, since `DraggableCoverField` itself has no undo affordance
 * of its own beyond the app's normal undo/redo. */
export function ResetFieldPositionButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      title="Reset to the default layout position"
      aria-label="Reset to the default layout position"
      onClick={(e) => {
        e.stopPropagation()
        onReset()
      }}
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white shadow-[var(--shadow-sm)] backdrop-blur-sm transition-colors hover:bg-black/65"
    >
      <RotateCcw className="size-3.5" />
    </button>
  )
}

interface StructuralImageDropZoneProps {
  onDropAsset: (assetId: string) => void
  label?: string
}

/**
 * Full-page drag-and-drop target that sets (or replaces) a structural
 * page's background/portrait image — Cover, Back Cover, and About the
 * Author all have an `imageAssetId` field, but until now there was no UI
 * anywhere to actually set it (the Inspector panel only ever said a picker
 * "is planned for a future milestone"). Reuses the exact same
 * `ASSET_DRAG_MIME` drag source as `Page.tsx`'s `ImageDropZone` — dragging a
 * thumbnail from the Sidebar's Assets tab works identically here.
 *
 * Rendered as a DOM sibling placed *before* a page's text content (so plain
 * default stacking order puts the text on top and still clickable/
 * double-clickable), covering the full page so dropping anywhere on empty
 * background space works — not gated behind "only when no image is set yet"
 * so it doubles as a replace affordance too.
 */
export function StructuralImageDropZone({ onDropAsset, label = 'Drop an image here' }: StructuralImageDropZoneProps) {
  const [isOver, setIsOver] = useState(false)
  // There is no drag source on a touch device — no Assets sidebar to drag
  // from — and this label is `pointer-events-none`, so on a phone it was an
  // instruction the user physically could not follow, sitting across the
  // cover in Preview ("Drop a cover image here"). The working path there is
  // the Add cover image control in the page editor (Phase 137), so say
  // nothing here rather than something impossible.
  const canDrag = canDragOnThisDevice()

  return (
    <div
      className={cn('absolute inset-0 flex items-center justify-center transition-colors', isOver && 'bg-black/30')}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME)
        if (assetId) onDropAsset(assetId)
      }}
    >
      {/* Shown only while a drag is actually over the page. It used to
       * render whenever the cover had no image yet, which meant a dark
       * "Drop a cover image here" pill sat permanently in the dead centre
       * of the cover — directly across the title and subtitle, so a brand
       * new book's own cover was unreadable in its own editor (seen in the
       * running app, Phase 157). Dropping works whether or not the pill is
       * there, and the discoverable path for someone who'd never think to
       * drag is the "Add cover image" button on the page and in the
       * Inspector (Phase 46), so as instruction it was redundant and as
       * decoration it was destructive. As drag feedback it earns its
       * place. */}
      {canDrag && isOver && (
        <div className="pointer-events-none flex items-center gap-2 rounded-[var(--radius-button)] border border-dashed border-white/60 bg-black/45 px-4 py-2 text-xs text-white">
          <ImagePlus className="size-3.5" />
          {label}
        </div>
      )}
    </div>
  )
}

interface CoverNudgeHandleProps {
  /** Currently-committed vertical nudge value, -1..1. */
  value: number
  /** Called continuously while dragging, for a live preview transform — the
   * caller should NOT persist this (would spam undo history with one entry
   * per pointer-move tick). */
  onLiveChange: (value: number) => void
  /** Called exactly once, on pointer release, with the final value — the
   * caller persists this via `onCommit`/`updatePageContentWithHistory`, so
   * one drag gesture is one undo step. */
  onCommitFinal: (value: number) => void
  /** Optional horizontal companion — when provided, one drag gesture moves
   * both axes at once (a real 2D reposition of the text block), mirroring
   * `value`/`onLiveChange`/`onCommitFinal` exactly but for
   * `CoverPage.content.horizontalNudge`. Omitted by Back Cover's blurb
   * block, which has no horizontal-offset concept — its call site keeps the
   * pre-existing vertical-only behaviour untouched. */
  horizontal?: {
    value: number
    onLiveChange: (value: number) => void
    onCommitFinal: (value: number) => void
  }
}

/**
 * Small drag handle for fine-tuning a Cover/Back Cover text block's position
 * within its chosen layout preset (`coverLayout.ts`) — vertical-only unless
 * `horizontal` is passed, in which case it drags both axes together.
 * Deliberately still a single handle moving the whole text block as one
 * group, not a full per-field draggable multi-element canvas — see
 * `docs/STATUS.md` Phase 45 for that reasoning (still holds: Front Cover's
 * title/subtitle/author converting into independent `CoverElement`s is a
 * bigger, separate decision, discussed but not taken as of Phase 57). Only
 * rendered while the page is selected, matching this app's existing
 * hover/selection-gated affordance pattern (see `ThemeGallery.tsx`'s
 * edit/delete icons).
 */
export function CoverNudgeHandle({ value, onLiveChange, onCommitFinal, horizontal }: CoverNudgeHandleProps) {
  const draggingRef = useRef(false)
  const startRef = useRef({ y: 0, value: 0, x: 0, hValue: 0 })

  function nextValueY(clientY: number) {
    const deltaPx = clientY - startRef.current.y
    return clamp(startRef.current.value + deltaPx / COVER_NUDGE_RANGE_PX, -1, 1)
  }
  function nextValueX(clientX: number) {
    const deltaPx = clientX - startRef.current.x
    return clamp(startRef.current.hValue + deltaPx / COVER_NUDGE_RANGE_PX, -1, 1)
  }

  return (
    <button
      type="button"
      aria-label={horizontal ? 'Drag to reposition this text block' : "Drag up or down to fine-tune this text block's vertical position"}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
        draggingRef.current = true
        startRef.current = { y: e.clientY, value, x: e.clientX, hValue: horizontal?.value ?? 0 }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return
        onLiveChange(nextValueY(e.clientY))
        horizontal?.onLiveChange(nextValueX(e.clientX))
      }}
      onPointerUp={(e) => {
        if (!draggingRef.current) return
        draggingRef.current = false
        onCommitFinal(nextValueY(e.clientY))
        horizontal?.onCommitFinal(nextValueX(e.clientX))
      }}
      className={cn(
        'mx-auto flex w-fit items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] tracking-wide text-white shadow-[var(--shadow-sm)] backdrop-blur-sm',
        horizontal ? 'cursor-move' : 'cursor-ns-resize',
      )}
    >
      <GripVertical className="size-3" />
      {/* audit-copy-ok: only on a selected, non-decorative page; and the
          handle is pointer-event driven, so dragging does work on touch */}
      Drag to reposition
    </button>
  )
}

interface CoverImageUploadButtonProps {
  projectId: string
  onUploaded: (assetId: string) => void
  label: string
  className?: string
}

/**
 * Click-to-browse alternative to `StructuralImageDropZone`'s drag-and-drop —
 * a first-time user has no reason to know dragging a thumbnail from the
 * Assets sidebar tab is even possible. Built on the shared `useImageUpload`
 * hook (Phase 51) — the same "pick a file, import it as a real asset" flow
 * the block inserter's Image option and placeholder-to-real-image
 * conversion also use. See `docs/STATUS.md` Phase 46.
 */
export function CoverImageUploadButton({ projectId, onUploaded, label, className }: CoverImageUploadButtonProps) {
  const { openPicker, error, inputProps } = useImageUpload(projectId, onUploaded)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openPicker()
        }}
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-[var(--radius-button)] border border-dashed border-white/60 bg-black/45 px-4 py-2 text-xs text-white transition-colors hover:bg-black/60',
          className,
        )}
      >
        <ImagePlus className="size-3.5" />
        {label}
      </button>
      {/* A picked file that can't be decoded used to do nothing at all. The
          message sits under the button in both places this renders — over the
          cover canvas on desktop, and in the mobile page editor. */}
      {error && (
        <p className="pointer-events-none mt-1.5 max-w-[220px] rounded-[var(--radius-button)] border border-border bg-panel px-2 py-1 text-center text-[11px] text-danger">
          {error}
        </p>
      )}
      <input {...inputProps} />
    </>
  )
}

interface CoverFocalPointPickerProps {
  focalPoint: CoverImageFocalPoint | undefined
  onChange: (point: CoverImageFocalPoint) => void
}

/**
 * Click-anywhere-on-the-image control for setting a Cover/Back Cover's
 * image focal point (`coverImageFit.ts`) — the crosshair marks the current
 * point, clicking elsewhere moves it. Only rendered while selected and an
 * image is set, sitting above the image but below the text block in
 * stacking order (siblings render in the order the caller places them).
 */
export function CoverFocalPointPicker({ focalPoint, onChange }: CoverFocalPointPickerProps) {
  const x = focalPoint?.x ?? 0.5
  const y = focalPoint?.y ?? 0.5

  return (
    <div
      className="absolute inset-0 z-[5] cursor-crosshair"
      title="Click to set the photo's focal point"
      onClick={(e) => {
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect()
        const nx = clamp((e.clientX - rect.left) / rect.width, 0, 1)
        const ny = clamp((e.clientY - rect.top) / rect.height, 0, 1)
        onChange({ x: nx, y: ny })
      }}
    >
      <div
        className="pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/30 text-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.6)]"
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      >
        <Crosshair className="size-3.5" />
      </div>
    </div>
  )
}

/** Amazon KDP's published minimum distance text should stay from the trim
 * edge on a cover (0.25in) — a first-time author has no reason to already
 * know this, and there's no other guide anywhere in the app showing it.
 * Exported so `coverElementLayer.tsx` can snap element drags to this same
 * boundary (Phase 61), not just draw it. */
export const COVER_SAFE_ZONE_MM = 6.35

/**
 * Toggleable dashed guide showing the safe text zone on a Cover/Back Cover
 * preview — purely visual, on-screen only, never exported (an exported PDF
 * has no "current UI state" to draw a guide into, and a guide baked into
 * the artwork would be a real defect, not a helpful reminder).
 */
export function CoverSafeZoneGuide({ pageBox }: { pageBox: PageBox }) {
  const insetPx = pageBox.bleedPx + COVER_SAFE_ZONE_MM * PX_PER_MM
  return (
    <div className="pointer-events-none absolute z-[6] border border-dashed border-white/70" style={{ inset: insetPx }}>
      <span className="absolute -top-5 left-0 rounded-sm bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white">
        Safe zone
      </span>
    </div>
  )
}
