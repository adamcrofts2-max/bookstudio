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
   * page, this exact page, or this exact block" (Sidebar's chapter nav /
   * ThumbnailRail's page thumbnails / Virtual Editor's Locate & Edit
   * actions). A fresh id every time so `BookRenderer` can tell a repeat
   * click apart from a stale request, and force-mount + scroll to it
   * exactly once per request via `consumeScrollRequest`. Needed because
   * `LazySpread` only mounts a spread's real pages once it's scrolled near
   * the viewport — a page further down the book may not have a DOM node to
   * scroll to at all yet, which is why chapter/thumbnail clicks used to
   * silently do nothing some of the time (and why the Virtual Editor's
   * Locate/Edit had the exact same bug before it was routed through here).
   */
  scrollRequest: {
    target: { type: 'chapter'; chapterId: string } | { type: 'page'; pageId: string } | { type: 'block'; chapterId: string; blockId: string }
    requestId: string
  } | null
  select: (chapterId: string, blockId: string) => void
  /** Same as `select`, but also flags the selection for immediate editing. */
  selectForEdit: (chapterId: string, blockId: string) => void
  consumeEditRequest: () => void
  requestScrollToChapter: (chapterId: string) => void
  requestScrollToPage: (pageId: string) => void
  /** Scrolls to (and force-mounts, if necessary) the exact block within a
   * chapter — used by the Virtual Editor's Locate/Edit actions so they land
   * on the finding's actual page instead of just the chapter's opening
   * page. Does not touch `selectedChapterId`/`selectedBlockId` itself —
   * callers pair this with `select`/`selectForEdit` for that concern. */
  requestScrollToBlock: (chapterId: string, blockId: string) => void
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
  requestScrollToBlock: (chapterId, blockId) =>
    set({ scrollRequest: { target: { type: 'block', chapterId, blockId }, requestId: generateId('scroll-request') } }),
  consumeScrollRequest: () => set({ scrollRequest: null }),
  clear: () => set({ selectedBlockId: null, selectedChapterId: null, editRequestId: null, scrollRequest: null }),
}))
