import { create } from 'zustand'

import type { ImageAsset } from '@/types/asset'
import { generateId } from '@/utils'
import { deleteAsset, getAssetBlob, listAssetsForProject, putAsset } from '@/store/assetDb'

/**
 * Stable reference for "no assets loaded yet". Selectors must return this
 * instead of a fresh `[]` literal — with Zustand v5's useSyncExternalStore,
 * a selector that returns a new array identity on every call never settles,
 * which trips React's "Maximum update depth exceeded" (#185).
 */
export const EMPTY_ASSETS: readonly ImageAsset[] = []

/** One file that couldn't be imported, and why — named so the UI can say
 * *which* of several picked files was the problem. */
export interface FailedImport {
  name: string
  reason: string
}

/** `importFiles` reports both halves rather than throwing: picking five
 * photos where one is corrupt should import four and explain the fifth, not
 * fail all five. */
export interface ImportResult {
  imported: ImageAsset[]
  failed: FailedImport[]
}

interface AssetStoreState {
  /** Assets currently loaded, keyed by project id. */
  byProject: Record<string, ImageAsset[]>
  /** Object URLs created for the current session, keyed by asset id. */
  objectUrls: Record<string, string>
  loadingProjectId: string | null
}

interface AssetStoreActions {
  loadAssets: (projectId: string) => Promise<void>
  importFiles: (projectId: string, files: File[]) => Promise<ImportResult>
  removeAsset: (projectId: string, assetId: string) => Promise<void>
  /**
   * Re-inserts a previously-removed asset under its own original `id` —
   * the undo half of `removeAsset`, used by `editorActions.ts`'s
   * `removeAssetWithHistory`. Deliberately does NOT reuse `importFiles`'
   * id-generating path: any `ImageBlock.assetId` still referencing the
   * deleted asset (the block itself isn't touched by asset deletion) must
   * keep resolving, so the restored asset has to come back byte-for-byte
   * under the same id, not a fresh one.
   */
  restoreAsset: (projectId: string, asset: ImageAsset, blob: Blob) => Promise<void>
  getObjectUrl: (assetId: string) => string | undefined
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    // `onerror` hands back an Event, not an Error, so rejecting with it raw
    // produced the uninformative "PAGEERROR Event" this used to surface as.
    img.onerror = () => reject(new Error('The file could not be decoded as an image.'))
    img.src = url
  })
}

export const useAssetStore = create<AssetStoreState & AssetStoreActions>()((set, get) => ({
  byProject: {},
  objectUrls: {},
  loadingProjectId: null,

  loadAssets: async (projectId) => {
    set({ loadingProjectId: projectId })
    const assets = await listAssetsForProject(projectId)
    const urls: Record<string, string> = {}
    for (const asset of assets) {
      const blob = await getAssetBlob(asset.id)
      if (blob) urls[asset.id] = URL.createObjectURL(blob)
    }
    set((state) => ({
      byProject: { ...state.byProject, [projectId]: assets },
      objectUrls: { ...state.objectUrls, ...urls },
      loadingProjectId: null,
    }))
  },

  importFiles: async (projectId, files) => {
    const imported: ImageAsset[] = []
    const failed: FailedImport[] = []

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        failed.push({ name: file.name, reason: 'Not an image file.' })
        continue
      }
      const objectUrl = URL.createObjectURL(file)
      // Each file is isolated. Before this, one undecodable file threw out of
      // the whole loop, which (a) surfaced as an unhandled rejection rather
      // than a message, (b) discarded every file picked alongside it, and
      // (c) left the ones already written by `putAsset` orphaned in
      // IndexedDB — stored, but never registered in `byProject`, so nothing
      // could ever list or delete them again.
      try {
        const { width, height } = await readImageDimensions(objectUrl)
        const asset: ImageAsset = {
          id: generateId('asset'),
          projectId,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          width,
          height,
          createdAt: new Date().toISOString(),
        }
        await putAsset(asset, file)
        imported.push(asset)
        set((state) => ({ objectUrls: { ...state.objectUrls, [asset.id]: objectUrl } }))
      } catch (error) {
        // The object URL is only handed to the store on success, so a failed
        // file's must be released here or it leaks for the page's lifetime.
        URL.revokeObjectURL(objectUrl)
        failed.push({ name: file.name, reason: error instanceof Error ? error.message : 'Could not be imported.' })
      }
    }

    set((state) => ({
      byProject: { ...state.byProject, [projectId]: [...(state.byProject[projectId] ?? []), ...imported] },
    }))
    return { imported, failed }
  },

  removeAsset: async (projectId, assetId) => {
    await deleteAsset(assetId)
    const url = get().objectUrls[assetId]
    if (url) URL.revokeObjectURL(url)
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] ?? []).filter((a) => a.id !== assetId),
      },
    }))
  },

  restoreAsset: async (projectId, asset, blob) => {
    await putAsset(asset, blob)
    const objectUrl = URL.createObjectURL(blob)
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: [...(state.byProject[projectId] ?? []).filter((a) => a.id !== asset.id), asset],
      },
      objectUrls: { ...state.objectUrls, [asset.id]: objectUrl },
    }))
  },

  getObjectUrl: (assetId) => get().objectUrls[assetId],
}))
