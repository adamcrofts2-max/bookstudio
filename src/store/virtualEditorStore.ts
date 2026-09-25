import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ContentBlock, Manuscript } from '@/types/content'
import type { LaidOutPage } from '@/renderer/paginate'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'
import type {
  AiReviewProgress,
  AiReviewResult,
  AiReviewer,
  CheckerContext,
  EditorialReport,
  Finding,
  FindingStatus,
  IssueCategory,
  StyleGuide,
} from '@/virtualEditor/types'
import { mergeAiReview, runPipeline } from '@/virtualEditor/pipeline'
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

/** Where an editorial read stands for one project. In memory only, like
 * `reportsByProject`: a read is paid for, so losing it on reload is a real
 * cost — but its findings carry `suggestedFix.apply` functions that cannot
 * be serialised, and a read replayed against a manuscript edited in another
 * tab would be exactly the stale report `mergeAiReview` exists to prevent. */
export type AiReviewState =
  | { status: 'running'; progress: AiReviewProgress }
  | { status: 'error'; message: string; result?: AiReviewResult }
  | { status: 'done'; result: AiReviewResult }

/** The in-flight request for each project, so it can be cancelled. Module
 * scope, not state: an `AbortController` is not data anything renders. */
const aiControllers = new Map<string, AbortController>()

/**
 * Whether "Fix All" / "Fix all in [category]" may apply this finding's fix.
 * A deterministic fix is mechanical — a doubled space is a doubled space —
 * so applying fifty at once is safe. Claude's rewordings are judgement, and
 * each one changes the author's sentence; they are accepted one at a time,
 * by someone who has read it, or not at all.
 */
export function isBulkFixable(finding: Finding): boolean {
  return Boolean(finding.suggestedFix) && finding.source !== 'ai'
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
  aiByProject: Record<string, AiReviewState | undefined>
}

interface VirtualEditorActions {
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject` — see that hook for why the coordination lives
   * outside the stores. */
  clearProject: (projectId: string) => void
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
    layer0Bible?: Layer0Bible,
  ) => void
  /**
   * Asks `reviewer` for an editorial read and merges it into the report,
   * running the deterministic review first if there is no report yet. Only
   * ever called from an explicit click — a read spends the author's money.
   * `ctx` is assembled by the caller for the same layer-separation reason as
   * `runReview`'s arguments.
   */
  runAiReview: (projectId: string, reviewer: AiReviewer, ctx: CheckerContext) => Promise<void>
  /** Stops an in-flight read. Whatever the previous read found is kept. */
  cancelAiReview: (projectId: string) => void
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
   * the whole report, via `acceptFix` (never duplicates its logic). AI
   * rewordings are excluded — see `isBulkFixable`. */
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
      aiByProject: {},

      clearProject: (projectId) =>
        set((state) => {
          const nextReportsByProject = { ...state.reportsByProject }
          delete nextReportsByProject[projectId]
          const nextFindingStatusByProject = { ...state.findingStatusByProject }
          delete nextFindingStatusByProject[projectId]
          const nextRevisionsByProject = { ...state.revisionsByProject }
          delete nextRevisionsByProject[projectId]
          const nextReviewingByProject = { ...state.reviewingByProject }
          delete nextReviewingByProject[projectId]
          aiControllers.get(projectId)?.abort()
          aiControllers.delete(projectId)
          const nextAiByProject = { ...state.aiByProject }
          delete nextAiByProject[projectId]
          return {
            aiByProject: nextAiByProject,
            reportsByProject: nextReportsByProject,
            findingStatusByProject: nextFindingStatusByProject,
            revisionsByProject: nextRevisionsByProject,
            reviewingByProject: nextReviewingByProject,
          }
        }),

      runReview: (projectId, manuscript, styleGuide, pages, project, structuralPages, assets, layer0Bible) => {
        set((state) => ({ reviewingByProject: { ...state.reviewingByProject, [projectId]: true } }))
        // Deferred one tick so the "Reviewing…" state set above actually
        // paints before `runPipeline` (still synchronous — see this file's
        // top doc comment) blocks the main thread. Doesn't shorten the run
        // itself, but replaces "the app looks frozen" with a visible,
        // honest busy state.
        window.setTimeout(() => {
          const deterministic = runPipeline(projectId, manuscript, styleGuide, pages, project, structuralPages, assets, layer0Bible)
          // A paid-for editorial read outlives a free re-run: fold the last
          // one back in, re-checked against the manuscript as it is now.
          const lastRead = get().aiByProject[projectId]
          const lastResult = lastRead && lastRead.status !== 'running' ? lastRead.result : undefined
          const report = lastResult ? mergeAiReview(deterministic, lastResult, manuscript) : deterministic
          set((state) => ({
            reportsByProject: { ...state.reportsByProject, [projectId]: report },
            findingStatusByProject: { ...state.findingStatusByProject, [projectId]: {} },
            reviewingByProject: { ...state.reviewingByProject, [projectId]: false },
          }))
        }, 0)
      },

      runAiReview: async (projectId, reviewer, ctx) => {
        aiControllers.get(projectId)?.abort()
        const controller = new AbortController()
        aiControllers.set(projectId, controller)
        const previous = get().aiByProject[projectId]
        const previousResult = previous && previous.status !== 'running' ? previous.result : undefined
        const setAi = (next: AiReviewState) =>
          set((state) => ({ aiByProject: { ...state.aiByProject, [projectId]: next } }))

        setAi({ status: 'running', progress: { phase: 'thinking', receivedChars: 0 } })
        try {
          const result = await reviewer.run(ctx, {
            signal: controller.signal,
            onProgress: (progress) => {
              if (aiControllers.get(projectId) === controller) setAi({ status: 'running', progress })
            },
          })
          if (aiControllers.get(projectId) !== controller) return
          // Merged into the report current *now*, not the one current when
          // the read started — the author may have re-run the free review
          // during the minutes Claude was reading.
          const base =
            get().reportsByProject[projectId] ??
            runPipeline(
              projectId,
              ctx.manuscript,
              ctx.styleGuide,
              ctx.pages,
              ctx.project,
              ctx.structuralPages,
              ctx.assets,
              ctx.layer0Bible,
            )
          const manuscript = useContentStore.getState().getManuscript(projectId) ?? ctx.manuscript
          const hadReport = Boolean(get().reportsByProject[projectId])
          set((state) => ({
            reportsByProject: { ...state.reportsByProject, [projectId]: mergeAiReview(base, result, manuscript) },
            // Keep what the author already decided about the deterministic
            // findings; the new AI findings start fresh either way.
            findingStatusByProject: hadReport
              ? state.findingStatusByProject
              : { ...state.findingStatusByProject, [projectId]: {} },
            aiByProject: { ...state.aiByProject, [projectId]: { status: 'done', result } },
          }))
        } catch (error) {
          if (aiControllers.get(projectId) !== controller) return
          const cancelled = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
          if (cancelled && previousResult) setAi({ status: 'done', result: previousResult })
          else if (cancelled) {
            set((state) => {
              const next = { ...state.aiByProject }
              delete next[projectId]
              return { aiByProject: next }
            })
          } else {
            setAi({
              status: 'error',
              message: error instanceof Error ? error.message : 'The editorial read could not be completed.',
              result: previousResult,
            })
          }
        } finally {
          if (aiControllers.get(projectId) === controller) aiControllers.delete(projectId)
        }
      },

      cancelAiReview: (projectId) => {
        aiControllers.get(projectId)?.abort()
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
        // An AI fix recomputes against the block as it is now and returns
        // nothing if its words have gone — record no revision for a no-op.
        if (Object.keys(patch).length === 0) return
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
          if (!isBulkFixable(finding)) continue
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
          if (!isBulkFixable(finding)) continue
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
