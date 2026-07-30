import type { PDFDocument, PDFFont } from 'pdf-lib'

export interface ThemeFontSet {
  interRegular: PDFFont
  interMedium: PDFFont
  interSemiBold: PDFFont
  interBold: PDFFont
  serifRegular: PDFFont
  serifMedium: PDFFont
  serifSemiBold: PDFFont
}

async function embed(doc: PDFDocument, url: string): Promise<PDFFont> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer())
  return doc.embedFont(bytes)
}

/** Loads and embeds the self-hosted Inter / Source Serif 4 weights
 * (public/fonts) into a PDF document — see docs/STATUS.md for why these
 * two families cover every theme. */
export async function loadThemeFonts(doc: PDFDocument): Promise<ThemeFontSet> {
  const [interRegular, interMedium, interSemiBold, interBold, serifRegular, serifMedium, serifSemiBold] = await Promise.all([
    embed(doc, '/fonts/inter-400.woff2'),
    embed(doc, '/fonts/inter-500.woff2'),
    embed(doc, '/fonts/inter-600.woff2'),
    embed(doc, '/fonts/inter-700.woff2'),
    embed(doc, '/fonts/source-serif-4-400.woff2'),
    embed(doc, '/fonts/source-serif-4-500.woff2'),
    embed(doc, '/fonts/source-serif-4-600.woff2'),
  ])
  return { interRegular, interMedium, interSemiBold, interBold, serifRegular, serifMedium, serifSemiBold }
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
