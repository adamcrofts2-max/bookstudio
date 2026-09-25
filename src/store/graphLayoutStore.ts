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
 * undo trail. `nodeColorByProject` and `nodeSizeByProject` (Phase 103, user
 * 2026-08-02: "change colour of individual nodes and make individual nodes
 * larger and smaller") follow the exact same reasoning — per-node display
 * preferences, not book content.
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
  /** Per-node colour override, keyed by node id within each project (Phase
   * 103). Layered *on top of* the kind-based default fill every node
   * already gets (`GraphNodeKind` → accent/panel colour in
   * `BookGraphView.tsx`) — most nodes never set one and keep reading their
   * kind's colour; this is for the minority a user wants to visually flag
   * (e.g. "everyone loyal to the antagonist gets a red ring"), not a
   * replacement for the kind-colour system. */
  nodeColorByProject: Record<string, Record<string, string>>
  /** Per-node size multiplier, keyed by node id within each project (Phase
   * 103) — layered on top of `nodeScaleByProject`'s *global* multiplier the
   * same way: `finalRadius = kindBaseRadius * globalScale * perNodeSize`.
   * This is the actual answer to "primary and secondary nodes" (user,
   * 2026-08-02): rather than inventing a separate boolean/tag that would
   * need its own UI and would duplicate what resizing already communicates,
   * making a node bigger *is* marking it more prominent — one mechanism,
   * not two competing ones. See `BookGraphView.tsx`'s doc comment for the
   * full reasoning. */
  nodeSizeByProject: Record<string, Record<string, number>>
}

interface GraphLayoutActions {
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject` — see that hook for why the coordination lives
   * outside the stores. */
  clearProject: (projectId: string) => void
  getPositions: (projectId: string) => Record<string, { x: number; y: number }>
  setPosition: (projectId: string, nodeId: string, position: { x: number; y: number }) => void
  /** Drops every manual position for one project — the Book Graph's "Reset
   * layout" button, for starting the auto-arrangement over from scratch. */
  clearPositions: (projectId: string) => void
  getNodeScale: (projectId: string) => number
  setNodeScale: (projectId: string, scale: number) => void
  /** `undefined` means "no override — use the kind's default colour." */
  getNodeColor: (projectId: string, nodeId: string) => string | undefined
  /** `color: null` clears the override back to the kind default. */
  setNodeColor: (projectId: string, nodeId: string, color: string | null) => void
  getNodeSize: (projectId: string, nodeId: string) => number
  setNodeSize: (projectId: string, nodeId: string, size: number) => void
}

const EMPTY_POSITIONS: Record<string, { x: number; y: number }> = {}
const EMPTY_RECORD: Record<string, string> = {}
const DEFAULT_NODE_SCALE = 1
const DEFAULT_PER_NODE_SIZE = 1

export const useGraphLayoutStore = create<GraphLayoutState & GraphLayoutActions>()(
  persist(
    (set, get) => ({
      byProject: {},
      nodeScaleByProject: {},
      nodeColorByProject: {},
      nodeSizeByProject: {},

      clearProject: (projectId) =>
        set((state) => {
          const nextByProject = { ...state.byProject }
          delete nextByProject[projectId]
          const nextNodeScaleByProject = { ...state.nodeScaleByProject }
          delete nextNodeScaleByProject[projectId]
          const nextNodeColorByProject = { ...state.nodeColorByProject }
          delete nextNodeColorByProject[projectId]
          const nextNodeSizeByProject = { ...state.nodeSizeByProject }
          delete nextNodeSizeByProject[projectId]
          return {
            byProject: nextByProject,
            nodeScaleByProject: nextNodeScaleByProject,
            nodeColorByProject: nextNodeColorByProject,
            nodeSizeByProject: nextNodeSizeByProject,
          }
        }),

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

      getNodeColor: (projectId, nodeId) => (get().nodeColorByProject[projectId] ?? EMPTY_RECORD)[nodeId],

      setNodeColor: (projectId, nodeId, color) => {
        set((state) => {
          const forProject = { ...(state.nodeColorByProject[projectId] ?? {}) }
          if (color === null) delete forProject[nodeId]
          else forProject[nodeId] = color
          return { nodeColorByProject: { ...state.nodeColorByProject, [projectId]: forProject } }
        })
      },

      getNodeSize: (projectId, nodeId) => (get().nodeSizeByProject[projectId] ?? {})[nodeId] ?? DEFAULT_PER_NODE_SIZE,

      setNodeSize: (projectId, nodeId, size) => {
        set((state) => ({
          nodeSizeByProject: {
            ...state.nodeSizeByProject,
            [projectId]: { ...(state.nodeSizeByProject[projectId] ?? {}), [nodeId]: size },
          },
        }))
      },
    }),
    {
      name: 'book-studio.graph-layout',
      version: 1,
    },
  ),
)
