import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Where the automatic backup writes, per project.
 *
 * A `FileSystemFileHandle` is the browser's durable reference to a real
 * file the user picked once — it survives reloads and restarts, which is
 * the whole point: it means "keep a copy on this computer" can be a
 * decision the author makes a single time rather than a chore they have to
 * remember. Handles are structured-cloneable but not JSON-serialisable, so
 * they cannot live in a `persist()`-ed Zustand store; IndexedDB is the only
 * place they can be kept. That is why this file exists at all, and why the
 * plain, displayable half of the same record (file name, last-written time)
 * is mirrored into `backupStore.ts` for the UI to read synchronously.
 *
 * Its own database, deliberately apart from `book-studio-assets` and
 * `book-studio-snapshots` (see `assetDb.ts` / `snapshotDb.ts`) — same
 * layer-separation reasoning, and it means clearing backup targets can
 * never disturb a byte of manuscript or asset data.
 */
export interface BackupTarget {
  projectId: string
  /** The picked file itself. Typed loosely so the app still builds where
   * the File System Access API's DOM types aren't available. */
  handle: FileSystemFileHandleish
  fileName: string
  /** ISO timestamp of the last successful write, or undefined if the file
   * has been chosen but never written (which shouldn't outlive one tick —
   * choosing writes immediately). */
  lastBackupAt?: string
}

/** The slice of `FileSystemFileHandle` this app actually uses. */
export interface FileSystemFileHandleish {
  name: string
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface BookStudioBackupDB extends DBSchema {
  targets: {
    key: string
    value: BackupTarget
  }
}

let dbPromise: Promise<IDBPDatabase<BookStudioBackupDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BookStudioBackupDB>('book-studio-backups', 1, {
      upgrade(db) {
        db.createObjectStore('targets', { keyPath: 'projectId' })
      },
    })
  }
  return dbPromise
}

/**
 * Session-scoped fallback for a handle IndexedDB won't take.
 *
 * A real `FileSystemFileHandle` is a platform object and clones fine, but
 * the write can still be refused — private browsing with storage blocked,
 * a browser that hands back something exotic, a quota that just ran out.
 * Failing to *remember* the file for next time is no reason to stop
 * backing up for the next hour of writing, so the target is kept in memory
 * too and read from there first. The consequence is honest by
 * construction: after a reload nothing is stored, `loadBackupStatus` finds
 * no target, and the app goes back to saying this book lives only in the
 * browser — rather than claiming an arrangement it no longer has.
 */
const sessionTargets = new Map<string, BackupTarget>()

export async function putBackupTarget(target: BackupTarget): Promise<void> {
  sessionTargets.set(target.projectId, target)
  try {
    const db = await getDb()
    await db.put('targets', target)
  } catch (err) {
    console.warn('Backup target could not be stored for next session.', err)
  }
}

export async function getBackupTarget(projectId: string): Promise<BackupTarget | undefined> {
  const inMemory = sessionTargets.get(projectId)
  if (inMemory) return inMemory
  try {
    const db = await getDb()
    return await db.get('targets', projectId)
  } catch {
    return undefined
  }
}

export async function deleteBackupTarget(projectId: string): Promise<void> {
  sessionTargets.delete(projectId)
  try {
    const db = await getDb()
    await db.delete('targets', projectId)
  } catch {
    // Nothing to clean up if the database was never reachable.
  }
}
