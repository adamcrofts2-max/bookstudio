import { useEffect, useState } from 'react'
import { BookMarked, FileText, ImagePlus, Lightbulb, MapPin, Plus, UserRound } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getLayer0KindLabel } from '@/types/layer0'
import type { Idea } from '@/types/idea'
import { useProjectStore } from '@/store/projectStore'
import { addIdeaWithHistory, addLayer0EntityWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import { cn } from '@/lib/utils'

interface SelectionTarget {
  blockId: string
  text: string
  top: number
  right: number
}

interface SelectionDevelopMenuProps {
  projectId: string
  chapterId: string
  /**
   * Block ids belonging to the page this instance is rendered for. One
   * `SelectionDevelopMenu` is mounted per visible `Page`, not per block —
   * blocks share it via delegated `selectionchange` handling (`.closest`
   * on the selection's own anchor node, same cheap DOM-walk `Note`/`Idea`
   * badges' click handlers already rely on elsewhere) rather than each
   * block running its own listener. `BookRenderer`'s virtualisation keeps
   * the number of concurrently-mounted pages small, so this stays a
   * handful of listeners even in a 1,000-page manuscript, not one per
   * block — see docs/ROADMAP.md's "Optimise for large books" principle.
   * This set exists so that of several concurrently-mounted pages (Lazy-
   * Spread keeps neighbours warm), only the one actually containing the
   * selection reacts — the others see a `blockId` that isn't theirs and
   * stay closed.
   */
  blockIds: Set<string>
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/**
 * "Highlight text → send it straight to Develop" (Phase 90, user-proposed
 * 2026-08-02: "select a name → + Character", "select a sentence that needs
 * an illustration"). Reuses `FloatingFormatToolbar.tsx`'s exact selection-
 * tracking pattern (`window.getSelection()` + a `selectionchange` listener,
 * `position: fixed` so it's immune to `Page.tsx`'s per-page clipping the
 * same way that toolbar always has been — no repeat of the Phase 84-89
 * saga) but is deliberately NOT gated on `isEditing`: rendered manuscript
 * text is natively selectable by the browser without entering edit mode
 * first, and "I want to flag this name/sentence" is a read-time action, not
 * an editing one. Works on any block's rendered text, not just paragraphs —
 * scoped at `Page.tsx` level rather than threaded into every block type's
 * own `Render` function for exactly that reason.
 *
 * Creates the Layer 0 entity (or Idea) directly via
 * `addLayer0EntityWithHistory`/`addIdeaWithHistory` — skips the existing
 * capture-then-promote two-step (`IdeaCaptureAffordance.tsx` →
 * `IdeaDetailDialog.tsx`'s promotion flow) on purpose: that flow is for "I
 * have a stray thought," this one is for "I already know exactly what this
 * is," so it should take exactly one click. `linkedChapterId`/`linkedBlockId`
 * on the new entity are what the future book graph (Idea System Milestone 3)
 * needs and didn't have yet on these six kinds — see `types/layer0.ts`.
 */
export function SelectionDevelopMenu({ projectId, chapterId, blockIds }: SelectionDevelopMenuProps) {
  const bookForm = useProjectStore((s) => s.projects.find((p) => p.id === projectId)?.bookForm)
  const [target, setTarget] = useState<SelectionTarget | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const update = () => {
      // Keep the trigger anchored to whatever selection was live the
      // moment the menu opened — Radix's own open dropdown can shift focus
      // in ways that fire spurious `selectionchange` events, and we don't
      // want the trigger to jump or vanish out from under an open menu.
      if (open) return

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setTarget(null)
        return
      }
      const text = selection.toString().trim()
      if (!text) {
        setTarget(null)
        return
      }

      const range = selection.getRangeAt(0)
      const anchor = range.commonAncestorContainer
      const anchorEl = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null)
      const blockEl = anchorEl?.closest?.('[data-block-id]') as HTMLElement | null
      const blockId = blockEl?.getAttribute('data-block-id')
      if (!blockId || !blockIds.has(blockId)) {
        setTarget(null)
        return
      }

      const box = range.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) {
        setTarget(null)
        return
      }
      setTarget({ blockId, text, top: box.top, right: box.right })
    }

    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [blockIds, open])

  if (!target) return null

  const finish = () => {
    setOpen(false)
    setTarget(null)
    window.getSelection()?.removeAllRanges()
  }

  const timestamp = () => new Date().toISOString()

  const addCharacter = () => {
    const now = timestamp()
    addLayer0EntityWithHistory(
      projectId,
      'characters',
      { id: generateId('character'), createdAt: now, updatedAt: now, name: target.text, linkedChapterId: chapterId, linkedBlockId: target.blockId },
      `Add ${getLayer0KindLabel('character', bookForm).singular.toLowerCase()}`,
    )
    finish()
  }

  const addLocation = () => {
    const now = timestamp()
    addLayer0EntityWithHistory(
      projectId,
      'locations',
      { id: generateId('location'), createdAt: now, updatedAt: now, name: target.text, linkedChapterId: chapterId, linkedBlockId: target.blockId },
      `Add ${getLayer0KindLabel('location', bookForm).singular.toLowerCase()}`,
    )
    finish()
  }

  const addGlossaryTerm = () => {
    const now = timestamp()
    addLayer0EntityWithHistory(
      projectId,
      'glossaryTerms',
      { id: generateId('glossaryTerm'), createdAt: now, updatedAt: now, term: target.text, definition: '', linkedChapterId: chapterId, linkedBlockId: target.blockId },
      'Add glossary term',
    )
    finish()
  }

  const addIllustrationBrief = () => {
    const now = timestamp()
    addLayer0EntityWithHistory(
      projectId,
      'illustrationBriefs',
      { id: generateId('illustrationBrief'), createdAt: now, updatedAt: now, title: target.text, linkedChapterId: chapterId, linkedBlockId: target.blockId },
      'Add illustration brief',
    )
    finish()
  }

  const addResearchNote = () => {
    const now = timestamp()
    addLayer0EntityWithHistory(
      projectId,
      'researchNotes',
      { id: generateId('researchNote'), createdAt: now, updatedAt: now, title: target.text, linkedChapterId: chapterId, linkedBlockId: target.blockId },
      'Add research note',
    )
    finish()
  }

  const addIdea = () => {
    const now = timestamp()
    const idea: Idea = { id: generateId('idea'), text: target.text, createdAt: now, updatedAt: now, status: 'new', linkedChapterId: chapterId, linkedBlockId: target.blockId }
    addIdeaWithHistory(projectId, idea, 'Capture idea')
    finish()
  }

  const itemClass = 'gap-2.5'

  return (
    <div
      className="fixed z-50"
      style={{ top: target.top - 8, left: target.right + 6, transform: 'translateY(-100%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex size-7 items-center justify-center rounded-full text-white shadow-[var(--shadow-md)] transition-transform hover:scale-105',
              'bg-[var(--color-accent)]',
            )}
            aria-label="Add selection to Develop"
            title="Add to Develop"
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="max-w-[16rem] truncate">Add “{truncate(target.text, 40)}” as…</DropdownMenuLabel>
          <DropdownMenuItem className={itemClass} onSelect={addCharacter}>
            <UserRound className="size-3.5 text-text-muted" />
            {getLayer0KindLabel('character', bookForm).singular}
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onSelect={addLocation}>
            <MapPin className="size-3.5 text-text-muted" />
            {getLayer0KindLabel('location', bookForm).singular}
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onSelect={addIllustrationBrief}>
            <ImagePlus className="size-3.5 text-text-muted" />
            Illustration Brief
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onSelect={addGlossaryTerm}>
            <BookMarked className="size-3.5 text-text-muted" />
            Glossary Term
          </DropdownMenuItem>
          <DropdownMenuItem className={itemClass} onSelect={addResearchNote}>
            <FileText className="size-3.5 text-text-muted" />
            Research Note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={itemClass} onSelect={addIdea}>
            <Lightbulb className="size-3.5 text-text-muted" />
            Save as Idea
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
