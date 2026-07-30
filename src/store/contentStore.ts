import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Chapter, ContentBlock, Manuscript } from '@/types/content'

interface ContentStoreState {
  /** Manuscript per project id. Never imported by Theme/Layout/Rendering
   * code to mutate — they only ever read. */
  byProject: Record<string, Manuscript>
  /**
   * Bumped on every content-mutating action (`updateBlock`/`renameChapter`/
   * `setManuscript`) for a given project. A cheap "content changed" signal
   * downstream layers can fold into their own cache/memo keys without
   * deep-diffing or re-hashing the whole manuscript on every render.
   *
   * This exists to fix a real bug: `BookRenderer`'s `measureKey` used to be
   * built only from themeId/contentWidth/`manuscript.importedAt`, none of
   * which change when a block's text is edited via `updateBlock` — so an
   * edited block kept its stale (possibly now-wrong) cached height until
   * something else forced a full remeasure. Folding this counter into
   * `measureKey` makes every content edit reliably trigger remeasurement +
   * repagination. See `docs/STATUS.md`.
   */
  revisionByProject: Record<string, number>
}

interface ContentStoreActions {
  setManuscript: (projectId: string, manuscript: Manuscript) => void
  clearManuscript: (projectId: string) => void
  getManuscript: (projectId: string) => Manuscript | undefined
  /** The current content revision for a project — 0 if never touched. */
  getRevision: (projectId: string) => number
  updateBlock: (projectId: string, chapterId: string, blockId: string, updates: Partial<ContentBlock>) => void
  renameChapter: (projectId: string, chapterId: string, title: string) => void
}

export const useContentStore = create<ContentStoreState & ContentStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},
      revisionByProject: {},

      setManuscript: (projectId, manuscript) =>
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: manuscript },
          revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
        })),

      clearManuscript: (projectId) =>
        set((state) => {
          const next = { ...state.byProject }
          delete next[projectId]
          return { byProject: next }
        }),

      getManuscript: (projectId) => get().byProject[projectId],

      getRevision: (projectId) => get().revisionByProject[projectId] ?? 0,

      updateBlock: (projectId, chapterId, blockId, updates) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return {
              ...chapter,
              blocks: chapter.blocks.map((block) =>
                block.id === blockId ? ({ ...block, ...updates } as ContentBlock) : block,
              ),
            }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      renameChapter: (projectId, chapterId, title) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters = manuscript.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c))
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },
    }),
    {
      name: 'book-studio.content',
      version: 1,
    },
  ),
)
