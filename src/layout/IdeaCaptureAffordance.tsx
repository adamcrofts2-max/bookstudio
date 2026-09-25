import { useState, type KeyboardEvent } from 'react'
import { Lightbulb, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { generateId } from '@/utils'
import { useSelectionStore } from '@/store/selectionStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { addIdeaWithHistory } from '@/store/editorActions'
import type { Idea } from '@/types/idea'

interface IdeaCaptureAffordanceProps {
  projectId: string
}

/**
 * The Idea System's entire footprint inside Write (Develop Milestone 1,
 * `docs/IDEA_SYSTEM_PLAN.md`) — a small, persistent control docked to the
 * edge of the writing surface, collapsed to a single icon by default.
 * Deliberately NOT a rail of visible cards and NOT a "wall" of ideas
 * sitting in view while someone is trying to write — the full Idea inbox
 * lives in Develop, on the other side of the door. Clicking the icon opens
 * one input, "capture a thought" as the only visible verb; Enter calls
 * `addIdeaWithHistory` and the control collapses straight back — no
 * confirmation dialog, no required fields, no interruption to writing.
 *
 * `linkedChapterId` is set from `selectionStore.selectedChapterId` — the
 * closest available proxy for "whichever chapter is currently open," since
 * `BookRenderer` renders the whole manuscript as one continuous scroll
 * rather than a per-chapter editor. `null` (nothing selected yet) simply
 * omits the link, same as capturing from Develop directly. `linkedBlockId`
 * (Phase 83) is set the same way from `selectedBlockId` when a specific
 * block happens to be selected — strictly additive, never required — and is
 * what lets `IdeaIndicatorBadge` anchor this idea to the exact paragraph
 * instead of just "somewhere in this chapter."
 */
export function IdeaCaptureAffordance({ projectId }: IdeaCaptureAffordanceProps) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const isMobile = useIsMobile()
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)

  const collapse = () => {
    setExpanded(false)
    setText('')
  }

  const capture = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      collapse()
      return
    }
    const now = new Date().toISOString()
    const idea: Idea = {
      id: generateId('idea'),
      text: trimmed,
      createdAt: now,
      updatedAt: now,
      status: 'new',
      ...(selectedChapterId ? { linkedChapterId: selectedChapterId } : {}),
      ...(selectedBlockId ? { linkedBlockId: selectedBlockId } : {}),
    }
    addIdeaWithHistory(projectId, idea)
    collapse()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      capture()
    } else if (e.key === 'Escape') {
      collapse()
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Capture an idea"
        title="Capture an idea"
        className={cn(
          'absolute bottom-4 z-20 flex size-10 items-center justify-center rounded-full border border-border bg-panel/95 text-text-secondary shadow-[var(--shadow-md)] backdrop-blur transition-colors duration-150 hover:text-[var(--color-accent)]',
          // Mobile Write docks its "add block" button bottom-right, so two
          // round buttons would sit on top of each other there.
          isMobile ? 'left-4' : 'right-4',
        )}
      >
        <Lightbulb className="size-4" />
      </button>
    )
  }

  return (
    <div
      className={cn(
        'absolute bottom-4 z-20 flex w-72 max-w-[calc(100%-2rem)] flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel/95 p-3 shadow-[var(--shadow-md)] backdrop-blur',
        isMobile ? 'left-4' : 'right-4',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('flex items-center gap-1.5 text-xs font-medium text-text-secondary')}>
          <Lightbulb className="size-3.5 text-[var(--color-accent)]" />
          Capture a thought
        </span>
        <button type="button" onClick={collapse} aria-label="Cancel" className="text-text-muted transition-colors duration-150 hover:text-text-primary">
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        autoFocus
        rows={2}
        placeholder="A stray idea, a name, a half sentence…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => !isMobile && !text.trim() && collapse()}
        className="w-full resize-none rounded-[var(--radius-button)] border border-border bg-background px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      />
      {/* A phone has no Shift key and its Return key is a line break, so the
          desktop hint is both wrong and unusable there — it gets a real
          button instead. Same capture path either way. */}
      {isMobile ? (
        <button
          type="button"
          onClick={capture}
          disabled={!text.trim()}
          className="self-end rounded-[var(--radius-button)] bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground disabled:opacity-40"
        >
          Capture
        </button>
      ) : (
        <p className="text-[11px] text-text-muted">Enter to save · Shift+Enter for a line break</p>
      )}
    </div>
  )
}
