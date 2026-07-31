import { useState } from 'react'
import { ImagePlus } from 'lucide-react'

import { useEditableField } from '@/blocks/shared'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { cn } from '@/lib/utils'

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

interface StructuralImageDropZoneProps {
  hasImage: boolean
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
export function StructuralImageDropZone({ hasImage, onDropAsset, label = 'Drop an image here' }: StructuralImageDropZoneProps) {
  const [isOver, setIsOver] = useState(false)

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
      {(isOver || !hasImage) && (
        <div className="pointer-events-none flex items-center gap-2 rounded-[var(--radius-button)] border border-dashed border-white/60 bg-black/45 px-4 py-2 text-xs text-white">
          <ImagePlus className="size-3.5" />
          {label}
        </div>
      )}
    </div>
  )
}
