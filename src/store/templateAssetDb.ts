import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { TemplateAsset } from '@/types/bookTemplate'

/**
 * Image blobs belonging to **templates**, in their own IndexedDB database —
 * the "template-scoped asset storage" `docs/ROADMAP.md` said this feature
 * needed before a template could carry a publisher's mark or a series
 * device (Phase 169).
 *
 * A separate database rather than a second index on `book-studio-assets`,
 * for two reasons. Ownership: project assets are deleted when their project
 * is (`projectDelete.e2e.mjs` exists to prove it), and a template outlives
 * every project it was ever saved from — a template's copy must not be
 * reachable by, or vulnerable to, that sweep. And direction: nothing about
 * a template may depend on a project still existing, which is the whole
 * reason its theme is bundled by value rather than by id.
 *
 * Blobs, not data URLs in `localStorage`: `templateStore` persists there,
 * and a single cover image would eat most of the 5–10MB budget the whole
 * app shares. Only the small metadata record travels in the template
 * itself.
 */
interface TemplateAssetDB extends DBSchema {
  assets: {
    key: string
    value: TemplateAsset
  }
  blobs: {
    key: string
    value: Blob
  }
}

let dbPromise: Promise<IDBPDatabase<TemplateAssetDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TemplateAssetDB>('book-studio-template-assets', 1, {
      upgrade(db) {
        db.createObjectStore('assets', { keyPath: 'id' })
        db.createObjectStore('blobs')
      },
    })
  }
  return dbPromise
}

export async function putTemplateAsset(asset: TemplateAsset, blob: Blob): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['assets', 'blobs'], 'readwrite')
  await Promise.all([tx.objectStore('assets').put(asset), tx.objectStore('blobs').put(blob, asset.id), tx.done])
}

export async function getTemplateAssetBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb()
  return db.get('blobs', id)
}

/**
 * Removes a template's images. Called when a template is deleted — a
 * template's assets have no other owner, so nothing else can free them.
 */
export async function deleteTemplateAssets(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDb()
  const tx = db.transaction(['assets', 'blobs'], 'readwrite')
  await Promise.all([
    ...ids.map((id) => tx.objectStore('assets').delete(id)),
    ...ids.map((id) => tx.objectStore('blobs').delete(id)),
    tx.done,
  ])
}
