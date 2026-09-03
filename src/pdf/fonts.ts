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
  // Investigated real subsetting here (Phase 109, 2026-08-02) — see
  // docs/STATUS.md's Phase 109 entry for the full story. Short version:
  // pdf-lib DOES support real subsetting via the `@pdf-lib/fontkit` this
  // app already registers (the earlier ROADMAP note claiming "no subsetting
  // API at all" was a misdiagnosis — nothing needed installing), but
  // `@pdf-lib/fontkit`'s subsetting encoder has a real, long-standing,
  // documented reliability bug (multiple open GitHub issues — unsorted
  // `loca` table offsets, content-dependent crashes) that reproduced here
  // as a non-deterministic "Index out of range" crash AND a hang on the
  // exact same input across repeated runs. A PDF export that randomly
  // fails or freezes is a far worse regression than a somewhat larger font
  // file, so `subset: true` is deliberately NOT enabled — do not flip this
  // on without a fixed fontkit release or a different subsetting approach.
  return doc.embedFont(bytes)
}

/**
 * Embeds a font, falling back to a standard PDF face if that font cannot be
 * embedded at all.
 *
 * Every cover font in `loadThemeFonts` is embedded on every export, whether
 * the book uses it or not, so without this a single unembeddable file takes
 * down PDF export for every user and every book — which is exactly what
 * happened: `@pdf-lib/fontkit` throws `RangeError: Trying to access beyond
 * buffer length` while writing Bebas Neue's glyph data, and since that
 * rejection propagated out of `loadThemeFonts`, `exportBookToPdf` threw
 * before producing a single page. The font file itself is structurally
 * sound (its `loca` table matches `head.indexToLocFormat` and `maxp
 * .numGlyphs`, and no glyph offset runs past `glyf`), so this is a fontkit
 * defect on this particular font rather than a corrupt download.
 *
 * Failing soft is the right trade here: a cover set in a fallback face is a
 * visible, fixable cosmetic problem, while a hard failure loses the whole
 * export. The failure is logged rather than swallowed silently.
 */
async function embedOrFallback(doc: PDFDocument, url: string, fallback: 'sans' | 'serif'): Promise<PDFFont> {
  try {
    return await embed(doc, url)
  } catch (error) {
    console.error(`Font failed to embed, falling back to a standard face: ${url}`, error)
    return doc.embedFont(fallback === 'serif' ? StandardFonts.TimesRoman : StandardFonts.Helvetica)
  }
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
  const regular = await embedOrFallback(doc, files.regular, italicFallback)
  const medium = files.medium ? await embedOrFallback(doc, files.medium, italicFallback) : regular
  const semiBold = files.semiBold ? await embedOrFallback(doc, files.semiBold, italicFallback) : medium
  const bold = files.bold ? await embedOrFallback(doc, files.bold, italicFallback) : semiBold
  const italic = files.italic
    ? await embedOrFallback(doc, files.italic, italicFallback)
    : await doc.embedFont(italicFallback === 'serif' ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique)
  const boldItalic = files.boldItalic
    ? await embedOrFallback(doc, files.boldItalic, italicFallback)
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
  const [inter, serif, anton, oswald, playfairDisplay, dmSerifDisplay, abrilFatface, fraunces] = await Promise.all([
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
      /**
       * Bebas Neue is deliberately NOT embedded, and resolves to Anton — the
       * closest working condensed display sans.
       *
       * `@pdf-lib/fontkit` throws `RangeError: Trying to access beyond buffer
       * length` from `TTFGlyph._getCBox` while serialising this typeface's
       * glyph metrics. The failure surfaces at `doc.save()`, not at
       * `embedFont`, so it cannot be caught per-font at load time — and
       * because every cover font here is embedded on every export whether the
       * book uses it or not, that one font took down PDF export for every
       * user and every book (caught by `scripts/smoke-test.ts`'s export
       * integration test).
       *
       * Not a corrupt download: the file's `loca` table matches
       * `head.indexToLocFormat` and `maxp.numGlyphs`, no glyph offset runs
       * past `glyf`, and a freshly-downloaded copy from Google Fonts crashes
       * identically. It is a fontkit defect on this face, so re-downloading
       * the file will not fix it — do not "restore" this font without first
       * confirming a fixed fontkit release against a real exported PDF.
       *
       * The id is kept in `CustomCoverFontId` rather than removed: a project
       * saved with this choice still loads and simply renders in Anton, which
       * is this codebase's standing "default in code, never migrate persisted
       * data" convention.
       */
      'bebas-neue': anton,
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
