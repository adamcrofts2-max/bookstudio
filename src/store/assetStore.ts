import { create } from 'zustand'

import type { ImageAsset } from '@/types/asset'
import { generateId } from '@/utils'
import { deleteAsset, getAssetBlob, listAssetsForProject, putAsset } from '@/store/assetDb'

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

  getObjectUrl: (assetId) => get().objectUrls[assetId],
}))
