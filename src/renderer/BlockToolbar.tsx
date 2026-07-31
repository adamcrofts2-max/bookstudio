import { ChevronDown, ChevronUp, Copy, SeparatorHorizontal, Trash2 } from 'lucide-react'

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
  /**
   * Current state of `ContentBlock.breakAfter` (Phase 51) — whether
   * whatever comes after this block is forced onto a fresh page rather
   * than flowing up into remaining space. Optional so call sites that
   * don't (yet) support it — none currently — can omit the button
   * entirely rather than passing a no-op.
   */
  breakAfter?: boolean
  onToggleBreakAfter?: () => void
}

const iconButtonClass =
  'flex size-6 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30'

/**
 * Small floating action cluster shown at the top-right corner of a
 * hovered/selected block: move up/down, duplicate, delete. Every block type
 * gets this — previously only image blocks had any delete action at all
 * (`ImagePanel.tsx`'s "Delete image" button), see docs/ROADMAP.md Phase B.
 *
 * Always mounted but invisible (`opacity-0`) until the parent `.group/block`
 * wrapper is hovered/focused or `selected` is true — a pure CSS reveal, not
 * a conditional mount, so hovering feels instant. `Page.tsx` is the only
 * real rendering path that gives its block wrapper the `group/block` class;
 * `HeightMeasurer.tsx`'s off-screen pass never does, so this never affects
 * measured block height there.
 *
 * Uses a *named* Tailwind group (`group/block` / `group-hover/block:`) —
 * not the plain unnamed `group`/`group-hover:` — because `Page.tsx`'s outer
 * page container also carries a group class (for `PageToolbar`'s reveal).
 * Tailwind's unnamed `group-hover:` matches ANY hovered ancestor with class
 * `group`, not just the nearest one, so with two unnamed groups nested
 * (page container + this block wrapper) hovering anywhere on the page used
 * to reveal *every* block's toolbar at once instead of just the hovered
 * block's (caught by manually testing the deployed app, 2026-07-31 — see
 * docs/STATUS.md). Named groups scope the match to that specific name only.
 */
export function BlockToolbar({
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
  selected,
  breakAfter,
  onToggleBreakAfter,
}: BlockToolbarProps) {
  return (
    <div
      className={cn(
        'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-[var(--radius-button)] border border-border bg-background-secondary p-0.5 shadow-[var(--shadow-md)]',
        'opacity-0 transition-opacity duration-150 group-hover/block:opacity-100 group-focus-within/block:opacity-100',
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
      {onToggleBreakAfter && (
        <button
          type="button"
          className={cn(iconButtonClass, breakAfter && 'text-[var(--color-accent)] hover:text-[var(--color-accent)]')}
          onClick={onToggleBreakAfter}
          aria-label="Force a page break after this block"
          title={breakAfter ? 'Page break after: on — whatever follows always starts a new page' : 'Start a new page after this block'}
          aria-pressed={!!breakAfter}
        >
          <SeparatorHorizontal className="size-3.5" />
        </button>
      )}
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
