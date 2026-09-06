/**
 * Virtual Editor — text extraction helpers.
 *
 * Checkers never touch the DOM or reach into rendering — they work purely
 * off plain text pulled from a `ContentBlock`. This module is the single
 * place that knows how to flatten each block type into text spans, so
 * every checker sees a consistent shape.
 */

import type { Manuscript, ContentBlock } from '@/types/content'
import { stripHtml } from '@/utils/format'

/** One piece of checkable plain text within a block (a block may contain
 * several — a table has one span per cell, a list one per item). */
export interface TextSpan {
  chapterId: string
  blockId: string
  /** Sub-location within the block, for messages only (e.g. "row 2, column 3"). */
  field: string
  text: string
}

/** Flattens every block in every chapter of a manuscript into plain-text
 * spans a checker can run string/regex analysis against. */
export function extractTextSpans(manuscript: Manuscript): TextSpan[] {
  const spans: TextSpan[] = []

  for (const chapter of manuscript.chapters) {
    for (const block of chapter.blocks) {
      spans.push(...blockTextSpans(chapter.id, block))
    }
  }

  return spans
}

function blockTextSpans(chapterId: string, block: ContentBlock): TextSpan[] {
  switch (block.type) {
    case 'heading':
      return [{ chapterId, blockId: block.id, field: 'text', text: block.text }]
    case 'paragraph':
      return [{ chapterId, blockId: block.id, field: 'html', text: stripHtml(block.html) }]
    case 'quote':
      return [
        { chapterId, blockId: block.id, field: 'text', text: block.text },
        ...(block.attribution
          ? [{ chapterId, blockId: block.id, field: 'attribution', text: block.attribution }]
          : []),
      ]
    case 'verse':
      // One span per line, so a spelling fix lands on the line it belongs
      // to. Stanza breaks are empty and carry nothing to check.
      return block.lines.flatMap((line, i) =>
        line.trim() === '' ? [] : [{ chapterId, blockId: block.id, field: `lines[${i}]`, text: line }],
      )
    case 'list':
      return block.items.map((item, i) => ({
        chapterId,
        blockId: block.id,
        field: `items[${i}]`,
        text: item,
      }))
    case 'table':
      return [
        ...block.header.map((cell, i) => ({
          chapterId,
          blockId: block.id,
          field: `header[${i}]`,
          text: cell,
        })),
        ...block.rows.flatMap((row, ri) =>
          row.map((cell, ci) => ({
            chapterId,
            blockId: block.id,
            field: `rows[${ri}][${ci}]`,
            text: cell,
          })),
        ),
      ]
    case 'image':
      return block.caption ? [{ chapterId, blockId: block.id, field: 'caption', text: block.caption }] : []
    default:
      return []
  }
}

/** Plain text of a single block (used where a checker needs whole-block
 * context rather than per-field spans, e.g. "does this paragraph end in
 * punctuation"). */
export function blockPlainText(block: ContentBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text
    case 'paragraph':
      return stripHtml(block.html)
    case 'quote':
      return block.text
    case 'verse':
      return block.lines.join(' ')
    case 'list':
      return block.items.join(' ')
    case 'table':
      return [...block.header, ...block.rows.flat()].join(' ')
    case 'image':
      return block.caption ?? ''
    default:
      return ''
  }
}
