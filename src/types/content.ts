/**
 * Layer 2 — Content
 *
 * Pure manuscript content: chapters, paragraphs, tables, lists, images
 * and captions. No styling ever lives here — presentation is entirely
 * the responsibility of the Theme (Layer 3) and Layout Engine (Layer 4).
 */

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'list'
  | 'table'
  | 'quote'

export interface HeadingBlock {
  id: string
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

export interface ParagraphBlock {
  id: string
  type: 'paragraph'
  /** Inline HTML fragment: only <strong>, <em>, <a> survive import. */
  html: string
}

export interface ImageBlock {
  id: string
  type: 'image'
  assetId: string
  caption?: string
  /** 0 | 90 | 180 | 270 */
  rotation: 0 | 90 | 180 | 270
  /**
   * Percentage (of the content column width) to render the image at.
   * Optional — manuscripts persisted before this field existed don't have
   * it. Always read as `block.widthPercent ?? 100`, never migrated, per
   * `contentStore`'s "no required migrations for new optional fields" rule.
   * Discrete presets only (see `ImagePanel.tsx`): 40 / 65 / 85 / 100.
   */
  widthPercent?: number
}

export interface ListBlock {
  id: string
  type: 'list'
  ordered: boolean
  items: string[]
}

export interface TableBlock {
  id: string
  type: 'table'
  header: string[]
  rows: string[][]
}

export interface QuoteBlock {
  id: string
  type: 'quote'
  text: string
  attribution?: string
}

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | ListBlock
  | TableBlock
  | QuoteBlock

export interface Chapter {
  id: string
  title: string
  order: number
  blocks: ContentBlock[]
}

export interface Manuscript {
  chapters: Chapter[]
  importedAt: string
  sourceFileName: string
}
