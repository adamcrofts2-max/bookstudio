import { useEffect } from 'react'
import { Type } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { editBlock } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { useEditableField } from '@/blocks/shared'
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
 */
function ParagraphTextEditor({ projectId, chapterId, block }: ParagraphTextEditorProps) {
  const field = useEditableField({
    mode: 'html',
    initialValue: block.html,
    onCommit: (value) => editBlock(projectId, chapterId, block.id, { html: value }),
  })

  useEffect(() => {
    field.startEditing()
    // Only on mount — see the `key={block.id}` note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        onBlur={field.handleBlur}
        onKeyDown={field.handleKeyDown}
        className="min-h-[100px] cursor-text rounded-[var(--radius-card)] border border-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary outline-none focus:border-[var(--color-accent)]"
        {...(!field.isEditing ? { dangerouslySetInnerHTML: { __html: block.html } } : {})}
      />
      <p className="text-xs text-text-secondary">Enter saves · Shift+Enter for a line break · Esc cancels</p>
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
        <ParagraphTextEditor key={block.id} projectId={projectId} chapterId={chapter.id} block={block} />
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
