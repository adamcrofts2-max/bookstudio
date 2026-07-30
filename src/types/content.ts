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
  /**
   * Separate accessibility text for screen readers. Optional — falls back to
   * `caption` when absent (`block.altText ?? block.caption ?? ''`), so
   * existing manuscripts that predate this field keep working unchanged.
   */
  altText?: string
  /** 0 | 90 | 180 | 270 */
  rotation: 0 | 90 | 180 | 270
  /**
   * Percentage (of the content column width) to render the image at.
   * Optional — manuscripts persisted before this field existed don't have
   * it. Always read as `block.widthPercent ?? 100`, never migrated, per
   * `contentStore`'s "no required migrations for new optional fields" rule.
   * Discrete presets only (see `ImagePanel.tsx`): 40 / 65 / 85 / 100.
   * Superseded by `widthMm` when that field is set (see below).
   */
  widthPercent?: number
  /**
   * Explicit physical width in millimetres — set when the user picks the
   * "Custom" size option in `ImagePanel.tsx`. When present, takes precedence
   * over `widthPercent` everywhere the block is rendered (on-screen via
   * `BlockContent.tsx`'s `PX_PER_MM` conversion, and in the exported PDF via
   * `exportPdf.ts`'s `PX_PER_MM` → `PX_TO_PT` chain) so the same physical
   * size lands in both places.
   */
  widthMm?: number
  /** Explicit physical height in millimetres, paired with `widthMm`. */
  heightMm?: number
  /**
   * Whether editing `widthMm`/`heightMm` in `ImagePanel.tsx` keeps the
   * asset's natural aspect ratio (recomputing the other dimension
   * automatically). Defaults to `true` when absent.
   */
  aspectLocked?: boolean
  /**
   * Render the image in grayscale. On-screen this is a CSS `filter` (no
   * layout effect, safe for `HeightMeasurer`); in the PDF export it's baked
   * into the rasterised pixels by `imageForPdf.ts`'s `blobToPng`, since a CSS
   * filter has no effect on embedded PDF image data.
   */
  grayscale?: boolean
  /**
   * Horizontal alignment within the content column. Defaults to `'center'`
   * when absent, matching the always-`mx-auto` behaviour that existed
   * before this field was introduced — existing manuscripts are never
   * migrated, only defaulted in code.
   */
  align?: 'left' | 'center' | 'right'
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
