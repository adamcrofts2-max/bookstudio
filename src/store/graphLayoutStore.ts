import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Manual node positions for `BookGraphView.tsx`'s "Book Graph" — one
 * `{ nodeId: {x, y} }` map per project, the same `byProject` shape every
 * other per-project store here uses (`ideaStore.ts`, `notesStore.ts`).
 *
 * Deliberately NOT routed through `editorActions.ts`/`historyStore` the way
 * manuscript edits are: dragging a node into place is a view/arrangement
 * preference (same category as pan/zoom, or a theme choice), not book
 * content — undoing "move this character bubble" with Ctrl+Z would be a
 * strange, surprising interaction for something that isn't the manuscript,
 * Layer 0 data, or an Idea. Persisted to `localStorage` like every other
 * store here so a manually-arranged map survives a reload, just without an
 * undo trail.
 */
interface GraphLayoutState {
  byProject: Record<string, Record<string, { x: number; y: number }>>
}

interface GraphLayoutActions {
  getPositions: (projectId: string) => Record<string, { x: number; y: number }>
  setPosition: (projectId: string, nodeId: string, position: { x: number; y: number }) => void
  /** Drops every manual position for one project — the Book Graph's "Reset
   * layout" button, for starting the auto-arrangement over from scratch. */
  clearPositions: (projectId: string) => void
}

const EMPTY_POSITIONS: Record<string, { x: number; y: number }> = {}

export const useGraphLayoutStore = create<GraphLayoutState & GraphLayoutActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      getPositions: (projectId) => get().byProject[projectId] ?? EMPTY_POSITIONS,

      setPosition: (projectId, nodeId, position) => {
        set((state) => ({
          byProject: {
            ...state.byProject,
            [projectId]: { ...(state.byProject[projectId] ?? {}), [nodeId]: position },
          },
        }))
      },

      clearPositions: (projectId) => {
        set((state) => {
          const next = { ...state.byProject }
          delete next[projectId]
          return { byProject: next }
        })
      },
    }),
    {
      name: 'book-studio.graph-layout',
      version: 1,
    },
  ),
)
