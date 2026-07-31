import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PageToolbarProps {
  /**
   * Move/duplicate are omitted entirely (not just disabled) when their
   * handler isn't provided — used for chapter-content/-start pages, which
   * only get a delete action (see this component's doc comment for why
   * move/duplicate don't make sense there). `canMoveUp`/`canMoveDown` only
   * matter when `onMoveUp`/`onMoveDown` are provided.
   */
  onDuplicate?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  /** Overrides the delete button's label/tooltip — content pages delete
   * "this page's content" (the blocks currently flowed onto it), not a
   * single stored page object, so the wording needs to say that. Defaults
   * to the structural-page wording. */
  deleteLabel?: string
  /** Keeps the toolbar visible even when the pointer isn't hovering it —
   * used when this page is the current selection, mirroring
   * `BlockToolbar`'s `selected` prop. */
  selected: boolean
}

const iconButtonClass =
  'flex size-6 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30'

/**
 * Small floating action cluster shown at the top-right corner of a
 * hovered/selected page.
 *
 * Two usages:
 *   1. Structural pages (Cover, Title Page, Copyright, Blank, etc.): full
 *      move up/down, duplicate, delete. Duplicate-existed-elsewhere history:
 *      `Sidebar.tsx`'s Structure tab already had these (Phase 27 made those
 *      icons more discoverable), but that's a different panel from the page
 *      you're actually looking at — real usage feedback ("still no way to
 *      delete whole pages") kept coming in even after that fix, because the
 *      delete action wasn't visible from the canvas at all. This puts the
 *      same actions directly on the page itself, matching `BlockToolbar`'s
 *      "visual rather than settings-based" pattern (`CLAUDE.md`). The
 *      Sidebar controls stay as-is — same underlying `*WithHistory` actions,
 *      just a second, more discoverable entry point.
 *   2. Chapter-content/-start pages: delete only (`onMoveUp`/`onMoveDown`/
 *      `onDuplicate` omitted). These pages are computed pagination output —
 *      whichever blocks happen to flow onto them — not a single stored
 *      object, so "move"/"duplicate a page" have no well-defined meaning;
 *      but "delete this page" does: bulk-delete the blocks currently on it
 *      (`deletePageBlocksWithHistory`). Added after a user reported they
 *      could delete structural pages but not imported/content ones — see
 *      docs/STATUS.md.
 *
 * Uses a *named* Tailwind group (`group/page` / `group-hover/page:`), paired
 * with `Page.tsx`'s outer container carrying `group/page` — not the plain
 * unnamed `group`, which would also match `BlockToolbar`'s per-block
 * `group/block` wrapper nested inside it and reveal every block's toolbar
 * whenever the page itself was hovered. See `BlockToolbar.tsx`'s doc comment
 * for the bug this caused (caught by testing the deployed app, 2026-07-31).
 */
export function PageToolbar({ onDuplicate, onMoveUp, onMoveDown, onDelete, canMoveUp, canMoveDown, deleteLabel, selected }: PageToolbarProps) {
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
      {onMoveUp && (
        <button type="button" className={iconButtonClass} onClick={onMoveUp} disabled={!canMoveUp} aria-label="Move page up" title="Move up">
          <ChevronUp className="size-3.5" />
        </button>
      )}
      {onMoveDown && (
        <button type="button" className={iconButtonClass} onClick={onMoveDown} disabled={!canMoveDown} aria-label="Move page down" title="Move down">
          <ChevronDown className="size-3.5" />
        </button>
      )}
      {onDuplicate && (
        <button type="button" className={iconButtonClass} onClick={onDuplicate} aria-label="Duplicate page" title="Duplicate page">
          <Copy className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className={cn(iconButtonClass, 'hover:text-danger')}
        onClick={onDelete}
        aria-label={deleteLabel ?? 'Delete page'}
        title={deleteLabel ?? 'Delete page'}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
