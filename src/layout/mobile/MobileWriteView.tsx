import { useEffect, useRef, useState } from 'react'
import { BookText, Check, ChevronDown, ImageIcon, Images, ListPlus, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useEditableField } from '@/blocks/shared'
import { useContentStore } from '@/store/contentStore'
import { useAssetStore } from '@/store/assetStore'
import {
  addChapterWithHistory,
  deleteBlockWithHistory,
  deleteChapterWithHistory,
  editBlock,
  insertBlockWithHistory,
  moveBlockWithHistory,
  renameChapterWithHistory,
} from '@/store/editorActions'
import { createDefaultBlock } from '@/blocks/defaultContent'
import { generateId } from '@/utils'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { EmptyState } from '@/components/common/EmptyState'
import type { ContentBlock, ImageBlock } from '@/types/content'

interface MobileWriteViewProps {
  projectId: string
}

/**
 * A single editable text field, shared by every block type with one plain
 * string field (heading/quote/pull-quote/callout body/case-study title+text).
 * Reuses `useEditableField` (`src/blocks/shared.tsx`) — the exact same
 * commit-on-blur/Enter, cancel-on-Escape hook the desktop page canvas uses —
 * so the underlying edit semantics are identical, just without desktop's
 * double-click-to-enter-edit gesture (unreliable on touch): mobile fields
 * start editing on a single tap instead, since there's no separate
 * select-vs-edit state to preserve here (no toolbar/badge overlays in this
 * simplified view).
 *
 * `handleTap` calls `el.focus()` directly, synchronously, inside the tap's
 * own click handler — BEFORE flipping React state. This is deliberate, not
 * redundant with `useEditableField`'s own `ref.current.focus()` (which runs
 * in a `useLayoutEffect` after `isEditing` flips): iOS Safari (and some
 * Android browsers) only summon the on-screen keyboard for a programmatic
 * `.focus()` call if it happens synchronously within the original trusted
 * touch/click event — a `.focus()` reached via a subsequent React render
 * pass, even in the same tick, can be treated as untrusted and silently
 * ignored, so typing appears to do nothing on a real phone even though the
 * identical pattern works fine with a mouse (confirmed via automated click
 * testing, which doesn't reproduce this — mouse-driven `click` events don't
 * carry the same restriction). Desktop's block types don't hit this because
 * they've only ever been driven by a mouse/trackpad. Focusing here is a safe
 * no-op if `useEditableField`'s own effect-driven focus also fires — same
 * element, same result, just guaranteed to happen at least once inside the
 * gesture that must trigger it.
 */
function MobileTextField({
  mode,
  value,
  onCommit,
  placeholder,
  className,
  as: Tag = 'div',
}: {
  mode: 'text' | 'html'
  value: string
  onCommit: (value: string) => void
  placeholder: string
  className?: string
  as?: 'div' | 'h2' | 'h3'
}) {
  const field = useEditableField({ mode, initialValue: value, onCommit })
  const isEmpty = value.trim().length === 0

  const handleTap = () => {
    if (field.isEditing) return
    const el = field.ref.current
    if (el) {
      el.contentEditable = 'true'
      el.focus()
    }
    field.startEditing()
  }

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        field.ref.current = el
      }}
      onClick={!field.isEditing ? handleTap : undefined}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn(
        'rounded-[var(--radius-card)] outline-offset-4 transition-[outline-color] duration-150',
        field.isEditing ? 'outline outline-2 outline-[var(--color-warning)]' : 'outline outline-2 outline-transparent',
        isEmpty && !field.isEditing && 'text-text-muted',
        className,
      )}
      {...(mode === 'html' && !field.isEditing ? { dangerouslySetInnerHTML: { __html: value || placeholder } } : {})}
    >
      {mode === 'text' && !field.isEditing ? value.trim() || placeholder : null}
    </Tag>
  )
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
function MobileBlockCard({ projectId, chapterId, block }: { projectId: string; chapterId: string; block: ContentBlock }) {
  const commit = (updates: Partial<ContentBlock>) => editBlock(projectId, chapterId, block.id, updates)

  switch (block.type) {
    case 'heading':
      return (
        <MobileTextField
          as={block.level === 2 ? 'h2' : 'h3'}
          mode="text"
          value={block.text}
          placeholder="Heading"
          className={cn('font-semibold text-text-primary', block.level === 2 ? 'text-xl' : 'text-lg')}
          onCommit={(text) => commit({ text })}
        />
      )
    case 'paragraph':
      return (
        <MobileTextField
          mode="html"
          value={block.html}
          placeholder="Start writing…"
          className="text-[15px] leading-relaxed text-text-primary"
          onCommit={(html) => commit({ html })}
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

  const handleAddBlock = (type: 'paragraph' | 'heading') => {
    if (!activeChapter) return
    const block = createDefaultBlock(type)
    const lastBlockId = activeChapter.blocks.length > 0 ? activeChapter.blocks[activeChapter.blocks.length - 1].id : null
    insertBlockWithHistory(projectId, activeChapter.id, lastBlockId, block)
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
      <Sheet open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-panel px-4 py-3 text-left"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {activeChapter && activeChapter.blocks.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="This chapter is empty"
            description="Add a paragraph to start writing."
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
                <MobileBlockCard projectId={projectId} chapterId={activeChapter.id} block={block} />
              </div>
            ))}
          </div>
        )}
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
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleAddBlock('paragraph')}>Add paragraph</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleAddBlock('heading')}>Add heading</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleAddImage}>Add photo</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
