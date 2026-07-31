import { MessageSquare } from 'lucide-react'

import { useNotesStore, EMPTY_NOTES } from '@/store/notesStore'
import { cn } from '@/lib/utils'

interface NoteIndicatorBadgeProps {
  projectId: string
  blockId?: string
  structuralPageId?: string
  onClick: () => void
  className?: string
}

/**
 * Small badge shown on a block or structural page that has at least one
 * unresolved note — clicking it selects the target and jumps to the
 * Inspector's Notes tab (`Page.tsx` supplies `onClick` to do both). Once
 * every note on a target is resolved the badge disappears entirely, so a
 * manuscript with a fully-addressed note history stays visually quiet —
 * only genuinely outstanding notes compete for attention. See
 * `notesStore.ts`'s doc comment / docs/STATUS.md Phase 47.
 */
export function NoteIndicatorBadge({ projectId, blockId, structuralPageId, onClick, className }: NoteIndicatorBadgeProps) {
  const notes = useNotesStore((s) => s.byProject[projectId] ?? EMPTY_NOTES)
  const openCount = notes.filter(
    (n) => (blockId ? n.blockId === blockId : n.structuralPageId === structuralPageId) && !n.resolved,
  ).length

  if (openCount === 0) return null

  return (
    <button
      type="button"
      aria-label={`${openCount} open note${openCount === 1 ? '' : 's'} — click to view`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      <MessageSquare className="size-3" />
      {openCount}
    </button>
  )
}
