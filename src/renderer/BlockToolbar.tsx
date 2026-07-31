import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface BlockToolbarProps {
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Keeps the toolbar visible even when the pointer isn't hovering it —
   * used when the block is the current selection, so it doesn't disappear
   * the instant the mouse moves away from a just-clicked block. */
  selected: boolean
}

const iconButtonClass =
  'flex size-6 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30'

/**
 * Small floating action cluster shown at the top-right corner of a
 * hovered/selected block: move up/down, duplicate, delete. Every block type
 * gets this — previously only image blocks had any delete action at all
 * (`ImagePanel.tsx`'s "Delete image" button), see docs/ROADMAP.md Phase B.
 *
 * Always mounted but invisible (`opacity-0`) until the parent `.group`
 * wrapper is hovered/focused or `selected` is true — a pure CSS reveal, not
 * a conditional mount, so hovering feels instant. `Page.tsx` is the only
 * real rendering path that gives its block wrapper the `group` class;
 * `HeightMeasurer.tsx`'s off-screen pass never does, so this never affects
 * measured block height there.
 */
export function BlockToolbar({ onDuplicate, onMoveUp, onMoveDown, onDelete, canMoveUp, canMoveDown, selected }: BlockToolbarProps) {
  return (
    <div
      className={cn(
        'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-[var(--radius-button)] border border-border bg-background-secondary p-0.5 shadow-[var(--shadow-md)]',
        'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
        selected && 'opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button type="button" className={iconButtonClass} onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move block up" title="Move up">
        <ChevronUp className="size-3.5" />
      </button>
      <button type="button" className={iconButtonClass} onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move block down" title="Move down">
        <ChevronDown className="size-3.5" />
      </button>
      <button type="button" className={iconButtonClass} onClick={onDuplicate} aria-label="Duplicate block" title="Duplicate">
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        className={cn(iconButtonClass, 'hover:text-danger')}
        onClick={onDelete}
        aria-label="Delete block"
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
