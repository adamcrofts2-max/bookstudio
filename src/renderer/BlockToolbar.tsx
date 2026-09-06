import { useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface BlockToolbarProps {
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  /** Keeps the handle visible even when the pointer isn't hovering it —
   * used when the block is the current selection, so it doesn't disappear
   * the instant the mouse moves away from a just-clicked block. */
  selected: boolean
  /**
   * Where there's room for the handle. `'margin'` parks it in the page's
   * own side margin, clear of every line of text; `'inside'` is the
   * fallback for a project whose margins are too narrow to hold it (see
   * `Page.tsx`'s `BLOCK_OVERLAY_SIDE_BUFFER_PX`), where it tucks into the
   * block's top-right corner instead.
   */
  placement?: 'margin' | 'inside'
  /**
   * Current state of `ContentBlock.breakAfter` (Phase 51) — whether
   * whatever comes after this block is forced onto a fresh page rather
   * than flowing up into remaining space. Optional so call sites that
   * don't (yet) support it — none currently — can omit the item
   * entirely rather than passing a no-op.
   */
  breakAfter?: boolean
  onToggleBreakAfter?: () => void
  /**
   * Extra content stacked under the handle, in the same margin column —
   * currently `IdeaIndicatorBadge` (Phase 88). Not a general-purpose slot
   * for its own sake: after three attempts at giving indicator badges their
   * own independently-positioned corner (Phases 84-87), each one either
   * collided with a neighbouring block or with the page's own boundary,
   * because "always visible, absolutely positioned over the text column" is
   * inherently fragile for content stacked as tightly as manuscript
   * paragraphs. Ideas linked to a block also remain visible without
   * hovering via the Inspector's Notes tab (`NotesPanel.tsx`'s
   * `IdeasLinkedHere`).
   */
  children?: ReactNode
}

/**
 * Per-block actions — move up/down, duplicate, page break, delete — reached
 * from a single small handle that lives in the page's margin beside the
 * block, revealed on hover.
 *
 * Phase 156 moved it there. Until then this was a horizontal icon bar at
 * `-top-3 right-2`: 12px above the block's own top edge, ~28px tall, so
 * roughly half of it sat squarely on the block's first line and hid the
 * words underneath — confirmed by screenshotting the running app, where
 * "and the hours kept" was unreadable while its own paragraph was hovered.
 * That's a bad trade for an editor whose whole job is showing you your
 * text. Three placements are possible for block furniture and only one is
 * safe: over the block's own text (what this was), over the *previous*
 * block's text (what `bottom-full` would be, since manuscript paragraphs
 * are packed edge-to-edge with no gap), or out in the margin, which is
 * empty by construction and is where books have always kept marginalia.
 * A full icon bar can't fit a 16mm margin, but a 24px handle can — so the
 * bar became a labelled menu, matching what `MobileWriteView` already
 * settled on for the same reason ("so it never covers text/images
 * regardless of block type"). The menu itself renders in a Radix portal,
 * so unlike the old bar it can never be clipped by the page's content box.
 *
 * Always mounted but invisible (`opacity-0`) until the parent `.group/block`
 * wrapper is hovered/focused, `selected` is true, or the menu is open — a
 * pure CSS reveal, not a conditional mount, so hovering feels instant.
 * `Page.tsx` is the only real rendering path that gives its block wrapper
 * the `group/block` class; `HeightMeasurer.tsx`'s off-screen pass never
 * does, so this never affects measured block height there.
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
 *
 * The handle sits outside the block's own box but stays inside it in the
 * DOM, which is what keeps the hover reveal stable: CSS `:hover` follows
 * the element tree, not the geometry, so pointing at the handle still
 * counts as hovering the block. The transparent `pl-2` gutter (rather than
 * a margin) means there's no dead gap to cross on the way there either.
 */
export function BlockToolbar({
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
  selected,
  placement = 'margin',
  breakAfter,
  onToggleBreakAfter,
  children,
}: BlockToolbarProps) {
  // The menu content is portalled, so opening it and moving the pointer
  // onto an item takes the pointer off the block entirely — without this
  // the handle would fade out from under its own open menu.
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={cn(
        'absolute z-10 flex flex-col items-center gap-1',
        placement === 'margin' ? 'left-full top-0 pl-2' : '-top-3 right-2',
        'opacity-0 transition-opacity duration-150 group-hover/block:opacity-100 group-focus-within/block:opacity-100',
        (selected || menuOpen) && 'opacity-100',
      )}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Block actions"
            title="Block actions"
            className="flex size-6 items-center justify-center rounded-[var(--radius-preview)] border border-border bg-background-secondary text-text-secondary shadow-[var(--shadow-sm)] transition-colors hover:bg-hover hover:text-text-primary"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-52">
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            Move down
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>Duplicate</DropdownMenuItem>
          {onToggleBreakAfter && (
            <DropdownMenuCheckboxItem
              checked={!!breakAfter}
              // Radix closes on select and Page.tsx re-renders the block
              // either way, so there's nothing to keep open for.
              onCheckedChange={() => onToggleBreakAfter()}
            >
              Page break after
            </DropdownMenuCheckboxItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger focus:text-danger" onSelect={onDelete}>
            Delete block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </div>
  )
}
