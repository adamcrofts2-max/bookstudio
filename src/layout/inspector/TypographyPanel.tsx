import { Type } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/common/EmptyState'
import { useContentStore } from '@/store/contentStore'
import { editBlock } from '@/store/editorActions'
import { useSelectionStore } from '@/store/selectionStore'
import { stripHtml, wordCount } from '@/utils'
import type { Chapter, ContentBlock } from '@/types/content'

interface TypographyPanelProps {
  projectId: string
}

const BLOCK_LABELS: Record<ContentBlock['type'], string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  quote: 'Pull quote',
  list: 'List',
  table: 'Table',
  image: 'Image',
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

  if (!chapter || !block || block.type === 'image') {
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
    </div>
  )
}
