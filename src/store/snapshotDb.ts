import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { Manuscript } from '@/types/content'
import type { ProjectSettings } from '@/types/project'

/**
 * A coarse, whole-manuscript-plus-settings safety net — periodic + manual
 * named snapshots, separate from Phase 14's in-memory undo/redo
 * (`historyStore.ts`), which resets on reload and doesn't reach back
 * further than the current session. Lives in its own IndexedDB database,
 * deliberately kept apart from `book-studio-assets` (see `assetDb.ts`) so
 * this layer never touches asset/blob storage — per `CLAUDE.md`'s
 * layer-separation rule, and because a snapshot never includes asset
 * blobs (they're already safely persisted elsewhere; duplicating
 * potentially large binary data into every snapshot would be wasteful).
 */
export interface Snapshot {
  id: string
  projectId: string
  createdAt: string
  /** e.g. "Autosave" or a user-provided label for manual saves. */
  label: string
  kind: 'auto' | 'manual'
  manuscript: Manuscript
  settings: ProjectSettings
}

interface BookStudioSnapshotDB extends DBSchema {
  snapshots: {
    key: string
    value: Snapshot
    indexes: { 'by-project': string }
  }
}

let dbPromise: Promise<IDBPDatabase<BookStudioSnapshotDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BookStudioSnapshotDB>('book-studio-snapshots', 1, {
      upgrade(db) {
        const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' })
        snapshots.createIndex('by-project', 'projectId')
      },
    })
  }
  return dbPromise
}

export async function putSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await getDb()
  await db.put('snapshots', snapshot)
}

/** Newest-first, so callers never have to re-sort. */
export async function listSnapshotsForProject(projectId: string): Promise<Snapshot[]> {
  const db = await getDb()
  const snapshots = await db.getAllFromIndex('snapshots', 'by-project', projectId)
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('snapshots', id)
}
