import { useState } from 'react'
import { Lightbulb } from 'lucide-react'

import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { cn } from '@/lib/utils'
import { IdeaDetailDialog } from '@/layout/planning/IdeaDetailDialog'

interface IdeaIndicatorBadgeProps {
  projectId: string
  blockId: string
  className?: string
}

/**
 * Small badge shown on a block with at least one linked Idea (Phase 83,
 * `docs/IDEA_SYSTEM_PLAN.md` Milestone 1.1) — the answer to "shouldn't
 * saved ideas appear next to the paragraph they came from" rather than
 * only living in Develop's inbox. Deliberately modeled on
 * `NoteIndicatorBadge.tsx` (same quiet-until-relevant badge, same
 * `blockId`-keyed lookup) with one difference: clicking it expands an
 * inline preview right there in the margin instead of jumping to a
 * different panel — staying in Write mode is the whole point, since
 * Develop is a full top-level mode switch away. "Edit" on a card still
 * opens the real `IdeaDetailDialog` (promotion, tags, related ideas) rather
 * than re-implementing that UI a second time inline.
 */
export function IdeaIndicatorBadge({ projectId, blockId, className }: IdeaIndicatorBadgeProps) {
  const ideas = useIdeaStore((s) => s.byProject[projectId] ?? EMPTY_IDEAS).filter((idea) => idea.linkedBlockId === blockId)
  const [open, setOpen] = useState(false)
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null)

  if (ideas.length === 0) return null

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        aria-label={`${ideas.length} idea${ideas.length === 1 ? '' : 's'} linked here — click to view`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--color-warning)] shadow-[var(--shadow-sm)]"
      >
        <Lightbulb className="size-3" />
        {ideas.length}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-20 flex w-64 flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-2.5 shadow-[var(--shadow-md)]"
        >
          {ideas.map((idea) => (
            <div key={idea.id} className="flex flex-col gap-1 rounded-[var(--radius-button)] bg-background-secondary p-2">
              <p className="line-clamp-3 text-xs text-text-primary">{idea.text.trim() || <em className="text-text-muted">(empty)</em>}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditingIdeaId(idea.id)} className="text-[11px] font-medium text-[var(--color-accent)]">
                  Open
                </button>
                {idea.promotedTo && <span className="text-[11px] text-text-muted">Promoted</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingIdeaId && (
        <IdeaDetailDialog
          projectId={projectId}
          ideaId={editingIdeaId}
          open
          onOpenChange={(next) => {
            if (!next) {
              setEditingIdeaId(null)
              setOpen(false)
            }
          }}
        />
      )}
    </div>
  )
}
