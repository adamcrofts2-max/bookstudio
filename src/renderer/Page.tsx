import { useState } from 'react'

import type { LaidOutPage, TocEntry } from '@/renderer/paginate'
import type { PageBox } from '@/renderer/pageGeometry'
import type { ResolvedBookTheme } from '@/theme/presets'
import type { ContentBlock } from '@/types/content'
import { BlockContent } from '@/renderer/BlockContent'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { useContentStore } from '@/store/contentStore'

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

  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const isRight = page.side === 'right'
  const marginLeft = isRight ? pageBox.marginInnerPx : pageBox.marginOuterPx
  const marginRight = isRight ? pageBox.marginOuterPx : pageBox.marginInnerPx

  const handleSelect = (chapterId: string, block: { id: string; type: string }) => {
    select(chapterId, block.id)
    setInspectorTab(block.type === 'image' ? 'image' : 'typography')
  }

  const renderBlock = (block: ContentBlock) => (
    <BlockContent
      key={block.id}
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
  )

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
            {page.blocks.map(renderBlock)}
          </div>
        )}

        {page.kind === 'content' && page.blocks.map(renderBlock)}
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
