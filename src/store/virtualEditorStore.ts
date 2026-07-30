import { create } from 'zustand'

import type { ContentBlock, Manuscript } from '@/types/content'
import type { EditorialReport, Finding, FindingStatus, IssueCategory } from '@/virtualEditor/types'
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
 * Deliberately NOT persisted (unlike `contentStore`/`projectStore`): the
 * report is a recomputed snapshot, cheap to regenerate with "Review Entire
 * Book", and a `Finding.suggestedFix.apply` is a function value that can't
 * round-trip through JSON anyway. The revision log is therefore also
 * in-memory only for this milestone — surviving a page reload is a
 * documented near-term follow-up, see docs/VIRTUAL_EDITOR.md § Non-Destructive
 * Editing.
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
}

interface VirtualEditorActions {
  /** Runs every registered checker against the current manuscript and
   * stores the resulting report, replacing any previous one for this
   * project. */
  runReview: (projectId: string, manuscript: Manuscript) => EditorialReport
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

export const useVirtualEditorStore = create<VirtualEditorState & VirtualEditorActions>()((set, get) => ({
  reportsByProject: {},
  findingStatusByProject: {},
  revisionsByProject: {},

  runReview: (projectId, manuscript) => {
    const report = runPipeline(projectId, manuscript)
    set((state) => ({
      reportsByProject: { ...state.reportsByProject, [projectId]: report },
      findingStatusByProject: { ...state.findingStatusByProject, [projectId]: {} },
    }))
    return report
  },

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
}))
