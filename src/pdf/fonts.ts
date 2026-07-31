import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib'

export interface ThemeFontSet {
  interRegular: PDFFont
  interMedium: PDFFont
  interSemiBold: PDFFont
  interBold: PDFFont
  serifRegular: PDFFont
  serifMedium: PDFFont
  serifSemiBold: PDFFont
  /**
   * Italic fallbacks — see `pickItalicFont` below for why these are the
   * built-in PDF standard-14 fonts (Helvetica Oblique / Times Italic)
   * rather than a true italic cut of Inter/Source Serif 4: no italic
   * `.woff2` exists in `public/fonts` today, and embedding one would need
   * network access this environment doesn't have. Standard fonts need no
   * embedding at all (`doc.embedFont(StandardFonts.X)` resolves with no
   * fetch), so this is a real, working italic — just a different typeface
   * for italic runs specifically, honestly documented rather than silently
   * skipped. See docs/STATUS.md Phase 39.
   */
  interItalic: PDFFont
  interBoldItalic: PDFFont
  serifItalic: PDFFont
  serifBoldItalic: PDFFont
}

async function embed(doc: PDFDocument, url: string): Promise<PDFFont> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer())
  return doc.embedFont(bytes)
}

/** Loads and embeds the self-hosted Inter / Source Serif 4 weights
 * (public/fonts) into a PDF document — see docs/STATUS.md for why these
 * two families cover every theme. Also embeds four standard-14 italic
 * fonts (no network fetch — see `ThemeFontSet`'s own doc comment). */
export async function loadThemeFonts(doc: PDFDocument): Promise<ThemeFontSet> {
  const [
    interRegular,
    interMedium,
    interSemiBold,
    interBold,
    serifRegular,
    serifMedium,
    serifSemiBold,
    interItalic,
    interBoldItalic,
    serifItalic,
    serifBoldItalic,
  ] = await Promise.all([
    embed(doc, '/fonts/inter-400.woff2'),
    embed(doc, '/fonts/inter-500.woff2'),
    embed(doc, '/fonts/inter-600.woff2'),
    embed(doc, '/fonts/inter-700.woff2'),
    embed(doc, '/fonts/source-serif-4-400.woff2'),
    embed(doc, '/fonts/source-serif-4-500.woff2'),
    embed(doc, '/fonts/source-serif-4-600.woff2'),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.HelveticaBoldOblique),
    doc.embedFont(StandardFonts.TimesRomanItalic),
    doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  ])
  return {
    interRegular,
    interMedium,
    interSemiBold,
    interBold,
    serifRegular,
    serifMedium,
    serifSemiBold,
    interItalic,
    interBoldItalic,
    serifItalic,
    serifBoldItalic,
  }
}

function isSerif(cssFontFamily: string): boolean {
  return /source serif/i.test(cssFontFamily)
}

/** Resolves a theme's CSS font-family string + a target weight to the
 * closest embedded PDFFont (Source Serif 4 only ships 400/500/600, so a
 * request for 700 falls back to 600). */
export function pickFont(fonts: ThemeFontSet, cssFontFamily: string, weight: number): PDFFont {
  if (isSerif(cssFontFamily)) {
    if (weight >= 600) return fonts.serifSemiBold
    if (weight >= 500) return fonts.serifMedium
    return fonts.serifRegular
  }
  if (weight >= 700) return fonts.interBold
  if (weight >= 600) return fonts.interSemiBold
  if (weight >= 500) return fonts.interMedium
  return fonts.interRegular
}

/** Same resolution as `pickFont`, but for italic runs — only two weight
 * buckets exist (regular-italic vs. bold-italic) since that's all the
 * standard-14 fonts offer. `weight >= 600` maps to bold-italic, matching
 * `pickFont`'s own semibold-and-up-is-visually-bold-enough threshold. */
export function pickItalicFont(fonts: ThemeFontSet, cssFontFamily: string, weight: number): PDFFont {
  if (isSerif(cssFontFamily)) {
    return weight >= 600 ? fonts.serifBoldItalic : fonts.serifItalic
  }
  return weight >= 600 ? fonts.interBoldItalic : fonts.interItalic
}
