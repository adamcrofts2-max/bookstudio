import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ContentBlock, Manuscript } from '@/types/content'
import type { LaidOutPage } from '@/renderer/paginate'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import type { EditorialReport, Finding, FindingStatus, IssueCategory, StyleGuide } from '@/virtualEditor/types'
import { runPipeline } from '@/virtualEditor/pipeline'
import { useContentStore } from '@/store/contentStore'
import { generateId } from '@/utils/id'

/**
 * Layer: Virtual Editor.
 *
 * This is the ONLY place in the app that turns a Virtual Editor `Finding`
 * into a real manuscript edit, and it only ever does so through
 * `contentStore`'s own published action (`updateBlock`) — never by
 * reaching into `contentStore`'s state directly (see CLAUDE.md's
 * "no layer directly mutates another layer's data").
 *
 * `revisionsByProject` is persisted (Phase 37, docs/STATUS.md) — it's plain
 * data (a `ContentBlock` snapshot plus a partial patch, both JSON-safe), the
 * permanent audit trail of every fix the Virtual Editor has ever applied,
 * and useful independent of whether a report currently exists (restoring an
 * old revision doesn't require re-running a review first).
 *
 * `reportsByProject` and `findingStatusByProject` deliberately stay
 * in-memory only, for two different reasons, not one: (1) a `Finding` can
 * carry a `suggestedFix.apply` function value, which can't round-trip
 * through JSON at all; and (2) even setting that aside, `Finding.id` is
 * freshly randomly generated (`generateId('finding')`) on every single
 * "Review Entire Book" run — see `runReview` below, which explicitly resets
 * `findingStatusByProject` to `{}` every time it runs, in the same session,
 * with no reload involved. A finding's accepted/rejected/ignored status is
 * therefore only ever meaningful against the *exact* report that produced
 * it; persisting it across a reload would just be persisting orphaned data
 * that gets discarded the moment the user runs a fresh review anyway
 * (which they must do after a reload, since the report itself isn't
 * persisted). The report is cheap to regenerate with "Review Entire Book"
 * — that's the intended recovery path after a reload, not a bug.
 */

/** A snapshot taken immediately before a fix was applied, so it can be
 * restored. `before` is the full block as it was; `after` is just the
 * patch that was applied (mirrors what `contentStore.updateBlock` received). */
export interface Revision {
  id: string
  findingId: string
  chapterId: string
  blockId: string
  before: ContentBlock
  after: Partial<ContentBlock>
  appliedAt: string
  summary: string
}

/** Stable empty references — see docs/STATUS.md's Zustand v5 warning about
 * selectors returning fresh `[]`/`{}` literals causing infinite re-renders. */
export const EMPTY_REVISIONS: readonly Revision[] = []
const EMPTY_FINDING_STATUSES: Readonly<Record<string, FindingStatus>> = {}

interface VirtualEditorState {
  reportsByProject: Record<string, EditorialReport | undefined>
  findingStatusByProject: Record<string, Record<string, FindingStatus>>
  revisionsByProject: Record<string, Revision[]>
  /** True while a "Review Entire Book" run is in flight for this project.
   * `runPipeline` is synchronous and genuinely blocks the main thread for
   * real seconds on a large manuscript (see docs/ROADMAP.md Phase J's
   * "structural-page mutation freeze" entry) — without this, the button
   * gave zero feedback while it ran, which a live audit found made the app
   * look hung rather than working. Excluded from persistence by
   * `partialize` below, same as `reportsByProject`. */
  reviewingByProject: Record<string, boolean>
}

interface VirtualEditorActions {
  /** Runs every registered checker against the current manuscript and
   * stores the resulting report, replacing any previous one for this
   * project. `styleGuide` is optional and simply forwarded to
   * `runPipeline` — this store never reaches into `projectStore` itself
   * (per CLAUDE.md's layer-separation rule); the caller (which already has
   * both the manuscript and the project) is responsible for reading
   * `project.settings.styleGuide` and passing it in. `pages` is likewise
   * optional and simply forwarded — the real, already-computed pagination
   * output (from `useExportStore`, published by `BookRenderer`), never
   * re-derived here; this store still never reaches into `renderer/*` or
   * `exportStore` itself, per the same layer-separation rule. Genuinely
   * absent when the manuscript workspace hasn't rendered yet this session,
   * which is what lets `publishingStandards`/`layout` honestly report "Not
   * yet analysed" instead of a fake 100. */
  runReview: (
    projectId: string,
    manuscript: Manuscript,
    styleGuide?: StyleGuide,
    pages?: LaidOutPage[],
    project?: Project,
    structuralPages?: StructuralPage[],
    assets?: ImageAsset[],
  ) => void
  /** True while `runReview` is running for this project — see
   * `reviewingByProject`'s comment above. */
  isReviewing: (projectId: string) => boolean
  getReport: (projectId: string) => EditorialReport | undefined
  getFindingStatuses: (projectId: string) => Readonly<Record<string, FindingStatus>>
  getFindingStatus: (projectId: string, findingId: string) => FindingStatus
  setFindingStatus: (projectId: string, findingId: string, status: FindingStatus) => void
  /** Applies a finding's `suggestedFix` (if any) via `contentStore.updateBlock`,
   * snapshotting the affected block into the revision log first. No-op if
   * the finding has no fix or no single-block location. */
  acceptFix: (projectId: string, finding: Finding) => void
  /** Marks every current finding that shares this finding's `issueType` as
   * ignored — the "Ignore Similar" action from the spec. */
  ignoreSimilar: (projectId: string, finding: Finding) => void
  /** Applies every current 'new' finding that has a `suggestedFix`, across
   * the whole report, via `acceptFix` (never duplicates its logic). */
  fixAll: (projectId: string) => void
  /** Same as `fixAll`, but scoped to a single category. */
  fixCategory: (projectId: string, category: IssueCategory) => void
  getRevisions: (projectId: string) => readonly Revision[]
  /** Reverts the fields touched by a past revision back to their
   * pre-fix values, via `contentStore.updateBlock` — never edits history
   * in place. */
  restoreRevision: (projectId: string, revisionId: string) => void
}

export const useVirtualEditorStore = create<VirtualEditorState & VirtualEditorActions>()(
  persist(
    (set, get) => ({
      reportsByProject: {},
      findingStatusByProject: {},
      revisionsByProject: {},
      reviewingByProject: {},

      runReview: (projectId, manuscript, styleGuide, pages, project, structuralPages, assets) => {
        set((state) => ({ reviewingByProject: { ...state.reviewingByProject, [projectId]: true } }))
        // Deferred one tick so the "Reviewing…" state set above actually
        // paints before `runPipeline` (still synchronous — see this file's
        // top doc comment) blocks the main thread. Doesn't shorten the run
        // itself, but replaces "the app looks frozen" with a visible,
        // honest busy state.
        window.setTimeout(() => {
          const report = runPipeline(projectId, manuscript, styleGuide, pages, project, structuralPages, assets)
          set((state) => ({
            reportsByProject: { ...state.reportsByProject, [projectId]: report },
            findingStatusByProject: { ...state.findingStatusByProject, [projectId]: {} },
            reviewingByProject: { ...state.reviewingByProject, [projectId]: false },
          }))
        }, 0)
      },

      isReviewing: (projectId) => get().reviewingByProject[projectId] ?? false,

      getReport: (projectId) => get().reportsByProject[projectId],

      getFindingStatuses: (projectId) => get().findingStatusByProject[projectId] ?? EMPTY_FINDING_STATUSES,

      getFindingStatus: (projectId, findingId) => get().findingStatusByProject[projectId]?.[findingId] ?? 'new',

      setFindingStatus: (projectId, findingId, status) => {
        set((state) => ({
          findingStatusByProject: {
            ...state.findingStatusByProject,
            [projectId]: { ...(state.findingStatusByProject[projectId] ?? {}), [findingId]: status },
          },
        }))
      },

      acceptFix: (projectId, finding) => {
        const { chapterId, blockId } = finding.location
        if (!finding.suggestedFix || !blockId) return

        const manuscript = useContentStore.getState().getManuscript(projectId)
        const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
        const block = chapter?.blocks.find((b) => b.id === blockId)
        if (!manuscript || !chapter || !block) return

        const patch = finding.suggestedFix.apply(block)
        const revision: Revision = {
          id: generateId('revision'),
          findingId: finding.id,
          chapterId: chapter.id,
          blockId: block.id,
          before: block,
          after: patch,
          appliedAt: new Date().toISOString(),
          summary: finding.suggestedFix.summary,
        }

        set((state) => ({
          revisionsByProject: {
            ...state.revisionsByProject,
            [projectId]: [...(state.revisionsByProject[projectId] ?? []), revision],
          },
        }))

        // The only contentStore mutation in this entire layer, and it goes
        // through the same published action every other editing UI uses.
        useContentStore.getState().updateBlock(projectId, chapter.id, block.id, patch)
        get().setFindingStatus(projectId, finding.id, 'accepted')
      },

      ignoreSimilar: (projectId, finding) => {
        const report = get().reportsByProject[projectId]
        if (!report) return
        set((state) => {
          const current = state.findingStatusByProject[projectId] ?? {}
          const next = { ...current }
          for (const f of report.findings) {
            if (f.issueType === finding.issueType) next[f.id] = 'ignoredSimilar'
          }
          return { findingStatusByProject: { ...state.findingStatusByProject, [projectId]: next } }
        })
      },

      fixAll: (projectId) => {
        const report = get().reportsByProject[projectId]
        if (!report) return
        const statuses = get().findingStatusByProject[projectId] ?? {}
        for (const finding of report.findings) {
          if (!finding.suggestedFix) continue
          if ((statuses[finding.id] ?? 'new') !== 'new') continue
          get().acceptFix(projectId, finding)
        }
      },

      fixCategory: (projectId, category) => {
        const report = get().reportsByProject[projectId]
        if (!report) return
        const statuses = get().findingStatusByProject[projectId] ?? {}
        for (const finding of report.findings) {
          if (finding.category !== category) continue
          if (!finding.suggestedFix) continue
          if ((statuses[finding.id] ?? 'new') !== 'new') continue
          get().acceptFix(projectId, finding)
        }
      },

      getRevisions: (projectId) => get().revisionsByProject[projectId] ?? EMPTY_REVISIONS,

      restoreRevision: (projectId, revisionId) => {
        const revision = (get().revisionsByProject[projectId] ?? []).find((r) => r.id === revisionId)
        if (!revision) return

        const restorePatch: Partial<ContentBlock> = {}
        for (const key of Object.keys(revision.after) as (keyof ContentBlock)[]) {
          Object.assign(restorePatch, { [key]: revision.before[key as keyof typeof revision.before] })
        }

        useContentStore.getState().updateBlock(projectId, revision.chapterId, revision.blockId, restorePatch)
      },
    }),
    {
      name: 'book-studio.virtualEditor',
      version: 1,
      // Only the revision log survives a reload — see this file's top
      // doc comment for exactly why `reportsByProject`/`findingStatusByProject`
      // are excluded (a function value that can't serialize, and finding
      // ids that aren't stable across review runs regardless).
      partialize: (state) => ({ revisionsByProject: state.revisionsByProject }),
    },
  ),
)
