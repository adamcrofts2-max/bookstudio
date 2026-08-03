import { useEffect } from 'react'
import { Type } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { editBlock, splitParagraphWithHistory, mergeParagraphWithPreviousHistory } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { useEditableField } from '@/blocks/shared'
import { useLiveSpellcheck } from '@/renderer/useLiveSpellcheck'
import { FloatingFormatToolbar } from '@/renderer/FloatingFormatToolbar'
import { stripHtml, wordCount } from '@/utils'
import type { Chapter, ContentBlock, ParagraphBlock, PlaceholderKind } from '@/types/content'

interface TypographyPanelProps {
  projectId: string
}

const BLOCK_LABELS: Record<ContentBlock['type'], string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  // Renamed from this file's old "Pull quote" — Modular Page System
  // Milestone 5 introduced a genuinely distinct `pull-quote` block type (the
  // large magazine-style extracted quote), so the pre-existing `quote` type
  // (a small left-ruled blockquote/citation) needed a label that no longer
  // collides with it. See docs/STATUS.md's Phase 22 entry.
  quote: 'Quote',
  list: 'List',
  table: 'Table',
  image: 'Image',
  'pull-quote': 'Pull Quote',
  callout: 'Callout',
  'case-study': 'Case Study',
  timeline: 'Timeline',
  gallery: 'Gallery',
  faq: 'FAQ',
  statistics: 'Statistics',
  checklist: 'Checklist',
  placeholder: 'Placeholder',
}

const PLACEHOLDER_KIND_OPTIONS: { value: PlaceholderKind; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
  { value: 'diagram', label: 'Diagram' },
  { value: 'generic', label: 'Other' },
]

interface ParagraphTextEditorProps {
  projectId: string
  chapterId: string
  block: ParagraphBlock
  /** The full chapter block list — needed to find the immediately preceding
   * sibling, so Backspace-at-start can tell whether merging into it is
   * possible (mirrors `Page.tsx`'s `canMergeWithPrevious`, Phase 113). */
  chapterBlocks: ContentBlock[]
}

/**
 * A second, always-available way to edit a paragraph's text — the on-canvas
 * double-click + floating toolbar (`paragraph.tsx`) still works, but this
 * gives a dedicated, always-visible box in the sidebar so a user doesn't
 * have to find and precisely double-click the right spot on the page,
 * especially on a small preview. Reuses the exact same `useEditableField`
 * (html mode) and commits through the exact same `editorActions.editBlock`
 * path, so both editing surfaces stay in sync and go through the same
 * sanitiser/history mechanism — never a second parallel edit path.
 *
 * The parent renders this with `key={block.id}` so selecting a *different*
 * paragraph fully remounts it (resetting edit state); the mount effect then
 * immediately enters edit mode, since the whole point is "click a paragraph,
 * get an editable box" with no extra click required.
 *
 * Phase 113 (2026-08-03, user: "writing in book studio still doesn't feel
 * smooth... when a user is writing a paragraph and presses return/enter
 * then it should start a new paragraph automatically"): this editor is a
 * live-verified case of exactly that complaint — its own help text used to
 * say "Enter saves", meaning Enter here just committed and exited, with no
 * way to keep flowing into a new paragraph, even though the on-canvas
 * editor already got this fix in Phase 111. Now wired to the same
 * `onSplit`/`onMergeWithPrevious` callbacks `paragraph.tsx` uses, through
 * the exact same `editorActions.splitParagraphWithHistory`/
 * `mergeParagraphWithPreviousHistory` — one behaviour, two editing
 * surfaces, not two competing implementations. After a split/merge,
 * `selectForEdit` points the *shared* `selectionStore` selection at the
 * resulting block with the right caret position; because this component
 * fully remounts whenever `selectedBlockId` changes (`key={block.id}` in
 * the parent), its mount effect reads that same
 * `editRequestCaretPosition` to decide where to place the caret — no need
 * for the on-canvas editor's "retry until focus sticks" machinery here,
 * since this box isn't subject to the paginated layout engine's async
 * remounts (see `useTypewriterMode`/`Page.tsx`'s own doc comments for why
 * that race exists there and not here).
 *
 * Phase 117 (2026-08-03) added live spell-check underlining and the
 * Synonyms/Fix-spelling floating toolbar here too, for the same "one
 * behaviour, two editing surfaces" reason as the split/merge wiring above —
 * found live-testing in Chrome that selecting a paragraph (including via
 * the on-canvas double-click that's supposed to start editing *there*)
 * always mounts this component fresh, and its own mount effect immediately
 * calls `field.startEditing()`, which in practice usually wins actual DOM
 * focus over `paragraph.tsx`'s own `primary.startEditing()` call. Before
 * this fix, that meant a user who thought they were typing in the on-canvas
 * field (which had live spell-check) was actually typing here (which
 * didn't) — seeing only the *browser's own* native spellchecker underlining
 * everything it didn't recognise, with no custom "Fix spelling" affordance
 * at all. Rather than trying to win that focus race (Phase 51 designed this
 * box to always grab focus on selection, on purpose), both surfaces now
 * carry the exact same spell-check behaviour, so it doesn't matter which
 * one actually ends up with focus.
 *
 * Phase 118 (2026-08-03, user: "if the user hits enter shouldn't it start a
 * new paragraph and immediately let them type without having to click
 * again?") — found live-testing that a *second* focus-race bug had survived
 * Phase 117's fix: this box's mount effect never told `selectionStore` that
 * its own focus had landed, so `editRequestId` stayed live after a split
 * even once this box was genuinely, stably focused. `paragraph.tsx`'s
 * on-canvas field keeps retrying `startEditing()` on every pagination-driven
 * remount of the freshly-split paragraph *as long as `editRequestId` is
 * still set* (see its own doc comment) — with nothing here ever clearing
 * that flag, the on-canvas field could win a later remount, steal focus back
 * from this box, consume the request on that transient focus, and then lose
 * focus itself on the *next* remount with no request left to retry against —
 * leaving neither surface focused at all. The `onFocus` below closes that
 * gap: since this box isn't subject to the layout engine's async remounts
 * (see this comment's own note above on why), its focus is the one point of
 * genuine stability in the whole race, so it's the right place to tell
 * `selectionStore` the request is fulfilled — stopping the on-canvas side
 * from ever trying to reclaim it on a later remount.
 */
function ParagraphTextEditor({ projectId, chapterId, block, chapterBlocks }: ParagraphTextEditorProps) {
  const selectForEdit = useSelectionStore((s) => s.selectForEdit)
  const editRequestCaretPosition = useSelectionStore((s) => s.editRequestCaretPosition)
  const consumeEditRequest = useSelectionStore((s) => s.consumeEditRequest)

  const indexInChapter = chapterBlocks.findIndex((b) => b.id === block.id)
  const previousBlock = indexInChapter > 0 ? chapterBlocks[indexInChapter - 1] : undefined
  const canMergeWithPrevious = previousBlock?.type === 'paragraph'

  const field = useEditableField({
    mode: 'html',
    initialValue: block.html,
    onCommit: (value) => editBlock(projectId, chapterId, block.id, { html: value }),
    onSplit: (before, after) => {
      const newBlockId = splitParagraphWithHistory(projectId, chapterId, block.id, before, after)
      if (newBlockId) selectForEdit(chapterId, newBlockId, 'start')
    },
    onMergeWithPrevious: canMergeWithPrevious
      ? () => {
          const result = mergeParagraphWithPreviousHistory(projectId, chapterId, block.id)
          if (result) selectForEdit(chapterId, result.mergedBlockId, result.caretOffset)
        }
      : undefined,
  })

  useEffect(() => {
    field.startEditing(editRequestCaretPosition)
    // Only on mount — see the `key={block.id}` note above. Deliberately
    // capturing whatever `editRequestCaretPosition` was at mount time (the
    // eslint-disable is for the same reason `paragraph.tsx`'s equivalent
    // effect has one): re-running this on every store change would re-enter
    // edit mode mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 117: same live spell-check as the on-canvas field — see this
  // component's own doc comment for why both surfaces need it.
  useLiveSpellcheck(field.ref, field.isEditing, projectId)

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Paragraph text</Label>
      <div
        ref={(el) => {
          field.ref.current = el
        }}
        onClick={!field.isEditing ? () => field.startEditing() : undefined}
        contentEditable={field.isEditing}
        suppressContentEditableWarning
        // See the on-canvas field's identical comment (`paragraph.tsx`) —
        // the browser's own native spellchecker would otherwise show a
        // second, uncorrectable set of squiggles alongside the real one.
        spellCheck={false}
        // Phase 118 — see this component's own doc comment: clearing the
        // shared edit request here (not just in `paragraph.tsx`) is what
        // stops the on-canvas field from trying to reclaim focus on a later
        // pagination remount once this box has genuinely, stably focused.
        onFocus={() => consumeEditRequest()}
        onBlur={field.handleBlur}
        onKeyDown={field.handleKeyDown}
        className="min-h-[100px] cursor-text rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary outline-none focus:border-[var(--color-accent)]"
        {...(!field.isEditing ? { dangerouslySetInnerHTML: { __html: block.html } } : {})}
      />
      <FloatingFormatToolbar containerRef={field.ref} active={field.isEditing} projectId={projectId} />
      <p className="text-xs text-text-secondary">Enter starts a new paragraph · Shift+Enter for a line break · Esc cancels</p>
    </div>
  )
}

function findBlock(chapters: Chapter[], chapterId: string, blockId: string) {
  const chapter = chapters.find((c) => c.id === chapterId)
  const block = chapter?.blocks.find((b) => b.id === blockId)
  return { chapter, block }
}

/** Plain-text content of a block, for word counts — never used for display markup. */
function blockPlainText(block: ContentBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text
    case 'paragraph':
      return stripHtml(block.html)
    case 'quote':
      return block.text
    case 'list':
      return block.items.join(' ')
    case 'table':
      return [...block.header, ...block.rows.flat()].join(' ')
    case 'image':
      return ''
    case 'pull-quote':
      return block.text
    case 'callout':
      return block.text
    case 'case-study':
      return `${block.title} ${block.text}`.trim()
    case 'timeline':
      return block.entries.map((e) => `${e.label} ${e.text}`).join(' ')
    case 'gallery':
      return block.caption ?? ''
    case 'faq':
      return block.entries.map((e) => `${e.question} ${e.answer}`).join(' ')
    case 'statistics':
      return block.entries.map((e) => `${e.value} ${e.label}`).join(' ')
    case 'checklist':
      return block.items.map((i) => i.text).join(' ')
    case 'placeholder':
      return `${block.label ?? ''} ${block.description ?? ''}`.trim()
  }
}

/**
 * Type tab of the Inspector: shows the currently selected text block and,
 * where it makes sense, lets the user adjust it. Selection lives in
 * `selectionStore` (Layer: ephemeral UI state) and is resolved against the
 * real manuscript in `contentStore` (Layer 2) — this panel never mutates
 * content directly, only via `editorActions.editBlock` (a history-aware
 * wrapper around `contentStore.updateBlock`, see `editorActions.ts`).
 */
export function TypographyPanel({ projectId }: TypographyPanelProps) {
  const selectedChapterId = useSelectionStore((s) => s.selectedChapterId)
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))

  const { chapter, block } =
    manuscript && selectedChapterId && selectedBlockId
      ? findBlock(manuscript.chapters, selectedChapterId, selectedBlockId)
      : { chapter: undefined, block: undefined }

  // Gallery gets the same treatment as Image — it's images-only (plus an
  // optional whole-gallery caption), not a text block to inspect here.
  if (!chapter || !block || block.type === 'image' || block.type === 'gallery') {
    return (
      <EmptyState
        icon={Type}
        title="No text selected"
        description="Select a paragraph or heading in the preview to inspect it here."
        className="py-12"
      />
    )
  }

  const words = wordCount(blockPlainText(block))

  return (
    <div className="flex flex-col gap-4 px-1 pt-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-primary">{BLOCK_LABELS[block.type]}</p>
        <p className="text-xs text-text-secondary">
          In &ldquo;{chapter.title}&rdquo; · {words} {words === 1 ? 'word' : 'words'}
        </p>
      </div>

      <Separator />

      {block.type === 'paragraph' && (
        <ParagraphTextEditor
          key={block.id}
          projectId={projectId}
          chapterId={chapter.id}
          block={block}
          chapterBlocks={chapter.blocks}
        />
      )}

      {block.type === 'heading' && (
        <div className="flex flex-col gap-1.5">
          <Label>Heading level</Label>
          <Select
            value={String(block.level)}
            onValueChange={(value) =>
              editBlock(projectId, chapter.id, block.id, { level: Number(value) as 2 | 3 })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">Heading 2 — Chapter title</SelectItem>
              <SelectItem value="3">Heading 3 — Section</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {block.type === 'list' && (
        <p className="text-sm text-text-secondary">
          {block.ordered ? 'Numbered list' : 'Bulleted list'} · {block.items.length}{' '}
          {block.items.length === 1 ? 'item' : 'items'}
        </p>
      )}

      {block.type === 'table' && (
        <p className="text-sm text-text-secondary">
          {block.rows.length} rows × {block.header.length} columns
        </p>
      )}

      {block.type === 'quote' && block.attribution && (
        <p className="text-sm text-text-secondary">Attributed to {block.attribution}</p>
      )}

      {block.type === 'placeholder' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Kind</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {PLACEHOLDER_KIND_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={block.kind === option.value ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => editBlock(projectId, chapter.id, block.id, { kind: option.value })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-text-secondary">
            Double-click the title or description in the preview to edit them directly.
          </p>
        </>
      )}
    </div>
  )
}
