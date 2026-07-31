import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Layer: Annotations (additive, side-channel) — editorial notes a user
 * attaches to a manuscript block or a structural page. Deliberately NOT
 * part of `ContentBlock`/`StructuralPage` (Layer 2) — a note references its
 * target by id only, the exact same pattern the Virtual Editor's
 * `Finding.location` already uses (see `virtualEditor/types.ts`), so this
 * stays a pure side-channel that never mutates Content or Structural Page
 * data, and is never read by PDF/EPUB/HTML export — notes are an authoring
 * aid, not book content. See docs/STATUS.md Phase 47.
 *
 * Exactly one of `blockId` (+ its parent `chapterId`, kept alongside for
 * display/context) or `structuralPageId` is set on any given note — never
 * both, never neither. Multiple notes can target the same block/page (a
 * running thread of separate remarks, each individually resolvable/
 * deletable), matching how comment threads work in every other writing
 * tool a user is likely to have used before.
 */
export interface Note {
  id: string
  chapterId?: string
  blockId?: string
  structuralPageId?: string
  text: string
  resolved: boolean
  createdAt: string
  updatedAt: string
}

export const EMPTY_NOTES: readonly Note[] = []

interface NotesStoreState {
  byProject: Record<string, Note[]>
}

interface NotesStoreActions {
  getNotes: (projectId: string) => Note[]
  getNotesForBlock: (projectId: string, blockId: string) => Note[]
  getNotesForStructuralPage: (projectId: string, pageId: string) => Note[]
  /** Low-level "insert this exact object" primitive — mirrors
   * `structuralPageStore.insertPageAt`'s naming/shape, so
   * `editorActions.ts`'s history wrapper can restore an exact snapshot at
   * undo/redo without generating a fresh id each time. */
  addNote: (projectId: string, note: Note) => void
  updateNoteText: (projectId: string, noteId: string, text: string) => void
  setNoteResolved: (projectId: string, noteId: string, resolved: boolean) => void
  deleteNote: (projectId: string, noteId: string) => void
  /** Wholesale replacement of every note for a project — project-file
   * import's bulk-load primitive (Phase 51), mirrors
   * `contentStore.setManuscript`/`structuralPageStore.replaceAllPages`. Not
   * a tracked user edit, so deliberately outside `editorActions.ts`'s
   * undo/redo history. */
  replaceAllNotes: (projectId: string, notes: Note[]) => void
}

export const useNotesStore = create<NotesStoreState & NotesStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      getNotes: (projectId) => get().byProject[projectId] ?? EMPTY_NOTES,
      getNotesForBlock: (projectId, blockId) => (get().byProject[projectId] ?? EMPTY_NOTES).filter((n) => n.blockId === blockId),
      getNotesForStructuralPage: (projectId, pageId) =>
        (get().byProject[projectId] ?? EMPTY_NOTES).filter((n) => n.structuralPageId === pageId),

      addNote: (projectId, note) => {
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: [...(state.byProject[projectId] ?? []), note] },
        }))
      },

      updateNoteText: (projectId, noteId, text) => {
        set((state) => ({
          byProject: {
            ...state.byProject,
            [projectId]: (state.byProject[projectId] ?? []).map((n) =>
              n.id === noteId ? { ...n, text, updatedAt: new Date().toISOString() } : n,
            ),
          },
        }))
      },

      setNoteResolved: (projectId, noteId, resolved) => {
        set((state) => ({
          byProject: {
            ...state.byProject,
            [projectId]: (state.byProject[projectId] ?? []).map((n) =>
              n.id === noteId ? { ...n, resolved, updatedAt: new Date().toISOString() } : n,
            ),
          },
        }))
      },

      deleteNote: (projectId, noteId) => {
        set((state) => ({
          byProject: { ...state.byProject, [projectId]: (state.byProject[projectId] ?? []).filter((n) => n.id !== noteId) },
        }))
      },

      replaceAllNotes: (projectId, notes) => {
        set((state) => ({ byProject: { ...state.byProject, [projectId]: notes } }))
      },
    }),
    {
      name: 'book-studio.notes',
      version: 1,
    },
  ),
)
