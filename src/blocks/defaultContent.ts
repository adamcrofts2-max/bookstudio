import { generateId } from '@/utils'
import type { ContentBlock, ContentBlockType } from '@/types/content'

/**
 * Block types the "+" inserter (`InsertBlockButton.tsx`) can create from
 * nothing — every `ContentBlockType` except `image`/`gallery`.
 *
 * Those two are still offered by the same menu; they are excluded from this
 * list because they cannot be built from a type alone. An image needs one
 * real asset id and a gallery needs several, so both go through their own
 * picker callbacks (`onInsertImage`/`onInsertGallery`) and their own
 * factories, rather than `createDefaultBlock`. There is no such thing as a
 * blank image block to fill in afterwards.
 */
export type InsertableBlockType = Exclude<ContentBlockType, 'image' | 'gallery'>

/**
 * Block types that open with a text field the writer should be typing into
 * the moment the block appears.
 *
 * Inserting one of these and *not* landing the caret is not a missing
 * nicety — it silently loses work. Measured on both shells before this
 * existed: "+ → Add paragraph", then type, and the manuscript stored an
 * empty string, because every keystroke went to `document.body`. Same
 * failure Phase 139 fixed for Enter and Phase 144 fixed for "Start
 * writing…", found a third time by auditing for the signature.
 *
 * Deliberately not every insertable type: an image or a placeholder has
 * nothing to type into, and grabbing focus for those would move the caret
 * somewhere the user did not ask for.
 */
export const TEXT_FIRST_BLOCK_TYPES = new Set<string>([
  'paragraph',
  'heading',
  'quote',
  'pull-quote',
  'callout',
  'case-study',
  'list',
  'verse',
])

/** Where the caret goes for a freshly inserted block — `list` starts on its
 * first item, everything else at the start of its single field. */
export function isTextFirstBlock(type: string): boolean {
  return TEXT_FIRST_BLOCK_TYPES.has(type)
}

export const INSERTABLE_BLOCK_TYPES: InsertableBlockType[] = [
  'paragraph',
  'heading',
  'quote',
  'verse',
  'pull-quote',
  'list',
  'table',
  'callout',
  'case-study',
  'timeline',
  'faq',
  'statistics',
  'checklist',
  'placeholder',
]

/**
 * Builds a fresh, minimal-but-valid block of the given type with a new id —
 * the inserter's "blank starting point" for each type. Mirrors
 * `structuralPages/registry.ts`'s `defaultContent()` factories in spirit,
 * generalized here as one function over the discriminated union rather than
 * per-type factories, since (unlike structural pages) every block type
 * shares the same insertion call site (`contentStore.insertBlock`) and none
 * of them need project/sibling context to seed sensible defaults.
 *
 * List/Table seed a couple of empty cells rather than zero — matching
 * `list.tsx`/`table.tsx`'s own documented scope ("no add/remove-entry UI
 * this milestone — only edit existing items inline"), a freshly inserted
 * empty list/table needs at least one editable cell to not be a dead end.
 */
export function createDefaultBlock(type: InsertableBlockType): ContentBlock {
  const id = generateId('block')
  switch (type) {
    case 'paragraph':
      return { id, type, html: '' }
    case 'heading':
      return { id, type, level: 2, text: '' }
    case 'quote':
      return { id, type, text: '' }
    case 'pull-quote':
      return { id, type, text: '' }
    case 'verse':
      // One empty line, so the block has something to type into — the same
      // reasoning as `list`'s single empty item.
      return { id, type, lines: [''] }
    case 'list':
      return { id, type, ordered: false, items: [''] }
    case 'table':
      return { id, type, header: ['', ''], rows: [['', '']] }
    case 'callout':
      return { id, type, variant: 'tip', text: '' }
    case 'case-study':
      return { id, type, title: '', text: '' }
    case 'timeline':
      return { id, type, entries: [] }
    case 'faq':
      return { id, type, entries: [] }
    case 'statistics':
      return { id, type, entries: [] }
    case 'checklist':
      return { id, type, items: [] }
    case 'placeholder':
      // 'image' is the default kind since "photo goes here" is the most
      // common placeholder use case — switch it via the block's Inspector
      // panel afterward if the actual gap is a chart/table/diagram.
      return { id, type, kind: 'image', label: '', description: '' }
  }
}
