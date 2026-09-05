import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { EMPTY_NOTES, useNotesStore } from '@/store/notesStore'
import {
  addNoteWithHistory,
  deleteNoteWithHistory,
  setNoteResolvedWithHistory,
  editBlock,
} from '@/store/editorActions'
import type { ContentBlock } from '@/types/content'
import { cn } from '@/lib/utils'

/** The same discrete presets the desktop Image panel offers — matching them
 * rather than inventing a mobile-only set keeps a book's images consistent
 * whichever device last touched them. */
const WIDTH_PRESETS = [
  { value: 40, label: 'Small' },
  { value: 65, label: 'Medium' },
  { value: 85, label: 'Large' },
  { value: 100, label: 'Full width' },
] as const

interface MobileBlockSheetProps {
  projectId: string
  chapterId: string
  block: ContentBlock | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The per-block surfaces mobile never had: notes on a block, and an image's
 * caption, alt text and size.
 *
 * `docs/ROADMAP.md` filed these as blocked on "a block selection model
 * mobile Write doesn't have yet", which turned out to overstate it. Desktop
 * needs a selection model because its Inspector is a persistent panel that
 * has to know what it is looking at from moment to moment. A sheet does not:
 * it is opened *from* a block's own menu, which already knows exactly which
 * block it belongs to. The design pass was mostly realising the two shells
 * do not need the same mechanism to reach the same data.
 *
 * Images could be inserted on a phone since Phase 146 and then never
 * captioned, which made that feature half-finished in a way a book notices —
 * an uncaptioned plate is a proof correction.
 */
export function MobileBlockSheet({ projectId, chapterId, block, open, onOpenChange }: MobileBlockSheetProps) {
  const notes = useNotesStore((s) => s.byProject[projectId]) ?? EMPTY_NOTES
  const [draft, setDraft] = useState('')

  const blockNotes = block ? notes.filter((note) => note.blockId === block.id) : []
  const isImage = block?.type === 'image'

  const addNote = () => {
    const text = draft.trim()
    if (!text || !block) return
    addNoteWithHistory(projectId, { chapterId, blockId: block.id }, text)
    setDraft('')
  }

  /** `editBlock` is the history-recording edit — same one the desktop
   * Inspector's fields use, so a caption typed on a phone is undoable in
   * exactly the same way. */
  const updateImage = (updates: Partial<ContentBlock>) => {
    if (!block) return
    editBlock(projectId, chapterId, block.id, updates)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[85dvh]">
        <SheetHeader>
          <SheetTitle>{isImage ? 'Image' : 'Notes'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-8">
          {isImage && block.type === 'image' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mobile-image-caption">Caption</Label>
                <Input
                  id="mobile-image-caption"
                  defaultValue={block.caption ?? ''}
                  placeholder="What this picture shows"
                  onBlur={(e) => updateImage({ caption: e.target.value.trim() || undefined })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mobile-image-alt">Alt text</Label>
                <Input
                  id="mobile-image-alt"
                  defaultValue={block.altText ?? ''}
                  placeholder="Described for a screen reader"
                  onBlur={(e) => updateImage({ altText: e.target.value.trim() || undefined })}
                />
                <p className="text-xs text-text-secondary">
                  Falls back to the caption when empty, so a described image never has nothing.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Width on the page</Label>
                <div className="flex flex-wrap gap-2">
                  {WIDTH_PRESETS.map((preset) => {
                    const current = block.widthPercent ?? 100
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => updateImage({ widthPercent: preset.value, widthMm: undefined })}
                        className={cn(
                          'rounded-[var(--radius-button)] border px-3 py-2 text-[13px] font-medium transition-colors',
                          current === preset.value
                            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                            : 'border-border text-text-secondary',
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {isImage && <Label>Notes</Label>}
            {blockNotes.length === 0 ? (
              <p className="text-[13px] text-text-secondary">
                No notes on this block yet. Notes stay with the book and never appear in the printed page.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blockNotes.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-start justify-between gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-3"
                  >
                    <p className={cn('text-[14px] text-text-primary', note.resolved && 'text-text-muted line-through')}>
                      {note.text}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={note.resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                        onClick={() => setNoteResolvedWithHistory(projectId, note.id, !note.resolved)}
                      >
                        <Check className={cn('size-3.5', note.resolved && 'text-[var(--color-accent)]')} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete note"
                        className="hover:text-danger"
                        onClick={() => deleteNoteWithHistory(projectId, note.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Textarea
              rows={2}
              value={draft}
              aria-label="New note"
              placeholder="Something to come back to…"
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="button" className="gap-1.5" disabled={draft.trim().length === 0} onClick={addNote}>
              <Plus className="size-3.5" />
              Add note
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
