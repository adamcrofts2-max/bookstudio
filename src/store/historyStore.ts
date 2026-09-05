import { create } from 'zustand'

/**
 * A single reversible edit. `undo`/`redo` are closures that already carry
 * everything they need (project/chapter/block ids, before/after snapshots)
 * — this store never inspects manuscript content itself, it just sequences
 * opaque commands. Mirrors the shape of `virtualEditorStore.ts`'s
 * `Revision` (snapshot-then-restore-via-the-same-public-store-action), but
 * as its own separate, more general system — that store's revision/restore
 * flow is left completely untouched.
 */
export interface HistoryCommand {
  id: string
  /** Human-readable, e.g. "Edit text", "Delete image", "Rename chapter" —
   * surfaced in the Toolbar's Undo/Redo tooltips. */
  label: string
  undo: () => void
  redo: () => void
}

/** Stable empty reference — see docs/STATUS.md's Zustand v5 warning about
 * selectors returning fresh `[]` literals causing infinite re-renders. */
export const EMPTY_HISTORY: readonly HistoryCommand[] = []

/** Books may exceed 1,000 pages (see CLAUDE.md's print-publishing scale
 * note) and a long editing session could otherwise accumulate an unbounded
 * number of commands; cap the stack and drop the oldest entries once full. */
const MAX_HISTORY_DEPTH = 100

let nextCommandSeq = 0
function nextCommandId(): string {
  nextCommandSeq += 1
  return `history-${nextCommandSeq}`
}

interface HistoryStoreState {
  undoStackByProject: Record<string, HistoryCommand[]>
  redoStackByProject: Record<string, HistoryCommand[]>
}

interface HistoryStoreActions {
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject` — see that hook for why the coordination lives
   * outside the stores. */
  clearProject: (projectId: string) => void
  /** Pushes a new command onto the undo stack and clears the redo stack —
   * any new action invalidates the "future" that redo would have replayed. */
  record: (projectId: string, label: string, undo: () => void, redo: () => void) => void
  /** Pops the top undo command, calls its `.undo()`, and moves it to the
   * redo stack. No-op if the undo stack is empty. */
  undo: (projectId: string) => void
  /** Mirror of `undo`: pops the top redo command, calls its `.redo()`, and
   * moves it back to the undo stack. No-op if the redo stack is empty. */
  redo: (projectId: string) => void
  canUndo: (projectId: string) => boolean
  canRedo: (projectId: string) => boolean
  /** For Toolbar tooltips, e.g. "Undo: Edit text". `undefined` when empty. */
  peekUndoLabel: (projectId: string) => string | undefined
  peekRedoLabel: (projectId: string) => string | undefined
}

/**
 * Generic, per-project command-based undo/redo stack. In-memory only —
 * deliberately NOT wrapped in zustand's `persist` middleware, so history
 * resets on reload. That's the correct, simple default here: a command's
 * `undo`/`redo` closures are function values that can't round-trip through
 * JSON (same reasoning `virtualEditorStore.ts` already documents for why
 * its own revision log isn't persisted either).
 */
export const useHistoryStore = create<HistoryStoreState & HistoryStoreActions>()((set, get) => ({
  undoStackByProject: {},
  redoStackByProject: {},

  clearProject: (projectId) =>
    set((state) => {
      const nextUndoStackByProject = { ...state.undoStackByProject }
      delete nextUndoStackByProject[projectId]
      const nextRedoStackByProject = { ...state.redoStackByProject }
      delete nextRedoStackByProject[projectId]
      return { undoStackByProject: nextUndoStackByProject, redoStackByProject: nextRedoStackByProject }
    }),

  record: (projectId, label, undo, redo) => {
    set((state) => {
      const stack = state.undoStackByProject[projectId] ?? []
      const nextStack = [...stack, { id: nextCommandId(), label, undo, redo }]
      if (nextStack.length > MAX_HISTORY_DEPTH) nextStack.shift()
      return {
        undoStackByProject: { ...state.undoStackByProject, [projectId]: nextStack },
        redoStackByProject: { ...state.redoStackByProject, [projectId]: [] },
      }
    })
  },

  undo: (projectId) => {
    const stack = get().undoStackByProject[projectId] ?? []
    if (stack.length === 0) return
    const command = stack[stack.length - 1]
    command.undo()
    set((state) => ({
      undoStackByProject: { ...state.undoStackByProject, [projectId]: stack.slice(0, -1) },
      redoStackByProject: {
        ...state.redoStackByProject,
        [projectId]: [...(state.redoStackByProject[projectId] ?? []), command],
      },
    }))
  },

  redo: (projectId) => {
    const stack = get().redoStackByProject[projectId] ?? []
    if (stack.length === 0) return
    const command = stack[stack.length - 1]
    command.redo()
    set((state) => ({
      redoStackByProject: { ...state.redoStackByProject, [projectId]: stack.slice(0, -1) },
      undoStackByProject: {
        ...state.undoStackByProject,
        [projectId]: [...(state.undoStackByProject[projectId] ?? []), command],
      },
    }))
  },

  canUndo: (projectId) => (get().undoStackByProject[projectId] ?? EMPTY_HISTORY).length > 0,
  canRedo: (projectId) => (get().redoStackByProject[projectId] ?? EMPTY_HISTORY).length > 0,

  peekUndoLabel: (projectId) => {
    const stack = get().undoStackByProject[projectId] ?? EMPTY_HISTORY
    return stack.length > 0 ? stack[stack.length - 1].label : undefined
  },

  peekRedoLabel: (projectId) => {
    const stack = get().redoStackByProject[projectId] ?? EMPTY_HISTORY
    return stack.length > 0 ? stack[stack.length - 1].label : undefined
  },
}))
