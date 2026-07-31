import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib'

/** One family's embedded weight/style variants — reused for Inter, Source
 * Serif 4, and each of the seven Phase 50 cover-only families below, so
 * `pickFont`/`pickItalicFont` can treat every family identically regardless
 * of how many real weight files it actually ships. Families that only ship
 * one real weight (e.g. Anton, Abril Fatface) simply reuse that same
 * `PDFFont` for every field — see `loadThemeFonts`'s per-family embed
 * calls below for exactly which file backs which field. */
interface FontWeightSet {
  regular: PDFFont
  medium: PDFFont
  semiBold: PDFFont
  bold: PDFFont
  italic: PDFFont
  boldItalic: PDFFont
}

/** The seven cover-only display/serif families dropped into
 * `public/fonts/custom/` and wired up in Phase 50 — keyed to match
 * `CoverFontChoice`'s own ids (minus `'theme'`/`'serif'`/`'sans'`, which
 * route to `inter`/`serif` below instead). */
export type CustomCoverFontId =
  | 'anton'
  | 'bebas-neue'
  | 'oswald'
  | 'playfair-display'
  | 'dm-serif-display'
  | 'abril-fatface'
  | 'fraunces'

export interface ThemeFontSet {
  inter: FontWeightSet
  /** Source Serif 4 — the book's other interior family. */
  serif: FontWeightSet
  custom: Record<CustomCoverFontId, FontWeightSet>
}

async function embed(doc: PDFDocument, url: string): Promise<PDFFont> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer())
  return doc.embedFont(bytes)
}

/**
 * Builds a `FontWeightSet` from whichever real files a family actually
 * ships. Each weight cascades to the next-lightest real file rather than
 * jumping straight to `regular` — `bold` falls back to `semiBold`, which
 * falls back to `medium`, which falls back to `regular` — so e.g. Source
 * Serif 4 (which only ships 400/500/600) resolves a 700 request to its
 * real 600 file, exactly like before Phase 50, instead of skipping past
 * it to plain 400. Every fallback reuses the already-embedded `PDFFont`
 * object rather than re-embedding the same file bytes a second time under
 * a different field, which would otherwise quietly bloat the exported
 * PDF with duplicate font resources.
 *
 * `italic`/`boldItalic` fall back to a standard-14 font (no real embed
 * needed) when a family ships no italic cut at all — same
 * honestly-documented fallback this file already used for Inter/Source
 * Serif 4 before Phase 50 (see the old `ThemeFontSet` doc comment this
 * replaces). `boldItalic` reuses the real `italic` file when a family has
 * one but no separate bold-italic cut (e.g. DM Serif Display).
 */
async function loadFamily(
  doc: PDFDocument,
  files: {
    regular: string
    medium?: string
    semiBold?: string
    bold?: string
    italic?: string
    boldItalic?: string
  },
  italicFallback: 'sans' | 'serif',
): Promise<FontWeightSet> {
  const regular = await embed(doc, files.regular)
  const medium = files.medium ? await embed(doc, files.medium) : regular
  const semiBold = files.semiBold ? await embed(doc, files.semiBold) : medium
  const bold = files.bold ? await embed(doc, files.bold) : semiBold
  const italic = files.italic
    ? await embed(doc, files.italic)
    : await doc.embedFont(italicFallback === 'serif' ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique)
  const boldItalic = files.boldItalic
    ? await embed(doc, files.boldItalic)
    : files.italic
      ? italic
      : await doc.embedFont(italicFallback === 'serif' ? StandardFonts.TimesRomanBoldItalic : StandardFonts.HelveticaBoldOblique)
  return { regular, medium, semiBold, bold, italic, boldItalic }
}

/** Loads and embeds every font this app can draw text with — the two
 * interior families (Inter, Source Serif 4) plus the seven Phase 50
 * cover-only families in `public/fonts/custom/`. All are self-hosted
 * static files, no network fetch. */
export async function loadThemeFonts(doc: PDFDocument): Promise<ThemeFontSet> {
  const [inter, serif, anton, bebasNeue, oswald, playfairDisplay, dmSerifDisplay, abrilFatface, fraunces] = await Promise.all([
    loadFamily(
      doc,
      {
        regular: '/fonts/inter-400.woff2',
        medium: '/fonts/inter-500.woff2',
        semiBold: '/fonts/inter-600.woff2',
        bold: '/fonts/inter-700.woff2',
      },
      'sans',
    ),
    loadFamily(
      doc,
      {
        regular: '/fonts/source-serif-4-400.woff2',
        medium: '/fonts/source-serif-4-500.woff2',
        semiBold: '/fonts/source-serif-4-600.woff2',
        // Source Serif 4 only ships 400/500/600 here — 700 requests fall
        // back to 600 via `semiBold`, same as before Phase 50.
        bold: '/fonts/source-serif-4-600.woff2',
      },
      'serif',
    ),
    loadFamily(doc, { regular: '/fonts/custom/Anton/Anton-Regular.ttf' }, 'sans'),
    loadFamily(doc, { regular: '/fonts/custom/Bebas_Neue/BebasNeue-Regular.ttf' }, 'sans'),
    loadFamily(
      doc,
      {
        regular: '/fonts/custom/Oswald/static/Oswald-Regular.ttf',
        medium: '/fonts/custom/Oswald/static/Oswald-Medium.ttf',
        semiBold: '/fonts/custom/Oswald/static/Oswald-SemiBold.ttf',
        bold: '/fonts/custom/Oswald/static/Oswald-Bold.ttf',
      },
      'sans',
    ),
    loadFamily(
      doc,
      {
        regular: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-Regular.ttf',
        medium: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-Medium.ttf',
        semiBold: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-SemiBold.ttf',
        bold: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-Bold.ttf',
        italic: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-Italic.ttf',
        boldItalic: '/fonts/custom/Playfair_Display/static/PlayfairDisplay-BoldItalic.ttf',
      },
      'serif',
    ),
    loadFamily(
      doc,
      {
        regular: '/fonts/custom/DM_Serif_Display/DMSerifDisplay-Regular.ttf',
        italic: '/fonts/custom/DM_Serif_Display/DMSerifDisplay-Italic.ttf',
      },
      'serif',
    ),
    loadFamily(doc, { regular: '/fonts/custom/Abril_Fatface/AbrilFatface-Regular.ttf' }, 'serif'),
    loadFamily(
      doc,
      {
        regular: '/fonts/custom/Fraunces/static/Fraunces_72pt-Regular.ttf',
        semiBold: '/fonts/custom/Fraunces/static/Fraunces_72pt-SemiBold.ttf',
        bold: '/fonts/custom/Fraunces/static/Fraunces_72pt-Bold.ttf',
        italic: '/fonts/custom/Fraunces/static/Fraunces_72pt-Italic.ttf',
        boldItalic: '/fonts/custom/Fraunces/static/Fraunces_72pt-BoldItalic.ttf',
      },
      'serif',
    ),
  ])

  return {
    inter,
    serif,
    custom: {
      anton,
      'bebas-neue': bebasNeue,
      oswald,
      'playfair-display': playfairDisplay,
      'dm-serif-display': dmSerifDisplay,
      'abril-fatface': abrilFatface,
      fraunces,
    },
  }
}

const CUSTOM_FAMILY_MATCHERS: [RegExp, CustomCoverFontId][] = [
  [/anton/i, 'anton'],
  [/bebas/i, 'bebas-neue'],
  [/oswald/i, 'oswald'],
  [/playfair/i, 'playfair-display'],
  [/dm serif/i, 'dm-serif-display'],
  [/abril/i, 'abril-fatface'],
  [/fraunces/i, 'fraunces'],
]

/** Resolves a CSS font-family string (either an interior theme's own
 * `theme.fonts.heading`/`.body`, or one of `coverTypography.ts`'s cover-
 * only family constants) to the matching `FontWeightSet` — every text
 * draw in the PDF exporter goes through this, interior or cover. */
function resolveFamily(fonts: ThemeFontSet, cssFontFamily: string): FontWeightSet {
  for (const [pattern, id] of CUSTOM_FAMILY_MATCHERS) {
    if (pattern.test(cssFontFamily)) return fonts.custom[id]
  }
  if (/source serif/i.test(cssFontFamily)) return fonts.serif
  return fonts.inter
}

/** Resolves a CSS font-family string + a target weight to the closest
 * embedded `PDFFont` for that family. */
export function pickFont(fonts: ThemeFontSet, cssFontFamily: string, weight: number): PDFFont {
  const family = resolveFamily(fonts, cssFontFamily)
  if (weight >= 700) return family.bold
  if (weight >= 600) return family.semiBold
  if (weight >= 500) return family.medium
  return family.regular
}

/** Same resolution as `pickFont`, but for italic runs. `weight >= 600` maps
 * to the family's bold-italic, matching `pickFont`'s own
 * semibold-and-up-is-visually-bold-enough threshold. */
export function pickItalicFont(fonts: ThemeFontSet, cssFontFamily: string, weight: number): PDFFont {
  const family = resolveFamily(fonts, cssFontFamily)
  return weight >= 600 ? family.boldItalic : family.italic
}
