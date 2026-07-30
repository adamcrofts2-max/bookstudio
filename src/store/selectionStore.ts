import { create } from 'zustand'

import { generateId } from '@/utils/id'

interface SelectionState {
  selectedBlockId: string | null
  selectedChapterId: string | null
  /**
   * Non-null means "the current selection was requested with an intent to
   * edit immediately" (e.g. the Virtual Editor's "Edit" action) — a fresh
   * id every time so `Page.tsx` can tell a brand-new edit request apart
   * from a merely-still-selected block, and auto-enter edit mode exactly
   * once per request via `consumeEditRequest`.
   */
  editRequestId: string | null
  select: (chapterId: string, blockId: string) => void
  /** Same as `select`, but also flags the selection for immediate editing. */
  selectForEdit: (chapterId: string, blockId: string) => void
  consumeEditRequest: () => void
  clear: () => void
}

/** Ephemeral selection state — which manuscript block the Inspector is
 * currently showing. Never persisted; resets per session. */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedBlockId: null,
  selectedChapterId: null,
  editRequestId: null,
  select: (chapterId, blockId) => set({ selectedChapterId: chapterId, selectedBlockId: blockId, editRequestId: null }),
  selectForEdit: (chapterId, blockId) =>
    set({ selectedChapterId: chapterId, selectedBlockId: blockId, editRequestId: generateId('edit-request') }),
  consumeEditRequest: () => set({ editRequestId: null }),
  clear: () => set({ selectedBlockId: null, selectedChapterId: null, editRequestId: null }),
}))
