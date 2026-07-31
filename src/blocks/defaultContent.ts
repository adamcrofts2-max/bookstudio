import { generateId } from '@/utils'
import type { ContentBlock, ContentBlockType } from '@/types/content'

/**
 * Block types the "+" inserter (`InsertBlockButton.tsx`) offers — every
 * `ContentBlockType` except `image`/`gallery`, which need a real asset
 * picked first (images are created via drag-and-drop from the asset
 * library — `Page.tsx`'s `handleDropAsset`/`ImageDropZone` — and there's no
 * equivalent "pick images for a new gallery" flow yet). See
 * docs/ROADMAP.md Phase B.
 */
export type InsertableBlockType = Exclude<ContentBlockType, 'image' | 'gallery'>

export const INSERTABLE_BLOCK_TYPES: InsertableBlockType[] = [
  'paragraph',
  'heading',
  'quote',
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
