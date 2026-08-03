import { useMemo, useState } from 'react'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { ContentBlock, ImageBlock } from '@/types/content'
import { Trash2 } from 'lucide-react'
import { BlockContent } from '@/renderer/BlockContent'
import { BlockToolbar } from '@/renderer/BlockToolbar'
import { PageToolbar } from '@/renderer/PageToolbar'
import { NoteIndicatorBadge } from '@/renderer/NoteIndicatorBadge'
import { IdeaIndicatorBadge } from '@/renderer/IdeaIndicatorBadge'
import { SelectionDevelopMenu } from '@/renderer/SelectionDevelopMenu'
import { InsertBlockButton } from '@/renderer/InsertBlockButton'
import { AiDraftInsertDialog } from '@/renderer/AiDraftInsertDialog'
import { createDefaultBlock, type InsertableBlockType } from '@/blocks/defaultContent'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { useContentStore } from '@/store/contentStore'
import {
  editBlock,
  replaceBlockWithHistory,
  insertBlockWithHistory,
  renameChapterWithHistory,
  updatePageContentWithHistory,
  deleteBlockWithHistory,
  duplicateBlockWithHistory,
  moveBlockWithHistory,
  duplicatePageWithHistory,
  deletePageWithHistory,
  movePageWithHistory,
  deletePageBlocksWithHistory,
  deleteChapterWithHistory,
  splitParagraphWithHistory,
  mergeParagraphWithPreviousHistory,
  splitListItemWithHistory,
  mergeListItemWithPreviousWithHistory,
} from '@/store/editorActions'
import { useDragStore } from '@/store/dragStore'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { getChapterNumberLabel } from '@/renderer/chapterOpenerLabel'
import { generateId } from '@/utils'
import { cn } from '@/lib/utils'

/**
 * Headroom (px) added around the content-flow container beyond the page's
 * own safe margin, purely so hover overlays that hang outside a block's own
 * box (`BlockToolbar`'s `-top-3`, `NoteIndicatorBadge`'s `-top-3`) have
 * somewhere to render without being clipped by that container's own
 * `overflow-hidden` when the block is first/last in the page's flow. See the
 * doc comment on the content-flow container below (Phase 89) for the full
 * root-cause explanation. Comfortably larger than the 12px (`-top-3`) any
 * current overlay uses.
 */
const BLOCK_OVERLAY_BUFFER_PX = 16

/**
 * Thin drop target rendered between two adjacent blocks (or before the
 * first / after the last) so a dragged asset thumbnail can be placed there.
 * Renders nothing at all — zero DOM — while no drag is in progress, so it
 * has no effect on normal reading/pagination; it only occupies space during
 * an actual image drag-and-drop.
 */
function ImageDropZone({ onDropAsset }: { onDropAsset: (assetId: string) => void }) {
  const draggingAssetId = useDragStore((s) => s.draggingAssetId)
  const [isOver, setIsOver] = useState(false)

  if (!draggingAssetId) return null

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME) || draggingAssetId
        if (assetId) onDropAsset(assetId)
      }}
      className={cn('rounded-sm transition-[height,background-color] duration-100', isOver ? 'my-1' : 'my-0.5')}
      style={{
        height: isOver ? 28 : 6,
        background: isOver ? 'var(--color-accent)' : 'var(--color-selection)',
        opacity: isOver ? 1 : 0.6,
      }}
    />
  )
}

interface PageProps {
  projectId: string
  page: LaidOutPage
  pageBox: PageBox
  theme: ResolvedBookTheme
  dropCapBlockIds: Set<string>
  toc?: TocEntry[]
  bookTitle: string
  language?: string
  /**
   * True when this is a miniature, non-interactive copy of the page — used
   * by `ThumbnailPage.tsx` to render the exact same components (true
   * WYSIWYG, per `CLAUDE.md`'s Editor Philosophy) at a tiny CSS-transformed
   * scale, instead of a fake placeholder box. Two correctness concerns this
   * flag exists to prevent, not just cosmetic ones:
   *   1. Duplicate DOM `id`/`data-block-id`/`data-chapter-start` — the real
   *      page and its thumbnail render the same block/page ids
   *      simultaneously; `BookRenderer`'s scroll-to-block/-page/-chapter
   *      logic uses `getElementById`/`querySelector`, which would silently
   *      grab whichever copy appears first in the DOM (the thumbnail rail
   *      renders before the main content) and scroll the wrong one.
   *   2. Stray interactivity in a 68px-wide copy — `editable={false}` keeps
   *      contentEditable (and its keyboard-focus/tab path, which a
   *      `pointer-events-none` wrapper alone doesn't block) out of
   *      thumbnails entirely, and toolbars/drop-zones are skipped outright
   *      rather than merely hidden, so hundreds of thumbnail pages across a
   *      long book don't each mount their own drag-and-drop/selection
   *      subscriptions for no benefit.
   * `ThumbnailPage.tsx`'s wrapping `pointer-events-none` div is defense in
   * depth on top of this, not a substitute for it.
   */
  decorative?: boolean
}


export function Page({ projectId, page, pageBox, theme, dropCapBlockIds, toc, bookTitle, language = 'en', decorative = false }: PageProps) {
  const select = useSelectionStore((s) => s.select)
  const clearSelection = useSelectionStore((s) => s.clear)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const editRequestId = useSelectionStore((s) => s.editRequestId)
  const editRequestCaretPosition = useSelectionStore((s) => s.editRequestCaretPosition)
  const editRequestItemIndex = useSelectionStore((s) => s.editRequestItemIndex)
  const consumeEditRequest = useSelectionStore((s) => s.consumeEditRequest)
  const selectForEdit = useSelectionStore((s) => s.selectForEdit)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)
  const selectStructuralPage = useSelectionStore((s) => s.selectStructuralPage)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const structuralPages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)

  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  // Which gap's "AI Draft…" menu item was clicked, if any — carries the
  // exact chapter + insert position `AiDraftInsertDialog.tsx` needs, the
  // same `(chapterId, afterBlockId)` pair every other insert path in this
  // file already threads through. `null` means the dialog is closed.
  const [aiDraftTarget, setAiDraftTarget] = useState<{ chapterId: string; afterBlockId: string | null } | null>(null)

  const isRight = page.side === 'right'
  const marginLeft = isRight ? pageBox.marginInnerPx : pageBox.marginOuterPx
  const marginRight = isRight ? pageBox.marginOuterPx : pageBox.marginInnerPx

  const handleSelect = (chapterId: string, block: { id: string; type: string }) => {
    select(chapterId, block.id)
    setInspectorTab(block.type === 'image' ? 'image' : 'typography')
  }

  // The chapter this page belongs to spans multiple pages via pagination, so
  // "insert after block X" is chapter-level (chapterId + a block id within
  // `chapter.blocks`), never page-scoped — see `contentStore.insertBlock`.
  // Declared before `renderBlock` (rather than relying on closure hoisting)
  // since the toolbar's move-up/down bounds need the full chapter's block
  // list, not just this page's slice.
  const chapter = page.chapterId ? manuscript?.chapters.find((c) => c.id === page.chapterId) : undefined

  // Memoised on the joined id list rather than `page.blocks` itself —
  // `paginate.ts` rebuilds `LaidOutPage` objects (and their `blocks`
  // arrays) on every layout pass, so the array reference changes far more
  // often than its actual contents. `SelectionDevelopMenu` re-subscribes
  // its `selectionchange` listener whenever this identity changes, so a
  // stable identity across content-preserving re-renders avoids needlessly
  // flapping that listener on every keystroke elsewhere in the book.
  const pageBlockIds = useMemo(() => new Set(page.blocks.map((b) => b.id)), [page.blocks.map((b) => b.id).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrapped in a stable `data-block-id` anchor so the Virtual Editor's
  // Locate/Edit actions (via `selectionStore.requestScrollToBlock` /
  // `BookRenderer`'s scroll effect) can scroll to this exact block once
  // its spread is force-mounted, rather than only ever landing on the
  // chapter's opening page. This wrapper is Page.tsx-only — HeightMeasurer
  // renders blocks separately for off-screen measurement and must stay
  // untouched. The `group/block relative` classes exist solely to host
  // `BlockToolbar`'s hover reveal (`group-hover/block:opacity-100`) — a
  // *named* group, not the outer page container's plain `group/page`, so
  // hovering the page doesn't also reveal every block's toolbar at once —
  // see `BlockToolbar.tsx`'s doc comment for the bug this fixes.
  const renderBlock = (block: ContentBlock) => {
    const chapterId = page.chapterId
    const indexInChapter = chapter ? chapter.blocks.findIndex((b) => b.id === block.id) : -1
    const canMoveUp = indexInChapter > 0
    const canMoveDown = !!chapter && indexInChapter >= 0 && indexInChapter < chapter.blocks.length - 1
    const isSelected = !decorative && selectedBlockId === block.id
    // Backspace-at-start-merges-with-previous (Phase 112) only makes sense
    // paragraph-into-paragraph — mirrors `onSplit`'s "only `paragraph`" scope
    // below. Computed here (not inside `mergeParagraphWithPreviousHistory`)
    // so `onMergeWithPrevious` is only ever passed when it would actually do
    // something, the same reasoning `canMoveUp`/`canMoveDown` already use.
    const previousBlockInChapter = indexInChapter > 0 && chapter ? chapter.blocks[indexInChapter - 1] : undefined
    const canMergeWithPrevious = block.type === 'paragraph' && previousBlockInChapter?.type === 'paragraph'

    return (
      <div key={block.id} data-block-id={decorative ? undefined : block.id} className="group/block relative">
        <BlockContent
          block={block}
          theme={theme}
          dropCap={dropCapBlockIds.has(block.id)}
          selected={isSelected}
          onSelect={decorative ? undefined : () => chapterId && handleSelect(chapterId, block)}
          editable={!decorative}
          onCommit={decorative ? undefined : (updates) => chapterId && editBlock(projectId, chapterId, block.id, updates)}
          onSplit={
            decorative
              ? undefined
              : (before, after) => {
                  if (!chapterId) return
                  const newBlockId = splitParagraphWithHistory(projectId, chapterId, block.id, before, after)
                  if (newBlockId) selectForEdit(chapterId, newBlockId, 'start')
                }
          }
          onMergeWithPrevious={
            decorative || !canMergeWithPrevious
              ? undefined
              : () => {
                  if (!chapterId) return
                  const result = mergeParagraphWithPreviousHistory(projectId, chapterId, block.id)
                  if (result) selectForEdit(chapterId, result.mergedBlockId, result.caretOffset)
                }
          }
          onSplitListItem={
            decorative || block.type !== 'list'
              ? undefined
              : (itemIndex, before, after) => {
                  if (!chapterId) return
                  const ok = splitListItemWithHistory(projectId, chapterId, block.id, itemIndex, before, after)
                  if (ok) selectForEdit(chapterId, block.id, 'start', itemIndex + 1)
                }
          }
          onMergeListItemWithPrevious={
            decorative || block.type !== 'list'
              ? undefined
              : (itemIndex) => {
                  if (!chapterId || itemIndex <= 0) return
                  const caretOffset = mergeListItemWithPreviousWithHistory(projectId, chapterId, block.id, itemIndex)
                  if (caretOffset !== undefined) selectForEdit(chapterId, block.id, caretOffset, itemIndex - 1)
                }
          }
          autoEdit={isSelected && editRequestId !== null}
          autoEditCaretPosition={editRequestCaretPosition}
          autoEditItemIndex={editRequestItemIndex}
          onAutoEditHandled={consumeEditRequest}
          projectId={decorative ? undefined : projectId}
          onReplace={decorative ? undefined : (newBlock) => chapterId && replaceBlockWithHistory(projectId, chapterId, block.id, newBlock)}
        />
        {chapterId && !decorative && (
          // Phases 84-87 each gave the Idea badge its own independently
          // positioned corner (top-right, bottom-right, shared top-left
          // with Notes, then a positive inset top-left) and each attempt
          // broke a different way — colliding with this exact toolbar,
          // with the next block's own toolbar, with the next block's own
          // badge, and finally with the block's own text. Root cause was
          // never "wrong corner": it's that an always-visible, absolutely
          // positioned overlay can't coexist safely with manuscript blocks
          // packed edge-to-edge with zero padding. `BlockToolbar` itself
          // has never had this problem because it's hover-gated — only one
          // block's toolbar is ever visible at a time, so cross-block
          // collision is structurally impossible. Phase 88 moves the Idea
          // indicator into that proven container via its `children` slot
          // instead of inventing a fifth position. Trade-off: no longer
          // glanceable without hovering — `NotesPanel.tsx`'s
          // `IdeasLinkedHere` (Inspector → Notes tab) is the always-visible
          // path once a block is selected.
          <BlockToolbar
            selected={isSelected}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={() => moveBlockWithHistory(projectId, chapterId, block.id, 'up')}
            onMoveDown={() => moveBlockWithHistory(projectId, chapterId, block.id, 'down')}
            onDuplicate={() => {
              const newId = duplicateBlockWithHistory(projectId, chapterId, block.id)
              if (newId) handleSelect(chapterId, { id: newId, type: block.type })
            }}
            onDelete={() => {
              deleteBlockWithHistory(projectId, chapterId, block.id)
              if (isSelected) clearSelection()
            }}
            breakAfter={block.breakAfter}
            onToggleBreakAfter={() => editBlock(projectId, chapterId, block.id, { breakAfter: !block.breakAfter })}
          >
            <IdeaIndicatorBadge projectId={projectId} blockId={block.id} />
          </BlockToolbar>
        )}
        {chapterId && !decorative && (
          // Restored to its pre-Phase-83 standalone position — Notes alone
          // (without Ideas sharing the spot) never had a collision problem,
          // so only Ideas needed to move.
          <NoteIndicatorBadge
            projectId={projectId}
            blockId={block.id}
            className="absolute -top-3 left-2 z-10"
            onClick={() => {
              select(chapterId, block.id)
              setInspectorTab('notes')
            }}
          />
        )}
      </div>
    )
  }

  const handleDropAsset = (chapterId: string, afterBlockId: string | null, assetId: string) => {
    const newBlock: ImageBlock = {
      id: generateId('block'),
      type: 'image',
      assetId,
      caption: undefined,
      rotation: 0,
      widthPercent: 100,
    }
    insertBlockWithHistory(projectId, chapterId, afterBlockId, newBlock)
    select(chapterId, newBlock.id)
    setInspectorTab('image')
  }

  const handleInsertBlock = (chapterId: string, afterBlockId: string | null, type: InsertableBlockType) => {
    const newBlock = createDefaultBlock(type)
    insertBlockWithHistory(projectId, chapterId, afterBlockId, newBlock)
    handleSelect(chapterId, newBlock)
  }

  /** Interleaves a drop zone + "insert block" button before the first block,
   * between every adjacent pair, and after the last — only for chapter
   * content, never TOC/blank pages (this is only ever called from those two
   * page kinds below). */
  const renderBlocksWithDropZones = (blocks: ContentBlock[]) => {
    // Thumbnails skip drop zones/insert buttons outright (not just visually
    // hidden) — see `decorative`'s doc comment on why.
    if (!page.chapterId || decorative) return blocks.map(renderBlock)
    const chapterId = page.chapterId

    // This page's first block may be a mid-chapter continuation (pagination
    // split it across pages), not the chapter's actual first block — so the
    // "before the first block on this page" drop zone needs the real
    // preceding sibling from the full chapter, not just this page's slice.
    const firstBlockPrevId = (): string | null => {
      if (blocks.length === 0 || !chapter) return null
      const idx = chapter.blocks.findIndex((b) => b.id === blocks[0].id)
      return idx > 0 ? chapter.blocks[idx - 1].id : null
    }

    const renderGap = (afterId: string | null, emptyChapter?: boolean) => (
      <div key={`gap-${afterId ?? 'start'}`}>
        {/* Already self-hides unless an image is actively being dragged
         * (returns `null` otherwise) — safe to always render, including for
         * the empty-chapter prompt below, so dropping a photo still works
         * as a chapter's very first block. */}
        <ImageDropZone onDropAsset={(assetId) => handleDropAsset(chapterId, afterId, assetId)} />
        <InsertBlockButton
          projectId={projectId}
          onInsert={(type) => handleInsertBlock(chapterId, afterId, type)}
          onInsertImage={(assetId) => handleDropAsset(chapterId, afterId, assetId)}
          onInsertAiDraft={() => setAiDraftTarget({ chapterId, afterBlockId: afterId })}
          emptyChapter={emptyChapter}
        />
      </div>
    )

    // A brand-new chapter (just added via the Sidebar's "+", never written
    // in) has a title but zero blocks — `page.blocks` is `[]`. The loop
    // below only ever renders a gap adjacent to an existing block, so with
    // no blocks to iterate it silently rendered nothing at all: a new
    // chapter had no visible way to add its first paragraph, not even on
    // hover, since there was no drop zone anywhere on the page. One
    // explicit "start" gap (the same button every other gap uses, just
    // with no preceding block) fixes that — found during a live UX audit
    // of Planning mode (docs/STATUS.md, 2026-08-02): a first-time author
    // following the "outline in Planning, then write" workflow got stuck
    // at the very first sentence of a fresh chapter.
    if (blocks.length === 0) {
      return [renderGap(null, true)]
    }

    const nodes: React.ReactNode[] = []
    blocks.forEach((block, i) => {
      const afterId = i === 0 ? firstBlockPrevId() : blocks[i - 1].id
      nodes.push(renderGap(afterId))
      nodes.push(renderBlock(block))
    })
    if (blocks.length > 0) {
      nodes.push(renderGap(blocks[blocks.length - 1].id))
    }
    return nodes
  }

  const startRenameTitle = () => {
    if (!page.chapterId) return
    setTitleDraft(page.chapterTitle ?? '')
    setIsRenamingTitle(true)
  }

  const commitRenameTitle = () => {
    if (page.chapterId) renameChapterWithHistory(projectId, page.chapterId, titleDraft.trim() || page.chapterTitle || 'Untitled')
    setIsRenamingTitle(false)
  }

  const chapterIndex = page.chapterId ? Math.max(0, toc?.findIndex((t) => t.chapterId === page.chapterId) ?? -1) : -1

  // Structural pages (Cover/Title Page/Copyright/Blank Page — see
  // docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2) are looked up by id from
  // `structuralPageStore` rather than carried on `LaidOutPage` itself
  // (which only has `structuralPageId`, populated by `composePages.ts`).
  const structuralPage =
    page.kind === 'structural' && page.structuralPageId
      ? structuralPages.find((p) => p.id === page.structuralPageId)
      : undefined
  const structuralDef = structuralPage ? getStructuralPageTypeDefinition(structuralPage.type) : undefined

  // Move-up/down availability mirrors `structuralPageStore.movePage`'s own
  // boundary check (same-category siblings, ordered) — computed here purely
  // to grey out the buttons at a boundary; `movePageWithHistory` itself is
  // already a safe no-op past the edge, same pattern as `Sidebar.tsx`'s rows.
  const structuralSiblingsInCategory = structuralPage
    ? structuralPages.filter((p) => p.category === structuralPage.category).sort((a, b) => a.order - b.order)
    : []
  const structuralIndexInCategory = structuralPage
    ? structuralSiblingsInCategory.findIndex((p) => p.id === structuralPage.id)
    : -1
  const isStructuralPageSelected = !decorative && !!structuralPage && selectedStructuralPageId === structuralPage.id

  return (
    <div
      id={decorative ? undefined : `page-${page.id}`}
      data-chapter-start={!decorative && page.kind === 'chapter-start' ? page.chapterId : undefined}
      className="group/page relative shrink-0 shadow-[var(--shadow-md)]"
      style={{ width: pageBox.widthPx, height: pageBox.heightPx, background: theme.page.background }}
    >
      {page.kind === 'structural' && structuralPage && structuralDef && (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <structuralDef.Render
              page={structuralPage}
              theme={theme}
              pageBox={pageBox}
              projectId={projectId}
              siblingPages={structuralPages}
              selected={isStructuralPageSelected}
              onSelect={
                decorative
                  ? () => {}
                  : () => {
                      selectStructuralPage(structuralPage.id)
                      setInspectorTab('page')
                    }
              }
              onCommit={decorative ? () => {} : (updates) => updatePageContentWithHistory(projectId, structuralPage.id, updates)}
            />
          </div>
          {!decorative && (
            <PageToolbar
              selected={isStructuralPageSelected}
              canMoveUp={structuralIndexInCategory > 0}
              canMoveDown={structuralIndexInCategory >= 0 && structuralIndexInCategory < structuralSiblingsInCategory.length - 1}
              onMoveUp={() => movePageWithHistory(projectId, structuralPage.id, 'up')}
              onMoveDown={() => movePageWithHistory(projectId, structuralPage.id, 'down')}
              onDuplicate={() => {
                const newId = duplicatePageWithHistory(projectId, structuralPage.id)
                if (newId) {
                  selectStructuralPage(newId)
                  setInspectorTab('page')
                }
              }}
              onDelete={() => {
                deletePageWithHistory(projectId, structuralPage.id)
                if (isStructuralPageSelected) clearSelection()
              }}
            />
          )}
          {!decorative && (
            <NoteIndicatorBadge
              projectId={projectId}
              structuralPageId={structuralPage.id}
              className="absolute left-2 top-2 z-10"
              onClick={() => {
                selectStructuralPage(structuralPage.id)
                setInspectorTab('notes')
              }}
            />
          )}
        </>
      )}

      {(page.kind === 'chapter-start' || page.kind === 'content') && page.chapterId && page.blocks.length > 0 && !decorative && (
        <PageToolbar
          selected={false}
          deleteLabel="Delete page content"
          onDelete={() => {
            deletePageBlocksWithHistory(
              projectId,
              page.chapterId as string,
              page.blocks.map((b) => b.id),
            )
            clearSelection()
          }}
        />
      )}

      {page.kind !== 'blank' && page.kind !== 'structural' && (
        <div
          className="absolute text-center text-[10px] font-medium uppercase tracking-[0.12em]"
          style={{
            top: pageBox.marginTopPx * 0.35,
            left: marginLeft,
            right: marginRight,
            color: theme.page.mutedInk,
            display: page.kind === 'content' ? 'block' : 'none',
          }}
        >
          {page.chapterTitle ?? bookTitle}
        </div>
      )}

      <div
        lang={language}
        className="absolute overflow-hidden"
        style={{
          // Phase 89 — this container's own `overflow-hidden` box previously
          // started at EXACTLY `marginTopPx`/`marginBottomPx`, i.e. flush
          // with the printable safe margin, with zero headroom above or
          // below it. That's the actual root cause behind every "badge cut
          // off at the top" report (Phases 87-88): it was never about page
          // clipping in general (there's plenty of room in the page's own
          // margin) — it was this specific container clipping ITSELF at its
          // own top/bottom edge. A block that happens to be first/last in
          // the flow has its own top/bottom edge at this container's local
          // y=0, so anything hanging outside the block's box (BlockToolbar's
          // `-top-3`, NoteIndicatorBadge's `-top-3`) pokes into negative
          // local coordinates and gets clipped by *this* div, regardless of
          // how generous the page's actual margin is. Confirmed live: a
          // paragraph flush at a content page's top edge clipped the Note
          // badge while an interior block's identical badge rendered fine.
          // Fix: pull this container's top/bottom edge outward by a small
          // buffer and compensate with equal padding, so text still starts
          // at the exact same visual position (pagination-neutral — nothing
          // about block flow or measured heights changes) but the clip box
          // now has genuine headroom for a `-top-3`/`-bottom-3` overlay.
          // Clamped to the actual margin so a project with a smaller-than-
          // buffer safe margin can't push the container above the page's
          // own bounds.
          top: pageBox.marginTopPx - Math.min(BLOCK_OVERLAY_BUFFER_PX, pageBox.marginTopPx),
          bottom: pageBox.marginBottomPx - Math.min(BLOCK_OVERLAY_BUFFER_PX, pageBox.marginBottomPx),
          left: marginLeft,
          right: marginRight,
          paddingTop: Math.min(BLOCK_OVERLAY_BUFFER_PX, pageBox.marginTopPx),
          paddingBottom: Math.min(BLOCK_OVERLAY_BUFFER_PX, pageBox.marginBottomPx),
        }}
      >
        {page.kind === 'toc' && (
          <div>
            <h1 className="pb-8 text-3xl" style={{ fontFamily: theme.fonts.heading, color: theme.page.ink }}>
              Contents
            </h1>
            <ul className="flex flex-col gap-3">
              {(toc ?? []).map((entry) => (
                <li
                  key={entry.chapterId}
                  className="flex items-baseline gap-2 text-sm"
                  style={{ fontFamily: theme.fonts.body, color: theme.page.ink }}
                >
                  <span>{entry.title}</span>
                  <span className="flex-1 border-b border-dotted" style={{ borderColor: theme.page.ruleColor }} />
                  <span style={{ color: theme.page.mutedInk }}>{entry.pageNumber}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {page.kind === 'chapter-start' && (
          <div style={{ paddingTop: theme.chapterOpener.topSpacer }}>
            {/*
             * `group/title` wraps just the number-label + title, not the
             * whole chapter-opener div, so the delete-chapter icon below
             * only reveals on hovering the title itself — not anywhere on
             * this page's body content (that's `group/page`'s job, for
             * "delete page content" — see `PageToolbar`). A plain wrapper
             * div adds no padding/margin/border, so it doesn't change this
             * block's total rendered height — `HeightMeasurer.tsx`'s opener-
             * header measurement (Phase 31) stays accurate without needing
             * to mirror this wrapper.
             */}
            <div className="group/title relative">
              {getChapterNumberLabel(theme, chapterIndex) !== null && (
                <p
                  className="pb-3 text-sm font-medium uppercase tracking-[0.2em]"
                  style={{ color: theme.page.accent, fontFamily: theme.fonts.heading }}
                >
                  {getChapterNumberLabel(theme, chapterIndex)}
                </p>
              )}
              {isRenamingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitRenameTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLInputElement).blur()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setIsRenamingTitle(false)
                    }
                  }}
                  className="mb-10 w-full rounded-sm bg-transparent text-4xl outline outline-2 outline-[var(--color-warning)]"
                  style={{ fontFamily: theme.fonts.heading, fontWeight: theme.typography.headingWeight, color: theme.page.ink }}
                />
              ) : (
                <h1
                  onDoubleClick={startRenameTitle}
                  className="cursor-pointer pb-10 text-4xl"
                  style={{ fontFamily: theme.fonts.heading, fontWeight: theme.typography.headingWeight, color: theme.page.ink }}
                >
                  {page.chapterTitle}
                </h1>
              )}
              {!decorative && page.chapterId && !isRenamingTitle && (
                <button
                  type="button"
                  onClick={() => {
                    deleteChapterWithHistory(projectId, page.chapterId as string)
                    clearSelection()
                  }}
                  aria-label={`Delete chapter ${page.chapterTitle}`}
                  title="Delete chapter (title + all its content)"
                  className="absolute right-0 top-0 z-10 flex size-6 items-center justify-center rounded-[var(--radius-preview)] text-text-secondary opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-danger group-hover/title:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            {renderBlocksWithDropZones(page.blocks)}
          </div>
        )}

        {page.kind === 'content' && renderBlocksWithDropZones(page.blocks)}
      </div>

      {(page.kind === 'chapter-start' || page.kind === 'content') && page.chapterId && !decorative && page.blocks.length > 0 && (
        <SelectionDevelopMenu projectId={projectId} chapterId={page.chapterId} blockIds={pageBlockIds} />
      )}

      {page.kind !== 'blank' && page.kind !== 'structural' && (
        <div
          className="absolute text-[11px]"
          style={{
            bottom: pageBox.marginBottomPx * 0.4,
            left: isRight ? undefined : marginLeft,
            right: isRight ? marginRight : undefined,
            color: theme.page.mutedInk,
            fontFamily: theme.fonts.body,
          }}
        >
          {page.number}
        </div>
      )}

      {aiDraftTarget && (
        <AiDraftInsertDialog
          projectId={projectId}
          chapterId={aiDraftTarget.chapterId}
          afterBlockId={aiDraftTarget.afterBlockId}
          open
          onOpenChange={(next) => {
            if (!next) setAiDraftTarget(null)
          }}
          onInserted={(firstBlockId) => handleSelect(aiDraftTarget.chapterId, { id: firstBlockId, type: 'paragraph' })}
        />
      )}
    </div>
  )
}
