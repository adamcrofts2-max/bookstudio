/**
 * Layer 2 — Content
 *
 * Pure manuscript content: chapters, paragraphs, tables, lists, images
 * and captions. No styling ever lives here — presentation is entirely
 * the responsibility of the Theme (Layer 3) and Layout Engine (Layer 4).
 *
 * These shapes are intentionally minimal placeholders for the
 * foundation milestone. The manuscript importer (Phase 2) will expand
 * on them without needing to change Layers 1, 3, 4 or 5.
 */

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'list'
  | 'table'
  | 'quote'
  | 'caption'

export interface ContentBlock {
  id: string
  type: ContentBlockType
  text?: string
}

export interface Chapter {
  id: string
  title: string
  order: number
  blocks: ContentBlock[]
}

export interface Manuscript {
  chapters: Chapter[]
}
