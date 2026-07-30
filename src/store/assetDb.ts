import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { ImageAsset } from '@/types/asset'

/**
 * Image binaries and their metadata live in IndexedDB, not localStorage —
 * a book can carry thousands of illustrations, and IndexedDB has no
 * practical size ceiling the way `localStorage` (~5–10MB) does. This is
 * the only module that talks to IndexedDB directly; everything else goes
 * through `assetStore`.
 */
interface BookStudioDB extends DBSchema {
  assets: {
    key: string
    value: ImageAsset
    indexes: { 'by-project': string }
  }
  blobs: {
    key: string
    value: Blob
  }
}

let dbPromise: Promise<IDBPDatabase<BookStudioDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BookStudioDB>('book-studio-assets', 1, {
      upgrade(db) {
        const assets = db.createObjectStore('assets', { keyPath: 'id' })
        assets.createIndex('by-project', 'projectId')
        db.createObjectStore('blobs')
      },
    })
  }
  return dbPromise
}

export async function listAssetsForProject(projectId: string): Promise<ImageAsset[]> {
  const db = await getDb()
  return db.getAllFromIndex('assets', 'by-project', projectId)
}

export async function putAsset(asset: ImageAsset, blob: Blob): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['assets', 'blobs'], 'readwrite')
  await Promise.all([
    tx.objectStore('assets').put(asset),
    tx.objectStore('blobs').put(blob, asset.id),
    tx.done,
  ])
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb()
  return db.get('blobs', id)
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['assets', 'blobs'], 'readwrite')
  await Promise.all([tx.objectStore('assets').delete(id), tx.objectStore('blobs').delete(id), tx.done])
}
