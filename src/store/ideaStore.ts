import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Idea } from '@/types/idea'

/**
 * Idea System store (Develop Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`) — the
 * same `byProject: Record<projectId, Idea[]>` shape every other per-project
 * store in this codebase already uses (`notesStore.ts`, `layer0Store.ts`).
 * A ninth store that looks exactly like the other eight, deliberately: no
 * new persistence mechanism, no new patterns.
 */
export const EMPTY_IDEAS: readonly Idea[] = []

interface IdeaStoreState {
  byProject: Record<string, Idea[]>
}

interface IdeaStoreActions {
  getIdeas: (projectId: string) => Idea[]
  /** Low-level "insert this exact object" primitive — mirrors
   * `notesStore.addNote`/`layer0Store.addEntity`'s naming/shape, so
   * `editorActions.ts`'s history wrapper can restore an exact snapshot at
   * undo/redo without generating a fresh id each time. */
  addIdea: (projectId: string, idea: Idea) => void
  updateIdea: (projectId: string, id: string, updates: Partial<Idea>) => void
  deleteIdea: (projectId: string, id: string) => void
  /** Wholesale replacement of every Idea for a project — project-file
   * import's bulk-load primitive, mirrors `notesStore.replaceAllNotes`/
   * `layer0Store.replaceBible`. Not a tracked user edit, deliberately
   * outside `editorActions.ts`'s undo/redo history. */
  replaceAllIdeas: (projectId: string, ideas: Idea[]) => void
}

export const useIdeaStore = create<IdeaStoreState & IdeaStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      getIdeas: (projectId) => get().byProject[projectId] ?? EMPTY_IDEAS,

      addIdea: (projectId, idea) => {
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: [...(state.byProject[projectId] ?? []), idea] },
        }))
      },

      updateIdea: (projectId, id, updates) => {
        set((state) => ({
          byProject: {
            ...state.byProject,
            [projectId]: (state.byProject[projectId] ?? []).map((idea) =>
              idea.id === id ? { ...idea, ...updates, updatedAt: new Date().toISOString() } : idea,
            ),
          },
        }))
      },

      deleteIdea: (projectId, id) => {
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: (state.byProject[projectId] ?? []).filter((idea) => idea.id !== id) },
        }))
      },

      replaceAllIdeas: (projectId, ideas) => {
        set((state) => ({ byProject: { ...state.byProject, [projectId]: ideas } }))
      },
    }),
    {
      name: 'book-studio.ideas',
      version: 1,
    },
  ),
)
