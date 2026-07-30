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
  /**
   * Non-null means "scroll the manuscript view to this chapter's opening
   * page, or this exact page" (Sidebar's chapter nav / ThumbnailRail's page
   * thumbnails). A fresh id every time so `BookRenderer` can tell a repeat
   * click apart from a stale request, and force-mount + scroll to it
   * exactly once per request via `consumeScrollRequest`. Needed because
   * `LazySpread` only mounts a spread's real pages once it's scrolled near
   * the viewport — a page further down the book may not have a DOM node to
   * scroll to at all yet, which is why chapter/thumbnail clicks used to
   * silently do nothing some of the time.
   */
  scrollRequest: { target: { type: 'chapter'; chapterId: string } | { type: 'page'; pageId: string }; requestId: string } | null
  select: (chapterId: string, blockId: string) => void
  /** Same as `select`, but also flags the selection for immediate editing. */
  selectForEdit: (chapterId: string, blockId: string) => void
  consumeEditRequest: () => void
  requestScrollToChapter: (chapterId: string) => void
  requestScrollToPage: (pageId: string) => void
  consumeScrollRequest: () => void
  clear: () => void
}

/** Ephemeral selection state — which manuscript block the Inspector is
 * currently showing. Never persisted; resets per session. */
export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedBlockId: null,
  selectedChapterId: null,
  editRequestId: null,
  scrollRequest: null,
  select: (chapterId, blockId) => set({ selectedChapterId: chapterId, selectedBlockId: blockId, editRequestId: null }),
  selectForEdit: (chapterId, blockId) =>
    set({ selectedChapterId: chapterId, selectedBlockId: blockId, editRequestId: generateId('edit-request') }),
  consumeEditRequest: () => set({ editRequestId: null }),
  requestScrollToChapter: (chapterId) =>
    set({
      selectedChapterId: chapterId,
      scrollRequest: { target: { type: 'chapter', chapterId }, requestId: generateId('scroll-request') },
    }),
  requestScrollToPage: (pageId) =>
    set({ scrollRequest: { target: { type: 'page', pageId }, requestId: generateId('scroll-request') } }),
  consumeScrollRequest: () => set({ scrollRequest: null }),
  clear: () => set({ selectedBlockId: null, selectedChapterId: null, editRequestId: null, scrollRequest: null }),
}))
