import { useMemo } from 'react'
import { RefreshCcw, Sparkles, Wand2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { useExportStore } from '@/store/exportStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { EMPTY_ASSETS, useAssetStore } from '@/store/assetStore'
import { EMPTY_REVISIONS, useVirtualEditorStore } from '@/store/virtualEditorStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { SCORE_TILES } from '@/virtualEditor/scoring'
import { DEFAULT_STYLE_GUIDE } from '@/virtualEditor/types'
import type { Finding, FindingStatus, IssueCategory } from '@/virtualEditor/types'
import { ScoreCard } from '@/layout/virtualEditor/ScoreCard'
import { FindingRow, formatCategory } from '@/layout/virtualEditor/FindingRow'
import { RevisionCompareView } from '@/layout/virtualEditor/RevisionCompareView'
import type { Revision } from '@/store/virtualEditorStore'
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
 * "Fix" action on a finding (and the bulk "Fix All" / per-category "Fix all
 * in [Category]" actions above the grouped findings list), all of which
 * route through `virtualEditorStore.acceptFix`/`fixAll`/`fixCategory` —
 * never directly through `contentStore`.
 */
export function VirtualEditorWorkspace({ project }: VirtualEditorWorkspaceProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  // The real, already-computed pagination output published by
  // `BookRenderer.tsx` after its own render effect — see
  // `docs/VIRTUAL_EDITOR.md` § Publishing Standards & Layout checkers. Only
  // present once the manuscript workspace has rendered at least once this
  // session; genuinely `undefined` otherwise, which is why the caption below
  // exists rather than silently passing nothing through.
  const layout = useExportStore((s) => s.byProject[project.id])
  // Front-/back-matter content and real asset dimensions — read here (not
  // inside the Virtual Editor layer itself) and forwarded into `runReview`,
  // same layer-separation pattern as `layout?.pages` above: this workspace
  // already legitimately holds references to every layer, but
  // `virtualEditorStore`/`pipeline.ts` never reach into `structuralPageStore`
  // or `assetStore` directly. See docs/STATUS.md Phase 36.
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id]) ?? EMPTY_STRUCTURAL_PAGES
  const assets = useAssetStore((s) => s.byProject[project.id]) ?? EMPTY_ASSETS
  const report = useVirtualEditorStore((s) => s.reportsByProject[project.id])
  const findingStatuses = useVirtualEditorStore((s) => s.findingStatusByProject[project.id])
  const revisions = useVirtualEditorStore((s) => s.revisionsByProject[project.id] ?? EMPTY_REVISIONS)
  const runReview = useVirtualEditorStore((s) => s.runReview)
  const acceptFix = useVirtualEditorStore((s) => s.acceptFix)
  const setFindingStatus = useVirtualEditorStore((s) => s.setFindingStatus)
  const ignoreSimilar = useVirtualEditorStore((s) => s.ignoreSimilar)
  const fixAll = useVirtualEditorStore((s) => s.fixAll)
  const fixCategory = useVirtualEditorStore((s) => s.fixCategory)
  const restoreRevision = useVirtualEditorStore((s) => s.restoreRevision)
  const select = useSelectionStore((s) => s.select)
  const selectForEdit = useSelectionStore((s) => s.selectForEdit)
  const requestScrollToBlock = useSelectionStore((s) => s.requestScrollToBlock)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)

  const chapterTitleById = useMemo(() => {
    const map = new Map<string, string>()
    manuscript?.chapters.forEach((c) => map.set(c.id, c.title))
    return map
  }, [manuscript])

  const activeFindings = report?.findings.filter((f) => (findingStatuses?.[f.id] ?? 'new') !== 'ignoredSimilar') ?? []

  const fixableCount = activeFindings.filter(
    (f) => f.suggestedFix && (findingStatuses?.[f.id] ?? 'new') === 'new',
  ).length

  // Group findings by category, preserving each category's first-seen
  // relative order (matches the order findings already come back in from
  // the pipeline) and only including categories that actually have
  // findings — pairs naturally with SCORE_TILES/ScoreCard above. Computed
  // unconditionally (before the `!manuscript` early return below) so this
  // Hook is always called in the same order, per rules-of-hooks.
  const findingsByCategory = useMemo(() => {
    const groups = new Map<IssueCategory, Finding[]>()
    for (const finding of activeFindings) {
      const list = groups.get(finding.category)
      if (list) list.push(finding)
      else groups.set(finding.category, [finding])
    }
    return Array.from(groups.entries())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFindings])

  // Groups the flat, chronological `revisions` log by `blockId` so a block
  // touched by more than one accepted fix can be shown as a single
  // Original -> RevA -> RevB chain (`RevisionCompareView`) instead of only
  // as separate rows in the flat history below. Blocks with exactly one
  // revision are intentionally left out here — a single revision has
  // nothing to compare against beyond what "Restore original" in the flat
  // list already offers.
  const revisionChainsByBlock = useMemo(() => {
    const groups = new Map<string, Revision[]>()
    for (const revision of revisions) {
      const list = groups.get(revision.blockId)
      if (list) list.push(revision)
      else groups.set(revision.blockId, [revision])
    }
    return Array.from(groups.entries()).filter(([, list]) => list.length >= 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisions])

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

  // Routed through `selectionStore.requestScrollToBlock`/`requestScrollToChapter`
  // — the same force-mount-then-scroll mechanism Sidebar.tsx's chapter nav
  // and ThumbnailRail.tsx's page-thumbnail clicks already use, instead of a
  // raw `requestAnimationFrame` + `document.querySelector` a frame later
  // (which could silently find nothing if the target page's spread hadn't
  // been force-mounted by `LazySpread` yet — the exact bug this replaces).
  const handleLocate = (chapterId: string, blockId?: string) => {
    setWorkspaceMode('manuscript')
    if (blockId) {
      select(chapterId, blockId)
      setInspectorTab('typography')
      requestScrollToBlock(chapterId, blockId)
    } else {
      // Book-wide findings (no single block location) fall back to
      // chapter-level scroll, same as Sidebar.tsx's chapter clicks.
      requestScrollToChapter(chapterId)
    }
  }

  /** "Edit" on a finding: same navigation as "Locate", but flags the
   * selection so `Page.tsx`/`BlockContent.tsx` enter inline edit mode on
   * that exact block automatically instead of waiting for a double-click. */
  const handleEdit = (chapterId: string, blockId?: string) => {
    setWorkspaceMode('manuscript')
    if (blockId) {
      selectForEdit(chapterId, blockId)
      setInspectorTab('typography')
      requestScrollToBlock(chapterId, blockId)
    } else {
      requestScrollToChapter(chapterId)
    }
  }

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
          <div className="flex flex-col items-end gap-1.5">
            <Button
              variant="primary"
              size="md"
              className="gap-2"
              onClick={() =>
                runReview(
                  project.id,
                  manuscript,
                  project.settings.styleGuide ?? DEFAULT_STYLE_GUIDE,
                  layout?.pages,
                  project,
                  structuralPages,
                  assets,
                )
              }
            >
              <RefreshCcw className="size-4" />
              Review Entire Book
            </Button>
            {!layout && (
              <p className="max-w-[36ch] text-right text-xs text-text-secondary">
                Layout and Publishing Quality checks need the manuscript view to have rendered at least once this
                session — open the Chapters view, then come back and re-run the review.
              </p>
            )}
          </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h5 font-semibold text-text-primary">Findings</h2>
            <div className="flex items-center gap-3">
              {report && (
                <p className="text-xs text-text-secondary">
                  {activeFindings.length} shown · generated {new Date(report.generatedAt).toLocaleString()}
                </p>
              )}
              {report && activeFindings.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-1.5"
                  disabled={fixableCount === 0}
                  onClick={() => fixAll(project.id)}
                >
                  <Wand2 className="size-3.5" />
                  Fix All
                </Button>
              )}
            </div>
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
            <div className="flex flex-col gap-6">
              {findingsByCategory.map(([category, findings]) => {
                const categoryFixableCount = findings.filter(
                  (f) => f.suggestedFix && (findingStatuses?.[f.id] ?? 'new') === 'new',
                ).length
                return (
                  <div key={category} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          {formatCategory(category)}
                        </h3>
                        <span className="text-xs text-text-muted">({findings.length})</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={categoryFixableCount === 0}
                        onClick={() => fixCategory(project.id, category)}
                      >
                        <Wand2 className="size-3.5" />
                        Fix all in {formatCategory(category)}
                      </Button>
                    </div>
                    <div className="flex flex-col gap-3">
                      {findings.map((finding) => (
                        <FindingRow
                          key={finding.id}
                          finding={finding}
                          status={findingStatuses?.[finding.id] ?? 'new'}
                          chapterTitle={chapterTitleById.get(finding.location.chapterId) ?? 'Unknown chapter'}
                          onLocate={() => handleLocate(finding.location.chapterId, finding.location.blockId)}
                          onAccept={() => acceptFix(project.id, finding)}
                          onEdit={() => handleEdit(finding.location.chapterId, finding.location.blockId)}
                          onStatus={(status: FindingStatus) => setFindingStatus(project.id, finding.id, status)}
                          onIgnoreSimilar={() => ignoreSimilar(project.id, finding)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
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

        {revisionChainsByBlock.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-h5 font-semibold text-text-primary">Revision compare</h2>
            <p className="text-xs text-text-secondary">
              Blocks touched by more than one accepted fix, shown as their full Original → RevA → RevB chain.
            </p>
            <div className="flex flex-col gap-3">
              {revisionChainsByBlock.map(([blockId, blockRevisions]) => (
                <RevisionCompareView
                  key={blockId}
                  chapterTitle={chapterTitleById.get(blockRevisions[0]!.chapterId) ?? 'Unknown chapter'}
                  revisions={blockRevisions}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
