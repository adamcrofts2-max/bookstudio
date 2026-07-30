import { create } from 'zustand'

interface DragStoreState {
  /** The asset id currently being dragged from the Sidebar's Assets tab, or
   * `null` when no drag is in progress. */
  draggingAssetId: string | null
}

interface DragStoreActions {
  startDraggingAsset: (assetId: string) => void
  stopDraggingAsset: () => void
}

/**
 * Ephemeral, session-only UI state (never persisted) tracking whether an
 * asset thumbnail is currently being dragged, so `Page.tsx` knows whether to
 * mount its between-block drop zones at all. When no drag is in progress the
 * drop zones render nothing — zero DOM, zero layout impact — so normal
 * reading/pagination is completely unaffected; they only occupy space while
 * an image drag-and-drop is actually happening.
 */
export const useDragStore = create<DragStoreState & DragStoreActions>()((set) => ({
  draggingAssetId: null,
  startDraggingAsset: (assetId) => set({ draggingAssetId: assetId }),
  stopDraggingAsset: () => set({ draggingAssetId: null }),
}))
