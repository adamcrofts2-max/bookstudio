import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The displayable half of a project's backup arrangement — what the UI
 * needs to render synchronously, without awaiting IndexedDB on every
 * paint. The file handle itself lives in `backupDb.ts` (it can't be
 * serialised); this is the record of what that handle is called and when
 * it was last written to, which is the part a person actually reads.
 *
 * Nothing here is authoritative: `backupDb` is. If the two ever disagree —
 * a handle revoked from browser settings, a project file deleted from disk
 * — the next write reconciles them by recording a real error against the
 * project, which is exactly what the user needs to see.
 */
export interface BackupStatus {
  fileName: string
  lastBackupAt?: string
  /** Set when a write failed or permission was withdrawn, cleared on the
   * next success. Shown verbatim, so it has to read as a sentence. */
  error?: string
  /** True while the browser will need a click before it can write again —
   * a file handle restored from a previous session starts in `'prompt'`,
   * and permission can only be requested from a user gesture. */
  needsPermission?: boolean
}

interface BackupState {
  byProject: Record<string, BackupStatus>
  /** Whether `navigator.storage.persist()` has been asked once on this
   * install. In Firefox that call is a visible prompt, so asking on every
   * launch would be its own kind of rude — see `storageHealth.ts`. */
  persistenceRequested: boolean
}

interface BackupActions {
  setStatus: (projectId: string, status: BackupStatus) => void
  patchStatus: (projectId: string, patch: Partial<BackupStatus>) => void
  clearStatus: (projectId: string) => void
  markPersistenceRequested: () => void
}

export const useBackupStore = create<BackupState & BackupActions>()(
  persist(
    (set) => ({
      byProject: {},
      persistenceRequested: false,
      setStatus: (projectId, status) => set((state) => ({ byProject: { ...state.byProject, [projectId]: status } })),
      patchStatus: (projectId, patch) =>
        set((state) => {
          const existing = state.byProject[projectId]
          if (!existing) return state
          return { byProject: { ...state.byProject, [projectId]: { ...existing, ...patch } } }
        }),
      clearStatus: (projectId) =>
        set((state) => {
          if (!(projectId in state.byProject)) return state
          const next = { ...state.byProject }
          delete next[projectId]
          return { byProject: next }
        }),
      markPersistenceRequested: () => set({ persistenceRequested: true }),
    }),
    { name: 'book-studio.backups' },
  ),
)

export function backupStatusFor(projectId: string): BackupStatus | undefined {
  return useBackupStore.getState().byProject[projectId]
}
