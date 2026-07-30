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
  /**
   * Inserts `block` into `chapterId`'s block list, immediately after the
   * block with id `afterBlockId` — or at index 0 if `afterBlockId` is
   * `null`. The only sanctioned way anything (e.g. drag-and-drop image
   * placement in `Page.tsx`) adds a new block to the manuscript; no other
   * layer reaches into `chapter.blocks` directly. Only the named chapter is
   * touched — every other chapter/project is left byte-for-byte alone.
   * Bumps `revisionByProject` exactly like `updateBlock`/`renameChapter`.
   */
  insertBlock: (projectId: string, chapterId: string, afterBlockId: string | null, block: ContentBlock) => void
  /**
   * Removes the block with id `blockId` from `chapterId`'s block list. The
   * only sanctioned way anything removes a block from the manuscript — no
   * other layer reaches into `chapter.blocks` directly. Only the named
   * chapter is touched; every other chapter/project is left byte-for-byte
   * alone. Bumps `revisionByProject` exactly like `updateBlock`/
   * `insertBlock`. There is no undo system yet, so callers (`ImagePanel.tsx`)
   * are expected to confirm with the user before calling this.
   */
  deleteBlock: (projectId: string, chapterId: string, blockId: string) => void
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

      insertBlock: (projectId, chapterId, afterBlockId, block) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            const afterIndex = afterBlockId === null ? -1 : chapter.blocks.findIndex((b) => b.id === afterBlockId)
            const insertAt = afterIndex === -1 ? 0 : afterIndex + 1
            const blocks = chapter.blocks.slice()
            blocks.splice(insertAt, 0, block)
            return { ...chapter, blocks }
          })
          return {
            byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } },
            revisionByProject: { ...state.revisionByProject, [projectId]: (state.revisionByProject[projectId] ?? 0) + 1 },
          }
        })
      },

      deleteBlock: (projectId, chapterId, blockId) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters: Chapter[] = manuscript.chapters.map((chapter) => {
            if (chapter.id !== chapterId) return chapter
            return { ...chapter, blocks: chapter.blocks.filter((b) => b.id !== blockId) }
          })
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
