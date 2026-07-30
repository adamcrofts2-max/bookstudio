/**
 * Virtual Editor — text patch helpers.
 *
 * Turns a "replace this text span with this new text" instruction into a
 * `Partial<ContentBlock>` patch, without ever touching `contentStore`
 * itself. Checkers use these to build `SuggestedFix.apply`; the actual
 * `contentStore.updateBlock` call happens only in `virtualEditorStore`.
 */

import type { ContentBlock } from '@/types/content'

/** Reads the raw (unstripped) text currently held at `field` on `block`. */
export function getRawFieldText(block: ContentBlock, field: string): string {
  if (block.type === 'paragraph' && field === 'html') return block.html
  if (block.type === 'heading' && field === 'text') return block.text
  if (block.type === 'quote' && field === 'text') return block.text
  if (block.type === 'quote' && field === 'attribution') return block.attribution ?? ''
  if (block.type === 'image' && field === 'caption') return block.caption ?? ''

  const singleIndex = /^items\[(\d+)\]$/.exec(field)
  if (block.type === 'list' && singleIndex) return block.items[Number(singleIndex[1])] ?? ''

  const headerIndex = /^header\[(\d+)\]$/.exec(field)
  if (block.type === 'table' && headerIndex) return block.header[Number(headerIndex[1])] ?? ''

  const rowIndex = /^rows\[(\d+)\]\[(\d+)\]$/.exec(field)
  if (block.type === 'table' && rowIndex) return block.rows[Number(rowIndex[1])]?.[Number(rowIndex[2])] ?? ''

  return ''
}

/** Returns a patch that replaces `field` on `block` with `transform(currentRawText)`. */
export function patchTextField(
  block: ContentBlock,
  field: string,
  transform: (currentText: string) => string,
): Partial<ContentBlock> {
  const current = getRawFieldText(block, field)
  const next = transform(current)

  if (block.type === 'paragraph' && field === 'html') return { html: next }
  if (block.type === 'heading' && field === 'text') return { text: next }
  if (block.type === 'quote' && field === 'text') return { text: next }
  if (block.type === 'quote' && field === 'attribution') return { attribution: next }
  if (block.type === 'image' && field === 'caption') return { caption: next }

  const singleIndex = /^items\[(\d+)\]$/.exec(field)
  if (block.type === 'list' && singleIndex) {
    const items = block.items.slice()
    items[Number(singleIndex[1])] = next
    return { items }
  }

  const headerIndex = /^header\[(\d+)\]$/.exec(field)
  if (block.type === 'table' && headerIndex) {
    const header = block.header.slice()
    header[Number(headerIndex[1])] = next
    return { header }
  }

  const rowIndex = /^rows\[(\d+)\]\[(\d+)\]$/.exec(field)
  if (block.type === 'table' && rowIndex) {
    const rows = block.rows.map((row) => row.slice())
    const ri = Number(rowIndex[1])
    const ci = Number(rowIndex[2])
    if (rows[ri]) rows[ri][ci] = next
    return { rows }
  }

  return {}
}
