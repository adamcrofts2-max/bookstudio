import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Lightbulb, List, Plus, Waypoints } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import { generateId } from '@/utils'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useAssetStore } from '@/store/assetStore'
import { addIdeaWithHistory } from '@/store/editorActions'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type Idea, type IdeaStatus } from '@/types/idea'
import { IdeaDetailDialog } from '@/layout/planning/IdeaDetailDialog'

interface IdeaInboxPanelProps {
  projectId: string
  /** Switches `PlanningShell`'s nav to Book Graph — replaces the old
   * Ideas-only "Map" view (Phase 94's `IdeaMindMapView.tsx`, removed Phase
   * 99). User, 2026-08-02, on finding both views side by side: "How is this
   * different from book graph and are both needed?" — no: Book Graph
   * already shows every Idea (icon, draggable, real cross-kind edges) with
   * everything else in the book, so a second, Ideas-only map with plain
   * orange circles and no drag was a strictly worse duplicate, not a
   * complementary view. This button is the replacement affordance.
   *
   * Optional since Phase 129: mobile Develop reuses this panel but has no
   * Book Graph to open (it is a drag-and-zoom canvas, deliberately
   * desktop-only), and previously it dropped a phone into the desktop-shaped
   * `PlanningShell`. When omitted the button simply isn't rendered — a
   * missing affordance is better than one that leads somewhere unusable.
   * Desktop passes it, so desktop is unchanged. */
  onOpenBookGraph?: () => void
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
 * category one click away in a quieter secondary row.
 *
 * List was the only view Milestone 1 shipped (Board/Canvas were explicitly
 * deferred). Phase 93 added Board — a Pinterest-style visual grid — as the
 * direct answer to "theres no place for example ideas/images think
 * pinterest" (user, 2026-08-02): any Idea with `imageAssetIds` (Phase 93's
 * new field) shows its first image as a cover; ideas with no image still
 * appear as a plain text card, same content as the List row. A CSS multi-
 * column layout (`columns-*` + `break-inside-avoid`), not a JS masonry
 * library — no new dependency, and this sandbox has no npm registry access
 * to add one even if it were worth it for what's still a fairly small grid.
 *
 * Phase 94 (Idea System Milestone 2) added a third view, Map — since
 * removed (Phase 99): Book Graph (`BookGraphView.tsx`) shows every Idea
 * alongside chapters and every Layer 0 entity kind, with real icons,
 * draggable positions, and labeled relationship edges Map never had, making
 * a second Ideas-only map a strictly worse duplicate rather than a
 * complementary view. List and Board share the same `visible` (status-
 * filtered) idea list and the same `IdeaDetailDialog` on click; "Open Book
 * Graph" next to the toggle is the one-click bridge to the richer view.
 */
export function IdeaInboxPanel({ projectId, onOpenBookGraph }: IdeaInboxPanelProps) {
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const loadAssets = useAssetStore((s) => s.loadAssets)
  const [filter, setFilter] = useState<IdeaStatus | 'all'>('all')
  const [view, setView] = useState<'list' | 'board'>('list')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)

  // See `IdeaDetailDialog.tsx`'s identical effect for why this is needed
  // here too — Develop's own shell never triggers the editor Sidebar's
  // `loadAssets` on mount.
  useEffect(() => {
    loadAssets(projectId)
  }, [projectId, loadAssets])

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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex shrink-0 items-center gap-2">
            {/* List/Board toggle — a plain segmented row, not a dropdown,
               since these are mutually-exclusive states someone will flip
               between often. */}
            <div className="flex items-center gap-0.5 rounded-[var(--radius-button)] border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                title="List view"
                className={cn(
                  'flex size-6 items-center justify-center rounded-[calc(var(--radius-button)-2px)] transition-colors duration-150',
                  view === 'list' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'text-text-muted hover:bg-hover',
                )}
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('board')}
                aria-label="Board view"
                title="Board view"
                className={cn(
                  'flex size-6 items-center justify-center rounded-[calc(var(--radius-button)-2px)] transition-colors duration-150',
                  view === 'board' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'text-text-muted hover:bg-hover',
                )}
              >
                <LayoutGrid className="size-3.5" />
              </button>
            </div>
            {onOpenBookGraph && (
              <button
                type="button"
                onClick={onOpenBookGraph}
                className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-text-secondary transition-colors duration-150 hover:text-[var(--color-accent)]"
              >
                <Waypoints className="size-3.5" />
                Open Book Graph
              </button>
            )}
          </div>
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
      ) : view === 'list' ? (
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
      ) : (
        // Board — CSS multi-column masonry, not a grid: a grid forces every
        // row to the tallest cell's height, which would stretch every
        // text-only card up to match its image-having neighbours. Columns
        // let each card keep its own natural height, the actual Pinterest
        // look this was asked for. `break-inside-avoid` stops a card being
        // split across two columns.
        <div className="columns-2 gap-3 sm:columns-3">
          {visible.map((idea) => {
            const coverAssetId = idea.imageAssetIds?.[0]
            const coverUrl = coverAssetId ? getObjectUrl(coverAssetId) : undefined
            return (
              <button
                key={idea.id}
                type="button"
                onClick={() => setSelectedIdeaId(idea.id)}
                className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-[var(--radius-card)] border border-border bg-panel text-left transition-colors duration-150 hover:border-[var(--color-accent)]/40"
              >
                {coverUrl && <img src={coverUrl} alt="" className="block w-full" />}
                <div className="p-3">
                  <p className="line-clamp-4 text-sm text-text-primary">{idea.text.trim() || <em className="text-text-muted">(empty)</em>}</p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
                    <span className={cn('size-1.5 rounded-full', STATUS_DOT_CLASS[idea.status])} />
                    <span>{IDEA_STATUS_LABELS[idea.status]}</span>
                    {idea.imageAssetIds && idea.imageAssetIds.length > 1 && <span>· {idea.imageAssetIds.length} images</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedIdeaId && (
        <IdeaDetailDialog projectId={projectId} ideaId={selectedIdeaId} open onOpenChange={(open) => !open && setSelectedIdeaId(null)} />
      )}
    </div>
  )
}
