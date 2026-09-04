import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MobileTextField } from '@/layout/mobile/MobileTextField'
import { useContentStore } from '@/store/contentStore'
import { useAssetStore } from '@/store/assetStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useTypewriterMode } from '@/hooks/useTypewriterMode'
import {
  editBlock,
  insertBlockWithHistory,
  mergeParagraphWithPreviousHistory,
  splitHeadingIntoParagraphWithHistory,
  splitParagraphWithHistory,
} from '@/store/editorActions'
import { resolveTheme } from '@/theme'
import { createDefaultBlock } from '@/blocks/defaultContent'
import { wordCount } from '@/utils/format'
import type { Project } from '@/types'
import type { ContentBlock } from '@/types/content'

interface MobileFocusWriteViewProps {
  project: Project
}

/**
 * Distraction-free writing on a phone — the mobile answer to desktop's
 * `FocusModeLayout`.
 *
 * **Why this doesn't render the real paginated page.** Desktop Focus mode
 * puts `BookRenderer`'s actual laid-out pages full-screen, which works
 * because a 6x9in page is ~680px wide and a desktop viewport is wider still.
 * A phone is ~390px. Showing the same page means either scaling it to ~0.55
 * (body text lands around 8px — legible to look at, impossible to write in)
 * or letting the page overflow and asking the writer to pan sideways
 * mid-sentence. Neither is "writing straight into the book"; both are
 * "squinting at a picture of the book".
 *
 * So this takes the book's *typographic identity* rather than its page
 * geometry: the theme's real body and heading fonts, its exact body size,
 * line height, justification and drop-cap setting, its paper colour and ink
 * — all of it read from the same `resolveTheme` the printed page uses, so
 * changing the theme changes this screen too. The measure is set to the
 * phone instead of the page. What you type looks like the book because it
 * *is* the book's typography, at a size a thumb can actually write at.
 *
 * Everything else is stripped: no app header, no tab bar, no block cards, no
 * outlines until a field is being edited. Chrome is one exit control and a
 * chapter name that fades out of the way while writing.
 *
 * Editing reuses `MobileTextField`, the same component ordinary mobile Write
 * uses, so Enter-splits-the-paragraph and Backspace-joins-upward behave
 * identically here (Phase 139). Two editors for one manuscript that drift
 * apart is precisely the bug class Phase 139 had to untangle.
 */
export function MobileFocusWriteView({ project }: MobileFocusWriteViewProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const typewriterMode = useUiStore((s) => s.typewriterMode)
  const toggleTypewriterMode = useUiStore((s) => s.toggleTypewriterMode)
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectChapter = useSelectionStore((s) => s.select)
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)

  const chapters = useMemo(() => manuscript?.chapters ?? [], [manuscript])
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [chrome, setChrome] = useState(true)

  // Follow whatever chapter the writer was already in; fall back to the first.
  const activeChapter = chapters.find((c) => c.id === selectedChapterId) ?? chapters[0] ?? null

  useEffect(() => {
    if (activeChapter && activeChapter.id !== selectedChapterId) selectChapter(activeChapter.id, null)
  }, [activeChapter, selectedChapterId, selectChapter])

  // Keeps the line being typed vertically centred. This matters more on a
  // phone than on desktop: the software keyboard covers the bottom half of
  // the screen, so without it the caret spends most of its life hidden
  // behind the keyboard.
  useTypewriterMode(typewriterMode, false)

  const theme = resolveTheme(project.settings.themeId)
  const { typography, fonts, page } = theme

  // A justified line needs enough characters to distribute the slack across.
  // Print justifies at roughly 60-70 characters; a phone in portrait gives
  // about 40, where the same setting stretches word spaces into rivers —
  // visibly worse than ragged-right, and the opposite of "looks like the
  // book". So the theme's justification is honoured only where the measure
  // can carry it, which in practice means tablets and landscape.
  const [measurePx, setMeasurePx] = useState(0)
  const justify = typography.justify && measurePx >= typography.bodySize * 34

  const bookText: React.CSSProperties = {
    fontFamily: fonts.body,
    fontSize: typography.bodySize,
    lineHeight: typography.lineHeight,
    color: page.ink,
    textAlign: justify ? 'justify' : 'left',
    hyphens: 'auto',
  }

  const words = activeChapter
    ? wordCount(activeChapter.blocks.map((b) => ('html' in b ? b.html : 'text' in b ? b.text : '')).join(' '))
    : 0

  const addParagraph = () => {
    if (!activeChapter) return
    const last = activeChapter.blocks.length > 0 ? activeChapter.blocks[activeChapter.blocks.length - 1].id : null
    insertBlockWithHistory(project.id, activeChapter.id, last, createDefaultBlock('paragraph'))
  }

  const firstParagraphId = activeChapter?.blocks.find((b) => b.type === 'paragraph')?.id

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: page.background }}>
      {/* Chrome fades to a single dot while writing, and comes back on tap —
          "distraction-free" has to mean the controls get out of the way too,
          not just that the sidebars are gone. */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300',
          chrome ? 'opacity-100' : 'opacity-0',
        )}
        style={{ color: page.mutedInk }}
      >
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-label="Switch chapter"
          className="flex size-9 items-center justify-center rounded-full"
        >
          <ChevronDown className="size-4 opacity-60" />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleTypewriterMode}
            aria-pressed={typewriterMode}
            className={cn('rounded-full px-2.5 py-1 text-[11px] tracking-wide transition-opacity', !typewriterMode && 'opacity-50')}
            style={{ border: `1px solid ${page.ruleColor}` }}
          >
            Typewriter
          </button>
          <button
            type="button"
            onClick={() => setFocusMode('none')}
            aria-label="Leave distraction-free writing"
            className="flex size-9 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6"
        onScroll={() => chrome && setChrome(false)}
        onClick={() => !chrome && setChrome(true)}
      >
        {/* Generous top space so the first line starts where a page's text
            block would, not jammed under the chrome. */}
        <div
          ref={(el) => {
            const w = el?.getBoundingClientRect().width ?? 0
            if (w && Math.abs(w - measurePx) > 1) setMeasurePx(w)
          }}
          className="mx-auto w-full max-w-[46ch] pb-[60vh] pt-10"
        >
          {activeChapter && (
            <h1
              className="mb-8 text-center text-[22px] leading-tight"
              style={{ fontFamily: fonts.heading, fontWeight: typography.headingWeight, color: page.ink }}
            >
              {activeChapter.title || 'Untitled chapter'}
            </h1>
          )}

          {activeChapter?.blocks.length === 0 && (
            <button type="button" onClick={addParagraph} className="w-full py-6 text-left" style={{ ...bookText, color: page.mutedInk }}>
              Start writing…
            </button>
          )}

          <div className="flex flex-col">
            {activeChapter?.blocks.map((block, i) => (
              <FocusBlock
                key={block.id}
                projectId={project.id}
                chapterId={activeChapter.id}
                block={block}
                previousBlock={i > 0 ? activeChapter.blocks[i - 1] : undefined}
                bookText={bookText}
                theme={theme}
                dropCap={typography.dropCap && block.id === firstParagraphId}
                getObjectUrl={getObjectUrl}
              />
            ))}
          </div>

          {/* Tapping past the end starts a new paragraph, the way clicking
              under the last line of a page does in a word processor. */}
          {activeChapter && activeChapter.blocks.length > 0 && (
            <button type="button" onClick={addParagraph} aria-label="Add a paragraph" className="h-32 w-full" />
          )}
        </div>
      </div>

      <div
        className={cn(
          'shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[11px] transition-opacity duration-300',
          chrome ? 'opacity-60' : 'opacity-0',
        )}
        style={{ color: page.mutedInk }}
      >
        {words.toLocaleString()} words
      </div>

      <Sheet open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Chapters</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col">
            {chapters.map((chapter, i) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => {
                  selectChapter(chapter.id, null)
                  setSwitcherOpen(false)
                }}
                className={cn(
                  'flex items-center gap-2 border-b border-border px-2 py-3.5 text-left text-[15px]',
                  chapter.id === activeChapter?.id ? 'text-[var(--color-accent)]' : 'text-text-primary',
                )}
              >
                <span className="text-xs tabular-nums text-text-muted">{i + 1}.</span>
                <span className="min-w-0 truncate">{chapter.title || 'Untitled chapter'}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/** One block rendered as book text rather than as a mobile UI card. */
function FocusBlock({
  projectId,
  chapterId,
  block,
  previousBlock,
  bookText,
  theme,
  dropCap,
  getObjectUrl,
}: {
  projectId: string
  chapterId: string
  block: ContentBlock
  previousBlock?: ContentBlock
  bookText: React.CSSProperties
  theme: ReturnType<typeof resolveTheme>
  dropCap: boolean
  getObjectUrl: (assetId: string) => string | undefined
}) {
  const selectForEdit = useSelectionStore((s) => s.selectForEdit)
  const commit = (updates: Partial<ContentBlock>) => editBlock(projectId, chapterId, block.id, updates)
  const canMergeWithPrevious = block.type === 'paragraph' && previousBlock?.type === 'paragraph'

  if (block.type === 'paragraph') {
    return (
      <MobileTextField
        mode="html"
        blockId={block.id}
        projectId={projectId}
        value={block.html}
        placeholder="Start writing…"
        style={bookText}
        className={cn('py-1.5', dropCap && 'book-drop-cap')}
        onCommit={(html) => commit({ html })}
        onSplit={(before, after) => {
          const newBlockId = splitParagraphWithHistory(projectId, chapterId, block.id, before, after)
          if (newBlockId) selectForEdit(chapterId, newBlockId, 'start')
        }}
        onMergeWithPrevious={
          canMergeWithPrevious
            ? () => {
                const result = mergeParagraphWithPreviousHistory(projectId, chapterId, block.id)
                if (result) selectForEdit(chapterId, result.mergedBlockId, result.caretOffset)
              }
            : undefined
        }
      />
    )
  }

  if (block.type === 'heading') {
    return (
      <MobileTextField
        as={block.level === 2 ? 'h2' : 'h3'}
        mode="text"
        blockId={block.id}
        value={block.text}
        placeholder="Heading"
        className={cn('pb-2 pt-6', block.level === 2 ? 'text-[20px]' : 'text-[17px]')}
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.typography.headingWeight,
          color: theme.page.ink,
          lineHeight: 1.3,
        }}
        onCommit={(text) => commit({ text })}
        onSplit={(before, after) => {
          const newBlockId = splitHeadingIntoParagraphWithHistory(projectId, chapterId, block.id, before, after)
          if (newBlockId) selectForEdit(chapterId, newBlockId, 'start')
        }}
      />
    )
  }

  if (block.type === 'quote' || block.type === 'pull-quote') {
    return (
      <MobileTextField
        mode="text"
        blockId={block.id}
        value={block.text}
        placeholder="Quote"
        className="my-3 py-1 pl-4 italic"
        style={{ ...bookText, borderLeft: `2px solid ${theme.page.ruleColor}`, textAlign: 'left' }}
        onCommit={(text) => commit({ text })}
      />
    )
  }

  if (block.type === 'image') {
    const url = getObjectUrl(block.assetId)
    return url ? (
      <figure className="my-5">
        <img src={url} alt={block.altText ?? block.caption ?? ''} className="w-full rounded-sm" />
        {block.caption && (
          <figcaption className="pt-1.5 text-center text-[12px]" style={{ color: theme.page.mutedInk, fontFamily: theme.fonts.body }}>
            {block.caption}
          </figcaption>
        )}
      </figure>
    ) : null
  }

  // Everything else (lists, tables, timelines…) stays visible so the chapter
  // reads whole, but isn't editable here — the same scope mobile Write draws,
  // for the same reason: those need per-type mini-forms, not a text field.
  return null
}
