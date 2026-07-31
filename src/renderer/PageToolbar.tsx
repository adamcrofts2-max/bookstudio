import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PageToolbarProps {
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Keeps the toolbar visible even when the pointer isn't hovering it —
   * used when this page is the current selection, mirroring
   * `BlockToolbar`'s `selected` prop. */
  selected: boolean
}

const iconButtonClass =
  'flex size-6 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30'

/**
 * Small floating action cluster shown at the top-right corner of a
 * hovered/selected structural page (Cover, Title Page, Copyright, Blank,
 * etc.): move up/down, duplicate, delete whole page.
 *
 * Structural-page delete/duplicate/move already existed in `Sidebar.tsx`'s
 * Structure tab (Phase 27 made those icons more discoverable), but that's a
 * different panel from the page you're actually looking at — real usage
 * feedback ("still no way to delete whole pages") kept coming in even after
 * that fix, because the delete action wasn't visible from the canvas at all.
 * This puts the same three actions directly on the page itself, matching
 * `BlockToolbar`'s "visual rather than settings-based" pattern (see
 * `CLAUDE.md`) instead of requiring a trip to the sidebar. The Sidebar
 * controls stay as-is — same underlying `*WithHistory` actions, just a
 * second, more discoverable entry point.
 *
 * Not rendered for `chapter-start`/`content` pages: those are computed
 * pagination output (whichever blocks happen to flow onto that page), not a
 * single stored object with an id to delete — `BlockToolbar`'s per-block
 * delete already covers "remove content from this page" for that case. See
 * docs/STATUS.md for the full reasoning.
 *
 * Uses a *named* Tailwind group (`group/page` / `group-hover/page:`), paired
 * with `Page.tsx`'s outer container carrying `group/page` — not the plain
 * unnamed `group`, which would also match `BlockToolbar`'s per-block
 * `group/block` wrapper nested inside it and reveal every block's toolbar
 * whenever the page itself was hovered. See `BlockToolbar.tsx`'s doc comment
 * for the bug this caused (caught by testing the deployed app, 2026-07-31).
 */
export function PageToolbar({ onDuplicate, onMoveUp, onMoveDown, onDelete, canMoveUp, canMoveDown, selected }: PageToolbarProps) {
  return (
    <div
      className={cn(
        'absolute -top-3 right-3 z-20 flex items-center gap-0.5 rounded-[var(--radius-button)] border border-border bg-background-secondary p-0.5 shadow-[var(--shadow-md)]',
        'opacity-0 transition-opacity duration-150 group-hover/page:opacity-100 group-focus-within/page:opacity-100',
        selected && 'opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button type="button" className={iconButtonClass} onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move page up" title="Move up">
        <ChevronUp className="size-3.5" />
      </button>
      <button type="button" className={iconButtonClass} onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move page down" title="Move down">
        <ChevronDown className="size-3.5" />
      </button>
      <button type="button" className={iconButtonClass} onClick={onDuplicate} aria-label="Duplicate page" title="Duplicate page">
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        className={cn(iconButtonClass, 'hover:text-danger')}
        onClick={onDelete}
        aria-label="Delete page"
        title="Delete page"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
