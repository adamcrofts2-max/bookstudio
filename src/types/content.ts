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
  | 'pull-quote'
  | 'callout'
  | 'case-study'
  | 'timeline'
  | 'gallery'
  | 'faq'
  | 'statistics'
  | 'checklist'
  | 'placeholder'

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

/**
 * Modular Page System Milestone 5 (see docs/MODULAR_PAGE_SYSTEM_PLAN.md, §7.5)
 * — in-chapter rich content blocks. Each flows through the existing,
 * unmodified `paginate.ts` auto-flow engine exactly like a paragraph or image
 * does today; every field below follows the same "optional field, default in
 * code, never migrate" rule already proven six times in this project (see
 * `ImageBlock`'s doc comments above for the exact style).
 */

/**
 * A large, decorative, magazine-style extracted quote — visually distinct
 * from `QuoteBlock` (a small left-ruled blockquote): bigger centred type,
 * flanking rule marks, no left rule. `attribution` is optional — manuscripts
 * that create one without an attribution simply omit the field.
 */
export interface PullQuoteBlock {
  id: string
  type: 'pull-quote'
  text: string
  attribution?: string
}

/**
 * One generalized callout type with a `variant`, per the plan's §7.5
 * guidance (and Phase 21's Glossary/Bibliography precedent for generalizing
 * instead of taxonomy-bloating) — NOT three near-identical Tip/Warning/Info
 * block types. `title` is optional; `text` is the callout's body.
 */
export interface CalloutBlock {
  id: string
  type: 'callout'
  variant: 'tip' | 'warning' | 'info'
  title?: string
  text: string
}

/** Heading + body paragraph(s) in a boxed/bordered treatment, set apart from
 * regular flowing body text. */
export interface CaseStudyBlock {
  id: string
  type: 'case-study'
  title: string
  text: string
}

/** A vertical timeline — each entry pairs a short label (a date/milestone)
 * with a description, connected by a vertical rule + dot marker. `entries` is
 * required (defaults to `[]` in `defaultContent`-equivalent construction, per
 * this registry's convention — see `src/blocks/types/timeline.tsx`). */
export interface TimelineBlock {
  id: string
  type: 'timeline'
  entries: { label: string; text: string }[]
}

/**
 * A grid of multiple images from the asset library. `assetIds` is the first
 * multi-asset field in this codebase (every prior asset reference —
 * `ImageBlock.assetId`, `CoverPage.content.imageAssetId` — is singular); it
 * reuses the exact same `assetStore`/`assetDb`/`imageForPdf.ts` embedding
 * pipeline per id, just looped. `caption` is optional and applies to the
 * whole gallery, not per-image (per-image captions are out of scope this
 * milestone).
 */
export interface GalleryBlock {
  id: string
  type: 'gallery'
  assetIds: string[]
  caption?: string
}

/** A list of question/answer pairs — each question renders bold, its answer
 * regular-weight beneath it. */
export interface FaqBlock {
  id: string
  type: 'faq'
  entries: { question: string; answer: string }[]
}

/** A row of big bold numbers/values, each with a small caption beneath —
 * typical "stat block" treatment. */
export interface StatisticsBlock {
  id: string
  type: 'statistics'
  entries: { value: string; label: string }[]
}

/** A list of items, each with an independently toggleable checked state.
 * The checkbox glyph is drawn (not a native `<input type=checkbox>`, which
 * would fight the inline-contentEditable pattern used everywhere else in
 * this codebase) — clicking it toggles `checked` via `onCommit`, exactly
 * like every other field in this block system. */
export interface ChecklistBlock {
  id: string
  type: 'checklist'
  items: { text: string; checked: boolean }[]
}

export type PlaceholderKind = 'image' | 'chart' | 'table' | 'diagram' | 'generic'

/**
 * A visible stand-in for content that doesn't exist yet — "photo of the
 * author goes here", "insert a sales chart", etc. — so a draft can be laid
 * out and paginated before every real asset is ready, per the user's
 * request (see docs/STATUS.md Phase 48). Deliberately renders (and
 * exports) as an obvious dashed box with its `label`/`description`, never
 * as invisible/blank space: a silent gap in an exported PDF/EPUB is a real
 * defect a first-time author might not notice before printing, whereas an
 * obvious placeholder box is an honest, visible reminder. See
 * `virtualEditor/checkers/commercialQuality.ts`'s
 * `remainingPlaceholdersChecker` for the matching pre-export warning.
 */
export interface PlaceholderBlock {
  id: string
  type: 'placeholder'
  kind: PlaceholderKind
  /** Short title, e.g. "Author photo". */
  label?: string
  /** Longer note on what should go here, e.g. "Full-bleed portrait,
   * outdoors, high-res". */
  description?: string
}

/**
 * The 14 block-type interfaces above share no base interface (see
 * `docs/MODULAR_PAGE_SYSTEM_PLAN.md`), so a genuinely cross-cutting field —
 * one that means the same thing regardless of block type — is added by
 * intersecting the whole union with a small object type here, rather than
 * editing all 14 interfaces individually. `breakAfter` (Phase 51) is the
 * first field to need this: "force a fresh page immediately after this
 * block", e.g. for a chapter-opener that's a title + photo with no text
 * underneath, where the following paragraph text should always start a new
 * page rather than flow up onto whatever space is left. Read via
 * `renderer/paginate.ts`'s pagination loop and `pdf/exportPdf.ts`'s PDF
 * pagination, so screen and print stay identical.
 */
export type ContentBlock = (
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | ListBlock
  | TableBlock
  | QuoteBlock
  | PullQuoteBlock
  | CalloutBlock
  | CaseStudyBlock
  | TimelineBlock
  | GalleryBlock
  | FaqBlock
  | StatisticsBlock
  | ChecklistBlock
  | PlaceholderBlock
) & {
  breakAfter?: boolean
}

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
