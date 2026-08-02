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
  /** Per-project node-size multiplier for `BookGraphView.tsx` (Phase 102,
   * user 2026-08-02: "make each node larger/smaller"). Same rationale as
   * `byProject` above for not going through `historyStore` — a display
   * preference, not book content. Missing entry (every project before this
   * field existed, or one that's never touched the control) defaults to `1`
   * at the read site below, same never-migrated convention as
   * `ProjectSettings.colorProfile`. */
  nodeScaleByProject: Record<string, number>
}

interface GraphLayoutActions {
  getPositions: (projectId: string) => Record<string, { x: number; y: number }>
  setPosition: (projectId: string, nodeId: string, position: { x: number; y: number }) => void
  /** Drops every manual position for one project — the Book Graph's "Reset
   * layout" button, for starting the auto-arrangement over from scratch. */
  clearPositions: (projectId: string) => void
  getNodeScale: (projectId: string) => number
  setNodeScale: (projectId: string, scale: number) => void
}

const EMPTY_POSITIONS: Record<string, { x: number; y: number }> = {}
const DEFAULT_NODE_SCALE = 1

export const useGraphLayoutStore = create<GraphLayoutState & GraphLayoutActions>()(
  persist(
    (set, get) => ({
      byProject: {},
      nodeScaleByProject: {},

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

      getNodeScale: (projectId) => get().nodeScaleByProject[projectId] ?? DEFAULT_NODE_SCALE,

      setNodeScale: (projectId, scale) => {
        set((state) => ({
          nodeScaleByProject: { ...state.nodeScaleByProject, [projectId]: scale },
        }))
      },
    }),
    {
      name: 'book-studio.graph-layout',
      version: 1,
    },
  ),
)
