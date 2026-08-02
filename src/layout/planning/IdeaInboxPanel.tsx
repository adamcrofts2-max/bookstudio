import { useMemo, useState } from 'react'
import { Lightbulb, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import { generateId } from '@/utils'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { addIdeaWithHistory } from '@/store/editorActions'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type Idea, type IdeaStatus } from '@/types/idea'
import { IdeaDetailDialog } from '@/layout/planning/IdeaDetailDialog'

interface IdeaInboxPanelProps {
  projectId: string
}

/** One status's dot colour — a quick visual scan cue in the inbox list,
 * reusing this app's existing semantic colour tokens rather than inventing
 * a new palette (`--color-accent` for progress, `--color-warning` for
 * "still new/unsorted", muted for done/archived). */
const STATUS_DOT_CLASS: Record<IdeaStatus, string> = {
  new: 'bg-[var(--color-warning)]',
  'in-progress': 'bg-[var(--color-accent)]',
  used: 'bg-text-muted',
  archived: 'bg-border',
}

/**
 * Develop's landing view (Develop Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`)
 * — a running list of every Idea for the project, newest first, each
 * showing its text, status, and a coloured status indicator. This is the
 * front door: `PlanningShell.tsx` lands here by default, with every other
 * category one click away in a quieter secondary row. List is the only
 * view Milestone 1 ships — Board/Canvas are explicitly deferred (see the
 * spec's own Deferred section).
 */
export function IdeaInboxPanel({ projectId }: IdeaInboxPanelProps) {
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('all')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...ideas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [ideas],
  )
  const visible = filter === 'all' ? sorted : sorted.filter((i) => i.status === filter)

  const handleCaptureNew = () => {
    const now = new Date().toISOString()
    const idea: Idea = { id: generateId('idea'), text: '', createdAt: now, updatedAt: now, status: 'new' }
    addIdeaWithHistory(projectId, idea)
    setSelectedIdeaId(idea.id)
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ideas</h2>
          <p className="text-sm text-text-secondary">Everything captured for this book — sort it into real planning whenever you're ready.</p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={handleCaptureNew}>
          <Plus className="size-4" />
          New idea
        </Button>
      </div>

      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              filter === 'all' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-border text-text-secondary hover:bg-hover',
            )}
          >
            All ({ideas.length})
          </button>
          {IDEA_STATUSES.map((status) => {
            const count = ideas.filter((i) => i.status === status).length
            if (count === 0) return null
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                  filter === status ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-border text-text-secondary hover:bg-hover',
                )}
              >
                <span className={cn('size-1.5 rounded-full', STATUS_DOT_CLASS[status])} />
                {IDEA_STATUS_LABELS[status]} ({count})
              </button>
            )
          })}
        </div>
      )}

      {ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No ideas yet"
          description="Capture a stray thought here, or from the small lightbulb icon while you're writing — nothing about a book has to be structured before it's worth saving."
          action={
            <Button type="button" size="sm" onClick={handleCaptureNew}>
              Capture your first idea
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Nothing here" description="No ideas match this filter." className="py-10" />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((idea) => (
            <button
              key={idea.id}
              type="button"
              onClick={() => setSelectedIdeaId(idea.id)}
              className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-3 text-left transition-colors duration-150 hover:border-[var(--color-accent)]/40"
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', STATUS_DOT_CLASS[idea.status])} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-text-primary">{idea.text.trim() || <em className="text-text-muted">(empty)</em>}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <span>{IDEA_STATUS_LABELS[idea.status]}</span>
                  {idea.promotedTo && <span>· promoted</span>}
                  {idea.relatedIdeaIds && idea.relatedIdeaIds.length > 0 && <span>· {idea.relatedIdeaIds.length} related</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedIdeaId && (
        <IdeaDetailDialog projectId={projectId} ideaId={selectedIdeaId} open onOpenChange={(open) => !open && setSelectedIdeaId(null)} />
      )}
    </div>
  )
}
