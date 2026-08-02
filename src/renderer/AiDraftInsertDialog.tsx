import { useMemo, useState } from 'react'
import { ClipboardPaste, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { getBlockTypeDefinition } from '@/blocks/registry'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { parseMarkdownDraftBlocks } from '@/parser/markdown'
import { insertBlocksWithHistory } from '@/store/editorActions'
import type { ContentBlock } from '@/types/content'

interface AiDraftInsertDialogProps {
  projectId: string
  chapterId: string
  /** Same `afterBlockId` convention as `InsertBlockButton`'s `onInsert` — the
   * exact gap the user clicked "AI Draft…" from, so the whole batch lands
   * exactly where they asked for it rather than needing a separate chapter/
   * position picker in this dialog. `null` means "at the very start". */
  afterBlockId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful insert with the id of the first inserted
   * block, so the caller can select it the same way every other insert
   * path in `Page.tsx` does. */
  onInserted: (firstBlockId: string) => void
}

/**
 * The other half of the AI Workspace round trip `PasteBackPanel.tsx`
 * started (Phase 68) — that panel syncs an AI reply into the story bible;
 * this dialog gets drafted prose itself into the manuscript. Flagged
 * repeatedly as the single highest-priority open gap after a live
 * first-time-author audit (`docs/PLANNING_MODE_UX_AUDIT.md` finding #2):
 * "Generate Prompt" tells the user to "paste the result back into your
 * manuscript yourself," but that was a fully manual, unassisted,
 * block-by-block process — copy one paragraph, click into the editor,
 * paste, repeat.
 *
 * Reachable from `InsertBlockButton`'s existing "+" menu (see that file),
 * not a new top-level control — the exact gap the user clicked already
 * carries the chapter and insert position this dialog needs, so there's no
 * separate chapter/position picker to design or get wrong. Parses via
 * `parseMarkdownDraftBlocks` (Markdown-flavoured: most AI replies use
 * **emphasis**, occasional headings, and lists), previews every candidate
 * block before anything touches the manuscript, and commits the whole
 * reviewed batch as one undo step via `insertBlocksWithHistory` — nothing
 * is written until the user clicks Insert, matching this codebase's
 * established "AI proposes, a human accepts" rule
 * (`docs/AI_WORKSPACE_VISION.md`, and `PasteBackPanel`'s own Accept/Reject
 * pattern) even though there's only one review action here, not N.
 */
export function AiDraftInsertDialog({ projectId, chapterId, afterBlockId, open, onOpenChange, onInserted }: AiDraftInsertDialogProps) {
  const [draftText, setDraftText] = useState('')

  const blocks = useMemo<ContentBlock[]>(() => {
    if (!draftText.trim()) return []
    try {
      return parseMarkdownDraftBlocks(draftText)
    } catch {
      // Malformed input shouldn't be able to crash the dialog — worst case
      // is an empty preview, same as not having pasted anything yet.
      return []
    }
  }, [draftText])

  const handleClose = (next: boolean) => {
    onOpenChange(next)
    if (!next) setDraftText('') // don't leave stale text behind for next time this gap's dialog opens
  }

  const handleInsert = () => {
    if (blocks.length === 0) return
    insertBlocksWithHistory(projectId, chapterId, afterBlockId, blocks)
    onInserted(blocks[0].id)
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--color-accent)]" />
            Insert AI draft
          </DialogTitle>
          <DialogDescription>
            Paste what your AI assistant wrote. Review the blocks below, then insert them here — nothing is added to
            your manuscript until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-draft-text">Drafted text</Label>
            <Textarea
              id="ai-draft-text"
              rows={8}
              placeholder="Paste the AI's drafted scene, paragraph, or section here…"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              autoFocus
            />
          </div>

          {draftText.trim() && blocks.length === 0 && (
            <EmptyState
              icon={ClipboardPaste}
              title="Nothing to insert yet"
              description="This didn't parse into any recognisable paragraphs, headings, quotes, lists or tables."
              className="py-8"
            />
          )}

          {blocks.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>
                Will insert {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
              </Label>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {blocks.map((block) => {
                  const def = getBlockTypeDefinition(block.type)
                  const Icon = def?.icon
                  const preview = blockPlainText(block)
                  return (
                    <div key={block.id} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-panel p-3">
                      <div className="flex items-center gap-1.5">
                        {Icon && <Icon className="size-3 text-text-muted" />}
                        <span className="text-xs font-medium text-text-secondary">{def?.label ?? block.type}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-text-primary">{preview || <em className="text-text-muted">(empty)</em>}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={blocks.length === 0} onClick={handleInsert}>
            Insert {blocks.length > 0 ? blocks.length : ''} {blocks.length === 1 ? 'block' : 'blocks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
