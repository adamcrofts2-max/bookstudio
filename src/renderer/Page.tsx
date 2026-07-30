import { useState } from 'react'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { ContentBlock, ImageBlock } from '@/types/content'
import { BlockContent } from '@/renderer/BlockContent'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { useContentStore } from '@/store/contentStore'
import { useDragStore } from '@/store/dragStore'
import { ASSET_DRAG_MIME } from '@/layout/dragTypes'
import { generateId } from '@/utils'
import { cn } from '@/lib/utils'

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
}

const CHAPTER_NUMBER_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
]

export function Page({ projectId, page, pageBox, theme, dropCapBlockIds, toc, bookTitle, language = 'en' }: PageProps) {
  const select = useSelectionStore((s) => s.select)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const editRequestId = useSelectionStore((s) => s.editRequestId)
  const consumeEditRequest = useSelectionStore((s) => s.consumeEditRequest)
  const setInspectorTab = useUiStore((s) => s.setInspectorTab)
  const updateBlock = useContentStore((s) => s.updateBlock)
  const renameChapter = useContentStore((s) => s.renameChapter)
  const insertBlock = useContentStore((s) => s.insertBlock)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))

  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const isRight = page.side === 'right'
  const marginLeft = isRight ? pageBox.marginInnerPx : pageBox.marginOuterPx
  const marginRight = isRight ? pageBox.marginOuterPx : pageBox.marginInnerPx

  const handleSelect = (chapterId: string, block: { id: string; type: string }) => {
    select(chapterId, block.id)
    setInspectorTab(block.type === 'image' ? 'image' : 'typography')
  }

  // Wrapped in a stable `data-block-id` anchor so the Virtual Editor's
  // Locate/Edit actions (via `selectionStore.requestScrollToBlock` /
  // `BookRenderer`'s scroll effect) can scroll to this exact block once
  // its spread is force-mounted, rather than only ever landing on the
  // chapter's opening page. This wrapper is Page.tsx-only — HeightMeasurer
  // renders blocks separately for off-screen measurement and must stay
  // untouched.
  const renderBlock = (block: ContentBlock) => (
    <div key={block.id} data-block-id={block.id}>
      <BlockContent
        block={block}
        theme={theme}
        dropCap={dropCapBlockIds.has(block.id)}
        selected={selectedBlockId === block.id}
        onSelect={() => page.chapterId && handleSelect(page.chapterId, block)}
        editable
        onCommit={(updates) => page.chapterId && updateBlock(projectId, page.chapterId, block.id, updates)}
        autoEdit={selectedBlockId === block.id && editRequestId !== null}
        onAutoEditHandled={consumeEditRequest}
      />
    </div>
  )

  // The chapter this page belongs to spans multiple pages via pagination, so
  // "insert after block X" is chapter-level (chapterId + a block id within
  // `chapter.blocks`), never page-scoped — see `contentStore.insertBlock`.
  const chapter = page.chapterId ? manuscript?.chapters.find((c) => c.id === page.chapterId) : undefined

  const handleDropAsset = (chapterId: string, afterBlockId: string | null, assetId: string) => {
    const newBlock: ImageBlock = {
      id: generateId('block'),
      type: 'image',
      assetId,
      caption: undefined,
      rotation: 0,
      widthPercent: 100,
    }
    insertBlock(projectId, chapterId, afterBlockId, newBlock)
    select(chapterId, newBlock.id)
    setInspectorTab('image')
  }

  /** Interleaves a drop zone before the first block, between every adjacent
   * pair, and after the last — only for chapter content, never TOC/blank
   * pages (this is only ever called from those two page kinds below). */
  const renderBlocksWithDropZones = (blocks: ContentBlock[]) => {
    if (!page.chapterId) return blocks.map(renderBlock)
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

    const nodes: React.ReactNode[] = []
    blocks.forEach((block, i) => {
      const afterId = i === 0 ? firstBlockPrevId() : blocks[i - 1].id
      nodes.push(
        <ImageDropZone key={`drop-${afterId ?? 'start'}`} onDropAsset={(assetId) => handleDropAsset(chapterId, afterId, assetId)} />,
      )
      nodes.push(renderBlock(block))
    })
    if (blocks.length > 0) {
      const lastId = blocks[blocks.length - 1].id
      nodes.push(<ImageDropZone key={`drop-end-${lastId}`} onDropAsset={(assetId) => handleDropAsset(chapterId, lastId, assetId)} />)
    }
    return nodes
  }

  const startRenameTitle = () => {
    if (!page.chapterId) return
    setTitleDraft(page.chapterTitle ?? '')
    setIsRenamingTitle(true)
  }

  const commitRenameTitle = () => {
    if (page.chapterId) renameChapter(projectId, page.chapterId, titleDraft.trim() || page.chapterTitle || 'Untitled')
    setIsRenamingTitle(false)
  }

  const chapterIndex = page.chapterId ? Math.max(0, toc?.findIndex((t) => t.chapterId === page.chapterId) ?? -1) : -1

  return (
    <div
      id={`page-${page.id}`}
      data-chapter-start={page.kind === 'chapter-start' ? page.chapterId : undefined}
      className="relative shrink-0 shadow-[var(--shadow-md)]"
      style={{ width: pageBox.widthPx, height: pageBox.heightPx, background: theme.page.background }}
    >
      {page.kind !== 'blank' && (
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
          top: pageBox.marginTopPx,
          bottom: pageBox.marginBottomPx,
          left: marginLeft,
          right: marginRight,
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
            {theme.chapterOpener.numberLabel !== 'none' && (
              <p
                className="pb-3 text-sm font-medium uppercase tracking-[0.2em]"
                style={{ color: theme.page.accent, fontFamily: theme.fonts.heading }}
              >
                {theme.chapterOpener.numberLabel === 'word'
                  ? `Chapter ${CHAPTER_NUMBER_WORDS[chapterIndex] ?? chapterIndex + 1}`
                  : `${chapterIndex + 1}`}
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
            {renderBlocksWithDropZones(page.blocks)}
          </div>
        )}

        {page.kind === 'content' && renderBlocksWithDropZones(page.blocks)}
      </div>

      {page.kind !== 'blank' && (
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
    </div>
  )
}
