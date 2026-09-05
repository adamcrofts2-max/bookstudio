import { useEffect, useRef, useState } from 'react'
import { BookText, Check, ChevronDown, ChevronUp, ImageIcon, Images, ListPlus, Maximize2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/contentStore'
import { useAssetStore } from '@/store/assetStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUiStore } from '@/store/uiStore'
import { MobileTextField } from '@/layout/mobile/MobileTextField'
import { IdeaCaptureAffordance } from '@/layout/IdeaCaptureAffordance'
import {
  addChapterWithHistory,
  deleteBlockWithHistory,
  deleteChapterWithHistory,
  moveChapterWithHistory,
  splitParagraphWithHistory,
  splitHeadingIntoParagraphWithHistory,
  mergeParagraphWithPreviousHistory,
  editBlock,
  insertBlockWithHistory,
  moveBlockWithHistory,
  renameChapterWithHistory,
} from '@/store/editorActions'
import { createDefaultBlock, isTextFirstBlock } from '@/blocks/defaultContent'
import { generateId } from '@/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EmptyState } from '@/components/common/EmptyState'
import type { ContentBlock, ImageBlock } from '@/types/content'

interface MobileWriteViewProps {
  projectId: string
}


/** Read-only preview card for block types too structured for a plain-text
 * mobile field (list/table/timeline/faq/statistics/checklist) or with no
 * inline text at all (image/gallery/placeholder). Editing these stays a
 * desktop-only affordance for now — see `docs/STATUS.md`'s mobile-mode
 * entry for the reasoning: a phone-keyboard mini-form for a table or FAQ
 * list is real scope, deliberately deferred rather than half-built. */
function MobileReadOnlyCard({ block }: { block: ContentBlock }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)

  if (block.type === 'image') {
    const url = getObjectUrl(block.assetId)
    return (
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-panel">
        {url ? (
          <img src={url} alt={block.altText ?? block.caption ?? ''} className="block max-h-64 w-full object-cover" />
        ) : (
          <div className="flex h-32 items-center justify-center text-text-muted">
            <ImageIcon className="size-6" />
          </div>
        )}
        {block.caption && <p className="p-2.5 text-xs text-text-secondary">{block.caption}</p>}
      </div>
    )
  }

  if (block.type === 'gallery') {
    const firstUrl = block.assetIds[0] ? getObjectUrl(block.assetIds[0]) : undefined
    return (
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-panel">
        <div className="flex h-28 items-center justify-center bg-background-secondary">
          {firstUrl ? <img src={firstUrl} alt="" className="h-full w-full object-cover" /> : <Images className="size-6 text-text-muted" />}
        </div>
        <p className="p-2.5 text-xs text-text-secondary">{block.assetIds.length} images{block.caption ? ` · ${block.caption}` : ''}</p>
      </div>
    )
  }

  const summary = (() => {
    switch (block.type) {
      case 'list':
        return block.items.length > 0 ? block.items.join(' · ') : '(empty list)'
      case 'table':
        return `Table · ${block.header.length} columns, ${block.rows.length} rows`
      case 'timeline':
        return block.entries.length > 0 ? `${block.entries.length} timeline entries` : '(empty timeline)'
      case 'faq':
        return block.entries.length > 0 ? `${block.entries.length} Q&A entries` : '(empty FAQ)'
      case 'statistics':
        return block.entries.length > 0 ? block.entries.map((e) => `${e.value} ${e.label}`).join(' · ') : '(empty)'
      case 'checklist':
        return block.items.length > 0 ? `${block.items.filter((i) => i.checked).length}/${block.items.length} checked` : '(empty checklist)'
      case 'placeholder':
        return block.label ?? 'Placeholder'
      default:
        return ''
    }
  })()

  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-panel p-3">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-muted">{block.type.replace('-', ' ')}</p>
      <p className="mt-1 line-clamp-3 text-sm text-text-secondary">{summary}</p>
      <p className="mt-1.5 text-xs text-text-muted">Edit on a larger screen</p>
    </div>
  )
}

/** One block in the mobile flow — branches to an editable field for the six
 * plain-text block types, or a read-only card for everything else. */
function MobileBlockCard({
  projectId,
  chapterId,
  block,
  previousBlock,
}: {
  projectId: string
  chapterId: string
  block: ContentBlock
  /** Backspace-at-start only joins paragraph into paragraph, mirroring the
   * desktop canvas's identical scope check. */
  previousBlock?: ContentBlock
}) {
  const commit = (updates: Partial<ContentBlock>) => editBlock(projectId, chapterId, block.id, updates)
  const selectForEdit = useSelectionStore((s) => s.selectForEdit)
  const canMergeWithPrevious = block.type === 'paragraph' && previousBlock?.type === 'paragraph'

  switch (block.type) {
    case 'heading':
      return (
        <MobileTextField
          as={block.level === 2 ? 'h2' : 'h3'}
          mode="text"
          blockId={block.id}
          value={block.text}
          placeholder="Heading"
          className={cn('font-semibold text-text-primary', block.level === 2 ? 'text-xl' : 'text-lg')}
          onCommit={(text) => commit({ text })}
          onSplit={(before, after) => {
            const newBlockId = splitHeadingIntoParagraphWithHistory(projectId, chapterId, block.id, before, after)
            if (newBlockId) selectForEdit(chapterId, newBlockId, 'start')
          }}
        />
      )
    case 'paragraph':
      return (
        <MobileTextField
          mode="html"
          blockId={block.id}
          projectId={projectId}
          value={block.html}
          placeholder="Start writing…"
          className="text-[15px] leading-relaxed text-text-primary"
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
    case 'quote':
    case 'pull-quote':
      return (
        <div className="border-l-2 border-[var(--color-accent)] pl-3">
          <MobileTextField
            mode="text"
            value={block.text}
            placeholder="Quote"
            className="italic text-text-primary"
            onCommit={(text) => commit({ text })}
          />
          {block.attribution && <p className="mt-1 text-xs text-text-muted">— {block.attribution}</p>}
        </div>
      )
    case 'callout':
      return (
        <div className="rounded-[var(--radius-card)] border border-border bg-background-secondary p-3">
          {block.title && <p className="mb-1 text-sm font-semibold text-text-primary">{block.title}</p>}
          <MobileTextField
            mode="text"
            value={block.text}
            placeholder="Callout text"
            className="text-sm text-text-secondary"
            onCommit={(text) => commit({ text })}
          />
        </div>
      )
    case 'case-study':
      return (
        <div className="rounded-[var(--radius-card)] border border-border p-3">
          <MobileTextField
            mode="text"
            value={block.title}
            placeholder="Case study title"
            className="mb-1 text-sm font-semibold text-text-primary"
            onCommit={(title) => commit({ title })}
          />
          <MobileTextField
            mode="text"
            value={block.text}
            placeholder="Case study text"
            className="text-sm text-text-secondary"
            onCommit={(text) => commit({ text })}
          />
        </div>
      )
    default:
      return <MobileReadOnlyCard block={block} />
  }
}

/**
 * Mobile "on the go" writing surface (Phase 95) — a continuous single-
 * column flow of the active chapter's blocks, reading/writing the exact
 * same `contentStore` data as the desktop paginated canvas, through the
 * same history-wrapped `editBlock`/`insertBlockWithHistory` actions, so
 * undo/redo and autosave (`useAutosaveSnapshots`, mounted by
 * `MobileWorkspace`) behave identically. Deliberately NOT a shrunk
 * `BookRenderer`/`Page.tsx`: those exist to render fixed-size, bleed/trim-
 * precise pages for print — the wrong tool for a phone screen, per the
 * user's own scope decision (`docs/STATUS.md`'s mobile-mode entry).
 *
 * Phase 100 (2026-08-02, user: "it should feel like a mini version of book
 * studio on the go... still being able to edit content and make a book")
 * closed the biggest gaps between "view/tweak text" and "actually build a
 * book here": chapters can now be added, renamed, and deleted from the
 * switcher sheet (not just switched between); every block gets a persistent
 * (not hover-only — there's no hover on touch) "⋮" menu for move up/down/
 * delete, through the exact same `moveBlockWithHistory`/
 * `deleteBlockWithHistory` desktop uses; and the "+" menu can insert a real
 * photo straight from the device's camera roll or camera (`assetStore
 * .importFiles` + a plain `ImageBlock`, same shape `Page.tsx`'s desktop
 * asset-drop handler creates). Editing an *existing* structured block
 * (table/FAQ/list/etc., or repositioning an existing image's focal point)
 * stays desktop-only — see `MobileReadOnlyCard`'s own doc comment — that's
 * a deliberately different, larger scope than "write and assemble a book."
 */
export function MobileWriteView({ projectId }: MobileWriteViewProps) {
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const chapters = manuscript?.chapters ?? []
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const selectBlockForEdit = useSelectionStore((s) => s.selectForEdit)
  const [titleDraft, setTitleDraft] = useState('')
  const importFiles = useAssetStore((s) => s.importFiles)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (chapters.length === 0) {
      setActiveChapterId(null)
      return
    }
    if (!activeChapterId || !chapters.some((c) => c.id === activeChapterId)) {
      setActiveChapterId(chapters[0].id)
    }
    // Only re-resolve when the chapter list itself changes shape (added/removed) —
    // not on every keystroke inside the active chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.map((c) => c.id).join('|')])

  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null

  // Mobile tracked the open chapter only in local state, so `selectionStore`
  // stayed null and anything reading "which chapter is the user in" got
  // nothing. Idea capture is the first thing to need it — a thought captured
  // while writing should link to the chapter it was had in, exactly as it
  // does on desktop — but the selection is genuinely app-wide state, not
  // capture's private business, so it is published here rather than passed
  // down as a prop.
  const selectChapter = useSelectionStore((s) => s.select)
  useEffect(() => {
    if (activeChapterId) selectChapter(activeChapterId, null)
  }, [activeChapterId, selectChapter])

  /**
   * Where the caret should go once the "+" menu has finished closing.
   *
   * Landing it inside `onSelect` does not work: Radix is still tearing down
   * the menu's focus scope at that point and takes focus back afterwards, so
   * the new block was focused and then quietly abandoned — every keystroke
   * after "+ → Add paragraph" went to the document body and was lost.
   * Neither `onCloseAutoFocus`-preventDefault nor a synchronous `focus()`
   * settled it, because the steal happens after both. Requesting the caret
   * from the close handler instead removes the race rather than competing
   * with it.
   */
  const pendingCaretRef = useRef<string | null>(null)

  const handleAddBlock = (type: 'paragraph' | 'heading') => {
    if (!activeChapter) return
    const block = createDefaultBlock(type)
    const lastBlockId = activeChapter.blocks.length > 0 ? activeChapter.blocks[activeChapter.blocks.length - 1].id : null
    insertBlockWithHistory(projectId, activeChapter.id, lastBlockId, block)
    if (isTextFirstBlock(type)) pendingCaretRef.current = block.id
  }

  const landPendingCaret = () => {
    const blockId = pendingCaretRef.current
    pendingCaretRef.current = null
    if (blockId && activeChapter) selectBlockForEdit(activeChapter.id, blockId, 'start')
  }

  /** Opens the device's native photo picker (camera roll + camera, on
   * whichever the OS offers for a plain `accept="image/*"` file input — no
   * `capture` attribute, since forcing camera-only would block picking an
   * existing photo, and this is "add a picture to the book," not "take a
   * picture right now"). `onChange` below does the actual import + insert. */
  const handleAddImage = () => imageInputRef.current?.click()

  const handleImageSelected = async (file: File) => {
    if (!activeChapter) return
    setImageError(null)
    const { imported, failed } = await importFiles(projectId, [file])
    const asset = imported[0]
    if (!asset) {
      // Silence here meant the user picked a photo and watched nothing
      // happen — a corrupt or mislabelled file used to reject unhandled.
      setImageError(failed[0]?.reason ?? 'That file could not be added.')
      return
    }
    const block: ImageBlock = { id: generateId('block'), type: 'image', assetId: asset.id, caption: undefined, rotation: 0, widthPercent: 100 }
    const lastBlockId = activeChapter.blocks.length > 0 ? activeChapter.blocks[activeChapter.blocks.length - 1].id : null
    insertBlockWithHistory(projectId, activeChapter.id, lastBlockId, block)
  }

  const startRenameChapter = (chapterId: string, currentTitle: string) => {
    setTitleDraft(currentTitle)
    setRenamingChapterId(chapterId)
  }

  const commitRenameChapter = (chapterId: string, fallback: string) => {
    renameChapterWithHistory(projectId, chapterId, titleDraft.trim() || fallback)
    setRenamingChapterId(null)
  }

  /** Drops straight into rename mode for the freshly-created chapter — same
   * "type the real title next, no separate naming step" UX `Sidebar.tsx`'s
   * `handleAddChapter` already establishes on desktop. */
  const handleAddChapter = () => {
    const lastChapterId = chapters.length > 0 ? chapters[chapters.length - 1].id : null
    const newChapterId = addChapterWithHistory(projectId, lastChapterId, 'Untitled Chapter')
    setActiveChapterId(newChapterId)
    startRenameChapter(newChapterId, 'Untitled Chapter')
  }

  const handleDeleteChapter = (chapterId: string) => {
    deleteChapterWithHistory(projectId, chapterId)
    if (renamingChapterId === chapterId) setRenamingChapterId(null)
  }

  if (chapters.length === 0) {
    return (
      <EmptyState
        icon={BookText}
        title="No chapters yet"
        description="Start your first chapter to begin writing on the go, or import a manuscript on desktop."
        action={
          <Button type="button" size="sm" className="gap-1.5" onClick={handleAddChapter}>
            <Plus className="size-3.5" />
            Add Chapter
          </Button>
        }
        className="mt-10"
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-border bg-panel">
      <Sheet open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="min-w-0 truncate text-[15px] font-semibold text-text-primary">
              {activeChapter?.title || 'Untitled chapter'}
            </span>
            <ChevronDown className="size-4 shrink-0 text-text-muted" />
          </button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Chapters</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1">
            {chapters.map((chapter, i) =>
              renamingChapterId === chapter.id ? (
                <div key={chapter.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-xs tabular-nums text-text-muted">{i + 1}.</span>
                  <input
                    autoFocus
                    value={titleDraft}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => commitRenameChapter(chapter.id, chapter.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        ;(e.currentTarget as HTMLInputElement).blur()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setRenamingChapterId(null)
                      }
                    }}
                    className="min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--color-warning)] bg-panel px-2 py-1 text-sm text-text-primary outline-none"
                  />
                </div>
              ) : (
                <div
                  key={chapter.id}
                  className={cn(
                    'flex items-center gap-1 rounded-[var(--radius-card)] pl-1 pr-1.5 text-sm transition-colors duration-150',
                    chapter.id === activeChapterId ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'text-text-primary',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChapterId(chapter.id)
                      setSwitcherOpen(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-2 text-left"
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-text-muted">{i + 1}.</span>
                      {chapter.title || 'Untitled chapter'}
                    </span>
                    {chapter.id === activeChapterId && <Check className="size-4 shrink-0" />}
                  </button>
                  {/* Reordering existed on desktop only, so a chapter added
                      out of order on a phone could never be moved. */}
                  <button
                    type="button"
                    onClick={() => moveChapterWithHistory(projectId, chapter.id, 'up')}
                    disabled={i === 0}
                    aria-label={`Move ${chapter.title} up`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveChapterWithHistory(projectId, chapter.id, 'down')}
                    disabled={i === chapters.length - 1}
                    aria-label={`Move ${chapter.title} down`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startRenameChapter(chapter.id, chapter.title)}
                    aria-label={`Rename ${chapter.title}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-hover hover:text-text-primary"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChapter(chapter.id)}
                    aria-label={`Delete ${chapter.title}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-hover hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ),
            )}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-2 w-full gap-1.5" onClick={handleAddChapter}>
            <Plus className="size-3.5" />
            New chapter
          </Button>
        </SheetContent>
      </Sheet>
      {/* The way into the book itself. Deliberately quiet and next to the
          chapter name rather than buried in More: it's a writing control, so
          it belongs where the writing is. */}
      {/* Labelled, not a bare glyph. An unlabelled ⤢ sitting next to the
          switcher chevron read as two mysteries in a row, and nobody found
          it (user, 2026-09-04: "its not so obvious how to access it"). */}
      <button
        type="button"
        onClick={() => setFocusMode('write')}
        aria-label="Distraction-free writing"
        className="mr-2 flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary active:bg-hover"
      >
        <Maximize2 className="size-3.5" />
        Focus
      </button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImageSelected(file)
          e.target.value = ''
        }}
      />

      {imageError && (
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-background-secondary px-4 py-2.5">
          <p className="text-[13px] text-danger">{imageError}</p>
          <button type="button" onClick={() => setImageError(null)} className="shrink-0 text-[13px] text-text-secondary active:text-text-primary">
            Dismiss
          </button>
        </div>
      )}

      {/* `relative` so the capture affordance can dock to this region's
          bottom-right rather than the viewport's — it must sit above the
          scrolling text but below the tab bar. */}
      <div className="relative min-h-0 flex-1">
      <div className="h-full overflow-y-auto px-4 py-5">
        {activeChapter && activeChapter.blocks.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="This chapter is empty"
            description="Add a paragraph to start writing."
            action={
              <Button type="button" size="sm" className="gap-1.5" onClick={() => handleAddBlock('paragraph')}>
                <Plus className="size-3.5" />
                Add a paragraph
              </Button>
            }
            className="mt-6"
          />
        ) : (
          <div className="flex flex-col gap-3 pb-24">
            {activeChapter?.blocks.map((block, i) => (
              <div key={block.id} className="flex flex-col gap-1">
                {/* Always-visible (not hover-only — there's no hover on
                   touch) block-actions menu. A slim row above the block's
                   own content rather than an overlay on top of it, so it
                   never covers text/images regardless of block type. */}
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Block actions"
                        className="flex size-6 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-hover hover:text-text-primary"
                      >
                        <MoreVertical className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={i === 0} onSelect={() => moveBlockWithHistory(projectId, activeChapter.id, block.id, 'up')}>
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={i === activeChapter.blocks.length - 1}
                        onSelect={() => moveBlockWithHistory(projectId, activeChapter.id, block.id, 'down')}
                      >
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => deleteBlockWithHistory(projectId, activeChapter.id, block.id)} className="text-danger">
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <MobileBlockCard
                  projectId={projectId}
                  chapterId={activeChapter.id}
                  block={block}
                  previousBlock={i > 0 ? activeChapter.blocks[i - 1] : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>
        <IdeaCaptureAffordance projectId={projectId} />
      </div>

      {activeChapter && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              aria-label="Add block"
              className="fixed bottom-20 right-4 z-30 size-12 rounded-full shadow-[var(--shadow-md)]"
            >
              <Plus className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            // Radix returns focus to the trigger when the menu closes, which
            // landed on the "+" button *after* the newly inserted block had
            // taken the caret — so the block was focused for a few
            // milliseconds and then quietly handed back, and typing went
            // nowhere. Traced with a focusin/focusout log: IN <field>, OUT
            // <field>, IN <button "Add block">.
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              landPendingCaret()
            }}
          >
            <DropdownMenuItem onSelect={() => handleAddBlock('paragraph')}>Add paragraph</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleAddBlock('heading')}>Add heading</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleAddImage}>Add photo</DropdownMenuItem>
            {/* The prominent "+" used to add blocks only, so the single most
                obvious control on the screen couldn't do the most structural
                thing a writer needs — chapters were three taps deep inside
                the switcher sheet. */}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleAddChapter}>New chapter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
