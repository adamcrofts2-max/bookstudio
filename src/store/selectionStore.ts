import { create } from 'zustand'

import { generateId } from '@/utils/id'

interface SelectionState {
  selectedBlockId: string | null
  selectedChapterId: string | null
  /**
   * The currently selected `StructuralPage` id (Cover/Title Page/Copyright/
   * Blank Page — see docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2), or
   * `null`. Mutually exclusive with `selectedBlockId`/`selectedChapterId`:
   * selecting a structural page clears the other two, and vice versa (see
   * `selectStructuralPage`/`select`/`selectForEdit`/`requestScrollToChapter`
   * below) — the Inspector's "Page" tab uses this to decide whether to show
   * `StructuralPagePanel` or the existing read-only project settings.
   */
  selectedStructuralPageId: string | null
  /**
   * The currently selected `CoverElement` id within whichever Cover/Back
   * Cover page is selected (see `structuralPages/coverElementLayer.tsx` and
   * `docs/COVER_CANVAS_PLAN.md`), or `null`. Only ever meaningful while
   * `selectedStructuralPageId` also points at a Cover/Back Cover — every
   * action that changes `selectedStructuralPageId`/`selectedBlockId`/
   * `selectedChapterId` below clears this too, so switching away from a
   * cover can never leave a stale element "selected" against the wrong
   * page.
   */
  selectedCoverElementId: string | null
  /**
   * Non-null means "the current selection was requested with an intent to
   * edit immediately" (e.g. the Virtual Editor's "Edit" action) — a fresh
   * id every time so `Page.tsx` can tell a brand-new edit request apart
   * from a merely-still-selected block, and auto-enter edit mode exactly
   * once per request via `consumeEditRequest`.
   */
  editRequestId: string | null
  /**
   * Where the caret should land once the requested block actually enters
   * edit mode — `'end'` (matching every pre-existing caller: the Virtual
   * Editor's "Edit" action, a fresh block from the "+" inserter, etc.),
   * `'start'`, used by `editorActions.splitParagraphWithHistory`'s caller
   * (`Page.tsx`, wiring `onSplit`) so pressing Enter mid-paragraph lands the
   * cursor at the very beginning of the new second half, or a text-
   * character offset (Phase 112), used by `mergeParagraphWithPreviousHistory`
   * so pressing Backspace at the start of a paragraph lands the cursor
   * exactly at the old seam with the previous paragraph, not at either end.
   * Only meaningful while `editRequestId` is non-null.
   */
  editRequestCaretPosition: 'start' | 'end' | number
  /**
   * Which list item (`ContentBlock.items` array index) `editRequestId`
   * applies to, or `null` (Phase 115, 2026-08-03). Only meaningful when the
   * requested block is a `list` — every other block type ignores it. A
   * `list` block's "block" is the whole `<ul>`/`<ol>`, not one `<li>`, so
   * the block-level `editRequestId` alone can't say *which* item should
   * receive focus after `editorActions.splitListItemWithHistory`/
   * `mergeListItemWithPreviousWithHistory` — this is the item-granularity
   * counterpart, stored here (not local component state) for the same
   * reason `editRequestId` itself is a store field and not a prop threaded
   * down once: it needs to survive a pagination-driven remount of the list
   * block and keep re-triggering `ListItemField`'s auto-focus effect until a
   * real DOM focus lands (see `paragraph.tsx`'s Phase 111 doc comment for
   * the exact race this pattern avoids).
   */
  editRequestItemIndex: number | null
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
  /** `blockId` is nullable because "this chapter is open, no particular
   * block" is a real state: mobile Write has no block-level selection, and
   * `selectedBlockId` has always been `string | null` in the state above —
   * only this signature was narrower than the field it writes. Desktop
   * callers passing a real id are unaffected. */
  select: (chapterId: string, blockId: string | null) => void
  /** Same as `select`, but also flags the selection for immediate editing.
   * `caretPosition` defaults to `'end'` — pass `'start'` for a block whose
   * content is brand new from the caret's perspective (e.g. the second half
   * of a just-split paragraph), or a text-character offset for a block
   * whose content was just merged from two blocks into one (Phase 112), so
   * the cursor doesn't land past content the user hasn't actually looked at
   * yet, or at the wrong end of a merge. `itemIndex` (Phase 115) is only
   * meaningful when `blockId` refers to a `list` block — see
   * `editRequestItemIndex` above. */
  selectForEdit: (chapterId: string, blockId: string, caretPosition?: 'start' | 'end' | number, itemIndex?: number) => void
  /** Selects a structural page (clearing any block/chapter selection) —
   * used by the Sidebar's Structure tab rows and by clicking a structural
   * page directly in the on-screen preview. */
  selectStructuralPage: (pageId: string) => void
  /** Selects (or, passed `null`, deselects) a `CoverElement` on whichever
   * Cover/Back Cover page is currently selected — does not itself touch
   * `selectedStructuralPageId`. */
  selectCoverElement: (elementId: string | null) => void
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
  selectedStructuralPageId: null,
  selectedCoverElementId: null,
  editRequestId: null,
  editRequestCaretPosition: 'end',
  editRequestItemIndex: null,
  scrollRequest: null,
  select: (chapterId, blockId) =>
    set({
      selectedChapterId: chapterId,
      selectedBlockId: blockId,
      selectedStructuralPageId: null,
      selectedCoverElementId: null,
      editRequestId: null,
      editRequestCaretPosition: 'end',
      editRequestItemIndex: null,
    }),
  selectForEdit: (chapterId, blockId, caretPosition: 'start' | 'end' | number = 'end', itemIndex) =>
    set({
      selectedChapterId: chapterId,
      selectedBlockId: blockId,
      selectedStructuralPageId: null,
      selectedCoverElementId: null,
      editRequestId: generateId('edit-request'),
      editRequestCaretPosition: caretPosition,
      editRequestItemIndex: itemIndex ?? null,
    }),
  selectStructuralPage: (pageId) =>
    set({
      selectedStructuralPageId: pageId,
      selectedBlockId: null,
      selectedChapterId: null,
      selectedCoverElementId: null,
      editRequestId: null,
      editRequestCaretPosition: 'end',
      editRequestItemIndex: null,
    }),
  selectCoverElement: (elementId) => set({ selectedCoverElementId: elementId }),
  consumeEditRequest: () => set({ editRequestId: null, editRequestItemIndex: null }),
  requestScrollToChapter: (chapterId) =>
    set({
      selectedChapterId: chapterId,
      selectedStructuralPageId: null,
      scrollRequest: { target: { type: 'chapter', chapterId }, requestId: generateId('scroll-request') },
    }),
  requestScrollToPage: (pageId) =>
    set({ scrollRequest: { target: { type: 'page', pageId }, requestId: generateId('scroll-request') } }),
  requestScrollToBlock: (chapterId, blockId) =>
    set({ scrollRequest: { target: { type: 'block', chapterId, blockId }, requestId: generateId('scroll-request') } }),
  consumeScrollRequest: () => set({ scrollRequest: null }),
  clear: () =>
    set({
      selectedBlockId: null,
      selectedChapterId: null,
      selectedStructuralPageId: null,
      selectedCoverElementId: null,
      editRequestId: null,
      editRequestCaretPosition: 'end',
      editRequestItemIndex: null,
      scrollRequest: null,
    }),
}))
