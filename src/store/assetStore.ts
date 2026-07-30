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

interface AssetStoreState {
  /** Assets currently loaded, keyed by project id. */
  byProject: Record<string, ImageAsset[]>
  /** Object URLs created for the current session, keyed by asset id. */
  objectUrls: Record<string, string>
  loadingProjectId: string | null
}

interface AssetStoreActions {
  loadAssets: (projectId: string) => Promise<void>
  importFiles: (projectId: string, files: File[]) => Promise<ImageAsset[]>
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
    img.onerror = reject
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
    const created: ImageAsset[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const objectUrl = URL.createObjectURL(file)
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
      created.push(asset)
      set((state) => ({ objectUrls: { ...state.objectUrls, [asset.id]: objectUrl } }))
    }
    set((state) => ({
      byProject: { ...state.byProject, [projectId]: [...(state.byProject[projectId] ?? []), ...created] },
    }))
    return created
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
