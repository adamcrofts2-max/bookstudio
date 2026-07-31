/**
 * Layer 2 (additive) — Structural Pages
 *
 * `docs/MODULAR_PAGE_SYSTEM_PLAN.md`, Milestone 2. A new, separate concept
 * from `Chapter`/`ContentBlock` (see `src/types/content.ts`): front-matter
 * and back-matter pages that don't reflow — Cover, Title Page, Copyright,
 * Blank Page today; ~30 more types queued for later milestones per the
 * plan's §7.4 batching.
 *
 * Discriminated union, exactly like `ContentBlock` — not a generic untyped
 * `content: Record<string, unknown>` bag, per this codebase's established
 * convention (see `docs/MODULAR_PAGE_SYSTEM_PLAN.md` §6 and Milestone 1's
 * block-type registry).
 *
 * Purely additive: `Manuscript.chapters`/`ContentBlock` are untouched by
 * this file. `structuralPageStore.ts` defaults every project's structural
 * pages to `[]` — existing projects need zero migration.
 */

export type StructuralPageCategory = 'front-matter' | 'back-matter'

interface BaseStructuralPage {
  id: string
  category: StructuralPageCategory
  order: number
  /** Reserved for a future theme-extension milestone — always undefined
   * today, never read. */
  themeOverrides?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /**
   * Asset ids this page references (e.g. a cover background image) — lets
   * future asset-cleanup logic know a structural page holds a reference,
   * mirroring how `ImageBlock.assetId` works today. Kept in sync with
   * `CoverPage.content.imageAssetId` by `structuralPageStore.updatePageContent`.
   */
  assets?: string[]
  printSettings?: Record<string, unknown>
  exportSettings?: Record<string, unknown>
}

/**
 * Vertical anchor for a Cover/Back Cover's text block — absent means
 * `'centered'`, preserving every pre-existing project's current look with
 * zero migration. See `docs/STATUS.md` Phase 45 for the full cover-designer
 * reasoning.
 */
export type CoverTextLayout = 'centered' | 'top' | 'bottom'

/**
 * Where the "important part" of a Cover/Back Cover's background image
 * sits, as a fraction of the image (`0,0` top-left, `1,1` bottom-right,
 * `0.5,0.5` centre — today's fixed crop). Set by clicking the image in the
 * on-screen preview. Absent means `0.5,0.5`, so every pre-existing project
 * keeps its exact current crop. See `docs/STATUS.md` Phase 46.
 */
export interface CoverImageFocalPoint {
  x: number
  y: number
}

/**
 * Overlay drawn on a Cover/Back Cover's background image so text stays
 * readable. `'flat'` (absent default) is a uniform tint across the whole
 * image — the pre-existing, previously-fixed behaviour. The two
 * `'gradient-*'` options only darken the end of the image nearest the
 * text, matching whichever `layout` anchor is active, which keeps far more
 * of a photo's real detail visible than a flat tint. `'none'` removes the
 * overlay entirely (best for already-dark or low-contrast images).
 */
export type CoverOverlayStyle = 'flat' | 'gradient-bottom' | 'gradient-top' | 'none'

/**
 * Which of the app's two embedded font families a Cover/Back Cover's text
 * uses — deliberately independent of the book's interior theme (a
 * professional cover conventionally looks different from the inside
 * pages). `'theme'` (absent default) inherits the interior theme's
 * heading/body fonts exactly as before this milestone. Only two real
 * choices exist because those are the only families this app currently
 * embeds for PDF export (see `pdf/fonts.ts`) — `public/fonts/custom/`
 * exists for dropping in more later; see that folder's README.
 */
export type CoverFontChoice = 'theme' | 'serif' | 'sans'

export interface CoverTypographyOverride {
  fontChoice?: CoverFontChoice
  /** Applies to the dominant text element only (Cover's title, Back
   * Cover's blurb) — every other field (subtitle/author/authorBio) keeps
   * its existing fixed size/weight relative to it, same as before this
   * milestone. */
  weight?: number
  italic?: boolean
  /** Multiplier on the existing fixed size (Cover title's `2.6em`, Back
   * Cover blurb's `1.05em`) — `1` or absent reproduces today's exact
   * size. */
  sizeScale?: number
}

export interface CoverPage extends BaseStructuralPage {
  type: 'cover'
  content: {
    title?: string
    subtitle?: string
    author?: string
    imageAssetId?: string
    layout?: CoverTextLayout
    /**
     * Fine-tune vertical offset within the chosen `layout` zone, from a
     * drag handle in the on-screen preview — range `-1` (as far toward the
     * top as the zone allows) to `1` (as far toward the bottom), `0` or
     * absent meaning no offset. Deliberately a single normalised number
     * rather than raw pixels so it stays meaningful across different trim
     * sizes and screen-vs-PDF coordinate spaces — see `cover.tsx`'s
     * `NUDGE_RANGE_PX` / `drawCoverPdf`'s matching PDF-point range.
     */
    verticalNudge?: number
    imageFocalPoint?: CoverImageFocalPoint
    /** `>= 1`; `1` or absent is the pre-existing plain cover-fit crop. */
    imageZoom?: number
    overlayStyle?: CoverOverlayStyle
    /** `0..1`; absent means the pre-existing fixed `0.35`. */
    overlayOpacity?: number
    typography?: CoverTypographyOverride
  }
}

export interface TitlePage extends BaseStructuralPage {
  type: 'title-page'
  content: { title?: string; subtitle?: string; author?: string }
}

export interface CopyrightPage extends BaseStructuralPage {
  type: 'copyright'
  content: { text?: string }
}

export interface BlankStructuralPage extends BaseStructuralPage {
  type: 'blank'
  content: Record<string, never>
}

/**
 * Phase 20 (Milestone 4, first batch of 5): five more front-matter types,
 * following the exact same discriminated-union shape as the 4 above — see
 * `src/structuralPages/types/{halfTitle,dedication,foreword,preface,
 * acknowledgements}.tsx` and `docs/STATUS.md`'s Phase 20 entry.
 */
export interface HalfTitlePage extends BaseStructuralPage {
  type: 'half-title'
  content: { title?: string }
}

export interface DedicationPage extends BaseStructuralPage {
  type: 'dedication'
  content: { text?: string }
}

export interface ForewordPage extends BaseStructuralPage {
  type: 'foreword'
  content: { text?: string; authorName?: string }
}

export interface PrefacePage extends BaseStructuralPage {
  type: 'preface'
  content: { text?: string }
}

export interface AcknowledgementsPage extends BaseStructuralPage {
  type: 'acknowledgements'
  content: { text?: string }
}

/**
 * Phase 21 (Milestone 4, second batch): eight back-matter types, following
 * the exact same discriminated-union shape as everything above — see
 * `src/structuralPages/types/{conclusion,appendix,aboutTheAuthor,
 * bibliography,glossary,indexPage,isbnPage,barcode}.tsx` and
 * `docs/STATUS.md`'s Phase 21 entry.
 */
export interface ConclusionPage extends BaseStructuralPage {
  type: 'conclusion'
  content: { text?: string }
}

export interface AppendixPage extends BaseStructuralPage {
  type: 'appendix'
  content: { title?: string; text?: string }
}

export interface AboutTheAuthorPage extends BaseStructuralPage {
  type: 'about-the-author'
  content: { text?: string; imageAssetId?: string }
}

export interface BibliographyPage extends BaseStructuralPage {
  type: 'bibliography'
  content: { entries?: string[] }
}

export interface GlossaryPage extends BaseStructuralPage {
  type: 'glossary'
  content: { entries?: { term: string; definition: string }[] }
}

export interface IndexPage extends BaseStructuralPage {
  type: 'index'
  content: { entries?: string[] }
}

export interface IsbnPage extends BaseStructuralPage {
  type: 'isbn-page'
  content: { isbn?: string; edition?: string; printerInfo?: string }
}

export interface BarcodePage extends BaseStructuralPage {
  type: 'barcode'
  content: { isbn?: string }
}

/**
 * Back-matter's final page: the back cover. Same full-bleed
 * image-or-tinted-background treatment as `CoverPage`, but the dominant
 * content is back-cover copy (a blurb/synopsis) rather than a big title —
 * conventionally the book's title/author already appear on the front cover
 * and don't need repeating. `authorBio` is a short, separate line (distinct
 * from the full "About the Author" back-matter page, which is a whole page
 * to itself). See docs/ROADMAP.md Phase E.
 */
export interface BackCoverPage extends BaseStructuralPage {
  type: 'back-cover'
  content: {
    blurb?: string
    authorBio?: string
    imageAssetId?: string
    layout?: CoverTextLayout
    verticalNudge?: number
    imageFocalPoint?: CoverImageFocalPoint
    imageZoom?: number
    overlayStyle?: CoverOverlayStyle
    overlayOpacity?: number
    typography?: CoverTypographyOverride
  }
}

export type StructuralPage =
  | CoverPage
  | TitlePage
  | CopyrightPage
  | BlankStructuralPage
  | HalfTitlePage
  | DedicationPage
  | ForewordPage
  | PrefacePage
  | AcknowledgementsPage
  | ConclusionPage
  | AppendixPage
  | AboutTheAuthorPage
  | BibliographyPage
  | GlossaryPage
  | IndexPage
  | IsbnPage
  | BarcodePage
  | BackCoverPage
export type StructuralPageType = StructuralPage['type']
