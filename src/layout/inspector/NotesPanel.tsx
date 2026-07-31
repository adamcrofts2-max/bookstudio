import { useState } from 'react'
import { MessageSquare, Check, RotateCcw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/common/EmptyState'
import { useSelectionStore } from '@/store/selectionStore'
import { useNotesStore, EMPTY_NOTES, type Note } from '@/store/notesStore'
import { addNoteWithHistory, updateNoteTextWithHistory, setNoteResolvedWithHistory, deleteNoteWithHistory } from '@/store/editorActions'
import { useContentStore } from '@/store/contentStore'
import { useStructuralPageStore, EMPTY_STRUCTURAL_PAGES } from '@/store/structuralPageStore'
import { getStructuralPageTypeDefinition } from '@/structuralPages/registry'
import { cn } from '@/lib/utils'

interface NotesPanelProps {
  projectId: string
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} at ${time}`
}

function labelForBlockType(type: string): string {
  return type
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** One note's card: an editable textarea (commits on blur, not per
 * keystroke, so one edit session is one undo step — same convention as
 * `CoverNudgeHandle`'s "one drag = one undo step"), resolve/reopen and
 * delete actions. */
function NoteCard({ projectId, note }: { projectId: string; note: Note }) {
  const [draft, setDraft] = useState(note.text)

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius-card)] border border-border p-3',
        note.resolved && 'bg-background-secondary/60 opacity-70',
      )}
    >
      <Textarea
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== note.text) updateNoteTextWithHistory(projectId, note.id, draft)
        }}
        placeholder="Write a note…"
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] text-text-secondary">
          {note.resolved ? 'Resolved · ' : ''}
          {formatTimestamp(note.updatedAt)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={note.resolved ? 'Reopen note' : 'Resolve note'}
            onClick={() => setNoteResolvedWithHistory(projectId, note.id, !note.resolved)}
          >
            {note.resolved ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete note"
            onClick={() => deleteNoteWithHistory(projectId, note.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** A fresh, not-yet-created note's composer — kept separate from
 * `NoteCard` since it has no id to attach edit/resolve/delete actions to
 * until "Add" is actually pressed. */
function NewNoteComposer({ onAdd }: { onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState('')

  function submit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note about this…"
        className="text-sm"
      />
      <Button type="button" size="sm" className="self-end" disabled={!draft.trim()} onClick={submit}>
        Add note
      </Button>
    </div>
  )
}

/**
 * Inspector's "Notes" tab — editorial notes attached to whichever block or
 * structural page is currently selected (`selectionStore`), an authoring-
 * only side channel never read by PDF/EPUB/HTML export (see
 * `notesStore.ts`'s doc comment). Selecting nothing shows an empty state;
 * selecting a target with existing notes lists them (resolved notes shown
 * dimmed, at the end) above a composer for adding another.
 */
export function NotesPanel({ projectId }: NotesPanelProps) {
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedStructuralPageId = useSelectionStore((s) => s.selectedStructuralPageId)

  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const structuralPages = useStructuralPageStore((s) => s.byProject[projectId] ?? EMPTY_STRUCTURAL_PAGES)

  const allNotes = useNotesStore((s) => s.byProject[projectId] ?? EMPTY_NOTES)

  const target: { chapterId?: string; blockId?: string; structuralPageId?: string } | null = selectedBlockId
    ? { chapterId: selectedChapterId ?? undefined, blockId: selectedBlockId }
    : selectedStructuralPageId
      ? { structuralPageId: selectedStructuralPageId }
      : null

  if (!target) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No selection"
        description="Select a paragraph, image, or page — in the Structure tab or the preview — to leave a note on it."
        className="py-12"
      />
    )
  }

  const notes = target.blockId
    ? allNotes.filter((n) => n.blockId === target.blockId)
    : allNotes.filter((n) => n.structuralPageId === target.structuralPageId)
  const openNotes = notes.filter((n) => !n.resolved)
  const resolvedNotes = notes.filter((n) => n.resolved)

  let targetLabel = 'this selection'
  if (target.blockId) {
    const chapter = manuscript?.chapters.find((c) => c.id === target.chapterId)
    const block = chapter?.blocks.find((b) => b.id === target.blockId)
    targetLabel = block ? `this ${labelForBlockType(block.type).toLowerCase()}` : 'this block'
  } else if (target.structuralPageId) {
    const page = structuralPages.find((p) => p.id === target.structuralPageId)
    const def = page ? getStructuralPageTypeDefinition(page.type) : undefined
    targetLabel = def ? `this ${def.label} page` : 'this page'
  }

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">Notes</p>
        <p className="text-xs text-text-secondary">
          {notes.length === 0 ? `No notes on ${targetLabel} yet.` : `${openNotes.length} open on ${targetLabel}.`}
        </p>
      </div>

      <Separator />

      <NewNoteComposer onAdd={(text) => addNoteWithHistory(projectId, target, text)} />

      {openNotes.length > 0 && (
        <div className="flex flex-col gap-2">
          {openNotes.map((note) => (
            <NoteCard key={note.id} projectId={projectId} note={note} />
          ))}
        </div>
      )}

      {resolvedNotes.length > 0 && (
        <>
          <Separator />
          <p className="text-xs font-medium text-text-secondary">Resolved</p>
          <div className="flex flex-col gap-2">
            {resolvedNotes.map((note) => (
              <NoteCard key={note.id} projectId={projectId} note={note} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
