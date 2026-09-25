import { create } from 'zustand'

import { useContentStore } from '@/store/contentStore'
import { useProjectStore } from '@/store/projectStore'
import { deleteSnapshot as deleteSnapshotFromDb, listSnapshotsForProject, putSnapshot, type Snapshot } from '@/store/snapshotDb'
import { generateId } from '@/utils'

/** Bounds IndexedDB growth for long-lived projects — an explicit, adjustable
 * default, not a hard requirement. See docs/STATUS.md. */
const MAX_SNAPSHOTS_PER_PROJECT = 20

/** Stable reference for "no snapshots loaded yet" — mirrors `assetStore.ts`'s
 * `EMPTY_ASSETS` precedent to avoid a fresh-array-identity re-render loop. */
export const EMPTY_SNAPSHOTS: readonly Snapshot[] = []

interface VersionStoreState {
  /** Snapshots currently loaded, keyed by project id, newest-first. */
  byProject: Record<string, Snapshot[]>
}

interface VersionStoreActions {
  /**
   * Reads the current manuscript + settings and writes a new snapshot.
   * No-op if there's no manuscript yet (nothing to snapshot). Prunes down
   * to the 20 most recent snapshots for the project afterwards.
   */
  createSnapshot: (projectId: string, kind: 'auto' | 'manual', label?: string) => Promise<void>
  listSnapshots: (projectId: string) => Promise<void>
  /**
   * Restores a past snapshot via the same public store actions a live edit
   * would use (`contentStore.setManuscript` / `projectStore.updateProjectSettings`)
   * — never reaches into their internals, mirroring `virtualEditorStore.ts`'s
   * `restoreRevision` precedent. First snapshots the current (about-to-be-
   * overwritten) state, so restoring is itself never destructive — a bad
   * restore can be undone by restoring again.
   */
  restoreSnapshot: (projectId: string, snapshotId: string) => Promise<void>
  deleteSnapshot: (projectId: string, snapshotId: string) => Promise<void>
  getSnapshots: (projectId: string) => readonly Snapshot[]
  /** Drops every snapshot for a project, from both this store and the
   * IndexedDB table behind it. Called only from `useDeleteProject`. */
  clearProject: (projectId: string) => Promise<void>
}

export const useVersionStore = create<VersionStoreState & VersionStoreActions>()((set, get) => ({
  byProject: {},

  clearProject: async (projectId) => {
    // Read from IndexedDB rather than from `byProject`: snapshots for a
    // project the user never opened this session were never loaded into
    // memory, and those are exactly the ones that would be orphaned.
    const stored = await listSnapshotsForProject(projectId)
    await Promise.all(stored.map((snapshot) => deleteSnapshotFromDb(snapshot.id)))
    set((state) => {
      const nextByProject = { ...state.byProject }
      delete nextByProject[projectId]
      return { byProject: nextByProject }
    })
  },

  createSnapshot: async (projectId, kind, label) => {
    const manuscript = useContentStore.getState().getManuscript(projectId)
    if (!manuscript) return
    const project = useProjectStore.getState().getProject(projectId)
    if (!project) return

    const snapshot: Snapshot = {
      id: generateId('snapshot'),
      projectId,
      createdAt: new Date().toISOString(),
      // Empty when the user didn't name it. The label used to default to a
      // formatted timestamp, and `VersionHistoryDialog` prints the
      // timestamp underneath the label — so every unnamed version showed
      // the same time twice, one line above the other (Phase 161). What to
      // show when there is no label is the row's business, not the store's.
      label: label?.trim() ?? '',
      kind,
      manuscript,
      settings: project.settings,
    }
    await putSnapshot(snapshot)

    // Prune beyond the cap — delete the oldest snapshots for this project.
    const all = await listSnapshotsForProject(projectId)
    const toPrune = all.slice(MAX_SNAPSHOTS_PER_PROJECT)
    for (const stale of toPrune) {
      await deleteSnapshotFromDb(stale.id)
    }

    const remaining = await listSnapshotsForProject(projectId)
    set((state) => ({ byProject: { ...state.byProject, [projectId]: remaining } }))
  },

  listSnapshots: async (projectId) => {
    const snapshots = await listSnapshotsForProject(projectId)
    set((state) => ({ byProject: { ...state.byProject, [projectId]: snapshots } }))
  },

  restoreSnapshot: async (projectId, snapshotId) => {
    const snapshot = (get().byProject[projectId] ?? []).find((s) => s.id === snapshotId)
    if (!snapshot) return

    // Safety net: snapshot the current state before overwriting it, so this
    // restore can itself be undone by restoring again. `createSnapshot`
    // already refreshes `byProject` for this project, so no further list
    // reload is needed after applying the restore below.
    await get().createSnapshot(projectId, 'auto', 'Before restoring an earlier version')

    useContentStore.getState().setManuscript(projectId, snapshot.manuscript)
    useProjectStore.getState().updateProjectSettings(projectId, snapshot.settings)
  },

  deleteSnapshot: async (projectId, snapshotId) => {
    await deleteSnapshotFromDb(snapshotId)
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] ?? []).filter((s) => s.id !== snapshotId),
      },
    }))
  },

  getSnapshots: (projectId) => get().byProject[projectId] ?? EMPTY_SNAPSHOTS,
}))
