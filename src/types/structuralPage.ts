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
 * Which embedded font family a Cover/Back Cover's text uses — deliberately
 * independent of the book's interior theme (a professional cover
 * conventionally looks different from the inside pages). `'theme'` (absent
 * default) inherits the interior theme's heading/body fonts exactly as
 * before this milestone; `'serif'`/`'sans'` are the book's own two interior
 * families (Source Serif 4 / Inter) used cover-only regardless of the
 * theme's own choice. The seven `'anton'`...`'fraunces'` ids are cover-only
 * display/serif faces dropped into `public/fonts/custom/` and wired up in
 * Phase 50 — see `coverTypography.ts` and `pdf/fonts.ts` for why these are
 * deliberately NOT offered as whole-book interior fonts (most are display
 * faces unsuited to running body text).
 */
export type CoverFontChoice =
  | 'theme'
  | 'serif'
  | 'sans'
  | 'anton'
  | 'bebas-neue'
  | 'oswald'
  | 'playfair-display'
  | 'dm-serif-display'
  | 'abril-fatface'
  | 'fraunces'

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
  /**
   * Overrides the dominant text element's colour (Cover's title, Back
   * Cover's blurb) — a `#rrggbb` hex string. Absent (the default)
   * reproduces the pre-existing automatic behaviour exactly: white when a
   * background photo is set, the book's theme ink colour otherwise. See
   * `coverTypography.ts`'s `resolveCoverColor`. Phase 49.
   */
  color?: string
  /**
   * Same as `color`, but for every secondary text element (Cover's
   * subtitle/author, Back Cover's author bio) — deliberately one shared
   * override rather than three separate colour pickers, matching this
   * app's existing ink/mutedInk two-tier colour model. Absent reproduces
   * each field's own pre-existing automatic shade. Phase 49.
   */
  secondaryColor?: string
}

/**
 * A Cover's individually-hideable text fields — lets a user who just wants
 * a full-bleed photo hide the title/subtitle/author without deleting the
 * text underneath (switching back on restores it exactly). Phase 49.
 */
export type CoverTextFieldId = 'title' | 'subtitle' | 'author'

/** Same idea as `CoverTextFieldId`, for the Back Cover's two text
 * elements. Phase 49. */
export type BackCoverTextFieldId = 'blurb' | 'authorBio'

/**
 * A free-form drag-and-drop element on a Cover/Back Cover, layered above the
 * background image/overlay and below the title/subtitle/author text block
 * (matching the DOM order `cover.tsx`/`backCover.tsx` already render in).
 * Purely additive alongside every other `CoverPage`/`BackCoverPage` field —
 * see `docs/COVER_CANVAS_PLAN.md` for the full design and why there's no
 * `rotation` field yet (Milestone 1 ships no rotate handle, and a field only
 * some renderers honoured would be exactly the WYSIWYG-drift risk
 * `structuralPages/registry.ts`'s `StructuralPageTypeDefinition` doc comment
 * warns about).
 */
export type CoverElementKind = 'rect' | 'ellipse' | 'line' | 'text' | 'icon' | 'badge' | 'image'

/**
 * Shared fields, deliberately WITHOUT `kind` — the discriminant is declared
 * independently on each leaf type below instead, exactly matching how
 * `StructuralPage`'s own `type` discriminant is only ever declared on each
 * leaf interface (`CoverPage`, `TitlePage`, ...), never on
 * `BaseStructuralPage`. Declaring a discriminant in a shared base and
 * re-narrowing it in each `extends`-ing subtype is a known TypeScript
 * control-flow-narrowing pitfall — `if (el.kind === 'rect') ... else if
 * (el.kind === 'ellipse') ... else if (el.kind === 'line') ... else { ... }`
 * silently fails to narrow the final `else` to `CoverTextElement` when
 * `kind` is declared (then overridden) in a common base, even though the
 * exact same check narrows correctly when each leaf declares `kind`
 * independently, as it does here.
 */
interface BaseCoverElement {
  id: string
  /** Normalised 0..1 fractions of the TRIM box (not the bleed box) — same
   * convention as `verticalNudge` below, so an element stays in the same
   * proportional place across trim-size changes and converts identically to
   * both the screen coordinate space and the PDF's point space. */
  x: number
  y: number
  width: number
  height: number
  /** Paint order among elements only. */
  zIndex: number
  /** `0..1`; absent means fully opaque. Declared once here (not per-kind)
   * so every element kind gets it uniformly — `rect`/`ellipse` already had
   * their own `fillOpacity` (which only affects the fill, leaving a stroke
   * fully opaque) before this was added; that stays as-is for backward
   * compatibility, this `opacity` is a whole-element multiplier on top,
   * primarily meant for the kinds that had no opacity control at all
   * (icon/badge/image). */
  opacity?: number
}

/** A rectangle, ellipse, or straight horizontal line. `cornerRadius` only
 * applies to `'rect'`; ignored for the other two kinds. */
export interface CoverShapeElement extends BaseCoverElement {
  kind: 'rect' | 'ellipse' | 'line'
  fill?: string
  /** `0..1`; absent means fully opaque. */
  fillOpacity?: number
  stroke?: string
  /** px — same physical convention as `theme.typography.bodySize`
   * (calibrated to real mm via `PX_PER_MM`, not an arbitrary CSS unit), so
   * it converts to PDF points via the same `PX_TO_PT` every other size in
   * this codebase already uses. */
  strokeWidth?: number
  cornerRadius?: number
}

/** A free, independently-positioned text box — distinct from Cover's own
 * title/subtitle/author fields, which stay exactly as they are. */
export interface CoverTextElement extends BaseCoverElement {
  kind: 'text'
  text: string
  color?: string
  fontChoice?: CoverFontChoice
  weight?: number
  italic?: boolean
  /** px, same convention as `CoverShapeElement.strokeWidth` — deliberately
   * an absolute size, not a scale multiplier like `CoverTypographyOverride
   * .sizeScale`, since a free text box has no existing fixed size to scale
   * from. */
  fontSize?: number
  align?: 'left' | 'center' | 'right'
}

/** A curated set of decorative line-icons for cover badges/seals/feature
 * strips (Milestone 2 of the free-form element canvas — see
 * `docs/COVER_CANVAS_PLAN.md`). Deliberately a small hand-picked list, not
 * "any lucide icon" — every id here has matching geometry hand-transcribed
 * into `structuralPages/coverIcons.ts`'s PDF registry from the exact
 * installed `lucide-react` version, so screen and print render identically.
 * Adding an id to this union without also adding it to that registry is a
 * type error at the PDF draw call site, not a silent blank icon. */
export type CoverIconId =
  | 'star'
  | 'award'
  | 'crown'
  | 'leaf'
  | 'feather'
  | 'book-open'
  | 'shield'
  | 'sparkles'
  | 'quote'
  | 'heart'
  | 'medal'
  | 'trophy'
  | 'badge-check'
  | 'gem'

/** A single decorative icon (see `CoverIconId`) — e.g. an award seal or a
 * leaf mark for a nature-themed cover's feature strip. */
export interface CoverIconElement extends BaseCoverElement {
  kind: 'icon'
  iconId: CoverIconId
  color?: string
  /** px, in the icon's native 24×24 viewBox — same physical convention as
   * `CoverShapeElement.strokeWidth`, scaled proportionally with the icon's
   * own rendered size rather than treated as a fixed line weight. */
  strokeWidth?: number
}

/** A circular seal or rectangular ribbon with centred text — "Bestseller",
 * "2nd Edition", "Award Winner" and similar cover call-outs. A specialised
 * combination of a filled shape + text rather than composing a shape element
 * and a text element separately, since the two always move/resize together
 * and a real badge's text needs to stay centred as the shape resizes. */
export interface CoverBadgeElement extends BaseCoverElement {
  kind: 'badge'
  shape: 'circle' | 'rect'
  text: string
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderWidth?: number
  /** px, same convention as `CoverTextElement.fontSize`. */
  fontSize?: number
  fontChoice?: CoverFontChoice
}

/** A secondary image — author photo, publisher/series logo, or any other
 * additional picture beyond the one main full-bleed background image
 * (`CoverPage.content.imageAssetId`). Reuses the main image's own
 * `CoverImageFocalPoint` + zoom shape directly (`coverImageFit.ts`'s
 * placement math is already generic over any box, not just the full page —
 * confirmed before adding this), rather than duplicating the concept. */
export interface CoverImageElement extends BaseCoverElement {
  kind: 'image'
  imageAssetId?: string
  imageFocalPoint?: CoverImageFocalPoint
  imageZoom?: number
}

export type CoverElement = CoverShapeElement | CoverTextElement | CoverIconElement | CoverBadgeElement | CoverImageElement

/** Independent free-position override for one of Cover's title/subtitle/
 * author fields — normalised 0..1 fraction of the trim box, anchored at the
 * field's own centre (matching how `CoverElement`'s text/badge kinds anchor
 * their text). Absent means the field stays in the shared flex layout
 * (`layout` + `verticalNudge`/`horizontalNudge`), the pre-existing
 * behaviour — set the first time the user drags that field directly instead
 * of the whole-block `CoverNudgeHandle`, and cleared again by a reset
 * action to rejoin the shared layout. See `structuralPages/shared.tsx`'s
 * `DraggableCoverField`. */
export interface CoverFieldPosition {
  x: number
  y: number
}

export interface CoverPage extends BaseStructuralPage {
  type: 'cover'
  content: {
    title?: string
    subtitle?: string
    author?: string
    /** Independent position for `title`, overriding the shared flex layout
     * below once set — see `CoverFieldPosition`. */
    titlePosition?: CoverFieldPosition
    subtitlePosition?: CoverFieldPosition
    authorPosition?: CoverFieldPosition
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
    /** Same convention as `verticalNudge`, along the horizontal axis —
     * `-1`..`1`, `0`/absent meaning no offset (the title/subtitle/author
     * block stays exactly centred, the pre-existing behaviour). Front Cover
     * only: Back Cover's blurb is a full-width flowing text block with no
     * equivalent "centred column" to offset, so `BackCoverPage.content` has
     * no matching field. See `coverLayout.ts`'s `computeCoverLayoutScreenStyle`
     * and `CoverNudgeHandle`'s optional `horizontal` prop. */
    horizontalNudge?: number
    imageFocalPoint?: CoverImageFocalPoint
    /** `>= 1`; `1` or absent is the pre-existing plain cover-fit crop. */
    imageZoom?: number
    overlayStyle?: CoverOverlayStyle
    /** `0..1`; absent means the pre-existing fixed `0.35`. */
    overlayOpacity?: number
    typography?: CoverTypographyOverride
    /** Text fields hidden for a photo-only cover — see `CoverTextFieldId`.
     * Absent/empty means everything shows, the pre-existing behaviour.
     * Phase 49. */
    hiddenFields?: CoverTextFieldId[]
    /** Free-form drag-and-drop shapes/text — see `CoverElement` above and
     * `docs/COVER_CANVAS_PLAN.md`. Absent/empty renders identically to
     * every project created before this milestone. */
    elements?: CoverElement[]
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
    /** See `CoverPage.content.hiddenFields` — same idea, the Back Cover's
     * own two text elements. Phase 49. */
    hiddenFields?: BackCoverTextFieldId[]
    /** See `CoverPage.content.elements`. */
    elements?: CoverElement[]
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
