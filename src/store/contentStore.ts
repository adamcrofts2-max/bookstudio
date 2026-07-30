import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Chapter, ContentBlock, Manuscript } from '@/types/content'

interface ContentStoreState {
  /** Manuscript per project id. Never imported by Theme/Layout/Rendering
   * code to mutate — they only ever read. */
  byProject: Record<string, Manuscript>
}

interface ContentStoreActions {
  setManuscript: (projectId: string, manuscript: Manuscript) => void
  clearManuscript: (projectId: string) => void
  getManuscript: (projectId: string) => Manuscript | undefined
  updateBlock: (projectId: string, chapterId: string, blockId: string, updates: Partial<ContentBlock>) => void
  renameChapter: (projectId: string, chapterId: string, title: string) => void
}

export const useContentStore = create<ContentStoreState & ContentStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      setManuscript: (projectId, manuscript) =>
        set((state) => ({ byProject: { ...state.byProject, [projectId]: manuscript } })),

      clearManuscript: (projectId) =>
        set((state) => {
          const next = { ...state.byProject }
          delete next[projectId]
          return { byProject: next }
        }),

      getManuscript: (projectId) => get().byProject[projectId],

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
          return { byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } } }
        })
      },

      renameChapter: (projectId, chapterId, title) => {
        set((state) => {
          const manuscript = state.byProject[projectId]
          if (!manuscript) return state
          const chapters = manuscript.chapters.map((c) => (c.id === chapterId ? { ...c, title } : c))
          return { byProject: { ...state.byProject, [projectId]: { ...manuscript, chapters } } }
        })
      },
    }),
    {
      name: 'book-studio.content',
      version: 1,
    },
  ),
)
