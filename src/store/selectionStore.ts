import { create } from 'zustand'

interface SelectionState {
  selectedBlockId: string | null
  selectedChapterId: string | null
  select: (chapterId: string, blockId: string) => void
  clear: () => void
}

/** Ephemeral selection state — which manuscript block the Inspector is
 * currently showing. Never persisted; resets per session. */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedBlockId: null,
  selectedChapterId: null,
  select: (chapterId, blockId) => set({ selectedChapterId: chapterId, selectedBlockId: blockId }),
  clear: () => set({ selectedBlockId: null, selectedChapterId: null }),
}))
