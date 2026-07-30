import { useMemo } from 'react'
import { RefreshCcw, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { EMPTY_REVISIONS, useVirtualEditorStore } from '@/store/virtualEditorStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { SCORE_TILES } from '@/virtualEditor/scoring'
import type { FindingStatus } from '@/virtualEditor/types'
import { ScoreCard } from '@/layout/virtualEditor/ScoreCard'
import { FindingRow } from '@/layout/virtualEditor/FindingRow'
import type { Project } from '@/types'

interface VirtualEditorWorkspaceProps {
  project: Project
}

/**
 * The Editorial Dashboard — a completely new workspace reached from the
 * Toolbar's "Virtual Editor" toggle. Reuses the fixed three-column
 * `AppShell`; only the centre column's contents swap (`Workspace.tsx`
 * decides between this and the manuscript preview based on
 * `uiStore.workspaceMode`).
 *
 * Everything here is read-only against the manuscript except the explicit
 * "Accept" action on a finding, which routes through
 * `virtualEditorStore.acceptFix` — never directly through `contentStore`.
 */
export function VirtualEditorWorkspace({ project }: VirtualEditorWorkspaceProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const report = useVirtualEditorStore((s) => s.reportsByProject[project.id])
  const findingStatuses = useVirtualEditorStore((s) => s.findingStatusByProject[project.id])
  const revisions = useVirtualEditorStore((s) => s.revisionsByProject[project.id] ?? EMPTY_REVISIONS)
  const runReview = useVirtualEditorStore((s) => s.runReview)
  const acceptFix = useVirtualEditorStore((s) => s.acceptFix)
  const setFindingStatus = useVirtualEditorStore((s) => s.setFindingStatus)
  const ignoreSimilar = useVirtualEditorStore((s) => s.ignoreSimilar)
  const restoreRevision = useVirtualEditorStore((s) => s.restoreRevision)
  const select = useSelectionStore((s) => s.select)
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)

  const chapterTitleById = useMemo(() => {
    const map = new Map<string, string>()
    manuscript?.chapters.forEach((c) => map.set(c.id, c.title))
    return map
  }, [manuscript])

  if (!manuscript) {
    return (
      <main className="flex flex-1 items-center justify-center overflow-y-auto bg-background-secondary px-8 py-12">
        <EmptyState
          icon={Sparkles}
          title="Import a manuscript first"
          description="The Virtual Editor reviews the manuscript you import into this project — there's nothing to review yet."
        />
      </main>
    )
  }

  const handleLocate = (chapterId: string, blockId?: string) => {
    setWorkspaceMode('manuscript')
    if (blockId) {
      select(chapterId, blockId)
      setInspectorTab('typography')
    }
    // The manuscript workspace re-mounts on this same tick; wait a frame
    // so `[data-chapter-start]` actually exists before we scroll to it —
    // same lookup Sidebar.tsx uses for chapter navigation.
    requestAnimationFrame(() => {
      document.querySelector(`[data-chapter-start="${chapterId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const activeFindings = report?.findings.filter((f) => (findingStatuses?.[f.id] ?? 'new') !== 'ignoredSimilar') ?? []

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-background-secondary">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="flex items-center gap-2 text-h3 font-semibold text-text-primary">
              <Sparkles className="size-5 text-accent" />
              Virtual Editor
            </h1>
            <p className="max-w-[60ch] text-sm text-text-secondary">
              Reviews the whole project like a publishing team would. Proofreading is real today; the rest of the
              taxonomy is designed and lands incrementally — see <span className="font-medium">docs/VIRTUAL_EDITOR.md</span>.
            </p>
          </div>
          <Button variant="primary" size="md" className="gap-2" onClick={() => runReview(project.id, manuscript)}>
            <RefreshCcw className="size-4" />
            Review Entire Book
          </Button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SCORE_TILES.map((tile) => {
            const categoryEntry = tile.key === 'overall' ? undefined : report?.categoryScores[tile.key]
            const score = tile.key === 'overall' ? (report?.overallScore ?? null) : (categoryEntry?.score ?? null)
            const findingCount = tile.key === 'overall' ? report?.findings.length : categoryEntry?.findingCount
            return <ScoreCard key={tile.key} tile={tile} score={score} findingCount={findingCount} />
          })}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-h5 font-semibold text-text-primary">Findings</h2>
            {report && (
              <p className="text-xs text-text-secondary">
                {activeFindings.length} shown · generated {new Date(report.generatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {!report ? (
            <EmptyState
              icon={Sparkles}
              title="No review yet"
              description='Click "Review Entire Book" to run the Virtual Editor against this manuscript.'
              className="rounded-[var(--radius-card)] border border-dashed border-border"
            />
          ) : activeFindings.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No issues found"
              description="The proofreading engine found nothing to flag in the current manuscript."
              className="rounded-[var(--radius-card)] border border-dashed border-border"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {activeFindings.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  status={findingStatuses?.[finding.id] ?? 'new'}
                  chapterTitle={chapterTitleById.get(finding.location.chapterId) ?? 'Unknown chapter'}
                  onLocate={() => handleLocate(finding.location.chapterId, finding.location.blockId)}
                  onAccept={() => acceptFix(project.id, finding)}
                  onStatus={(status: FindingStatus) => setFindingStatus(project.id, finding.id, status)}
                  onIgnoreSimilar={() => ignoreSimilar(project.id, finding)}
                />
              ))}
            </div>
          )}
        </section>

        {revisions.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-h5 font-semibold text-text-primary">Revision history</h2>
            <p className="text-xs text-text-secondary">
              Every accepted fix is logged here before it touches the manuscript. Restoring puts the original text
              back via the same <span className="font-medium">contentStore.updateBlock</span> path every edit uses —
              nothing is ever overwritten silently.
            </p>
            <div className="flex flex-col gap-2">
              {revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-panel px-4 py-2.5"
                >
                  <div>
                    <p className="text-sm text-text-primary">{revision.summary}</p>
                    <p className="text-xs text-text-secondary">
                      {chapterTitleById.get(revision.chapterId) ?? 'Unknown chapter'} ·{' '}
                      {new Date(revision.appliedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => restoreRevision(project.id, revision.id)}>
                    Restore original
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
