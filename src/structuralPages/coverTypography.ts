import type { CoverFontChoice, CoverTypographyOverride } from '@/types/structuralPage'

/**
 * Resolves a Cover/Back Cover's actual font family, honouring an optional
 * `typography` override that's deliberately independent of the book's
 * interior theme — see `types/structuralPage.ts`'s `CoverFontChoice` doc
 * comment. Shared by the on-screen renderer and the PDF exporter so the
 * two can never disagree, same DRY principle as `coverLayout.ts`.
 */

const SERIF_FAMILY = '"Source Serif 4", serif'
const SANS_FAMILY = '"Inter", sans-serif'

/**
 * The seven cover-only display/serif families wired up in Phase 50 — CSS
 * strings matching the `@font-face` declarations in `src/index.css`, with
 * a plain generic fallback for the split second before the real face
 * loads (or if a user opens an export in something that can't render the
 * embedded font at all). Deliberately not offered anywhere in the book's
 * interior theme system — see `CoverFontChoice`'s doc comment.
 */
const CUSTOM_FAMILY_CSS: Record<Exclude<CoverFontChoice, 'theme' | 'serif' | 'sans'>, string> = {
  anton: '"Anton", sans-serif',
  /** Deliberately resolves to Anton, not Bebas Neue. Bebas Neue cannot be
   * embedded in an exported PDF (see `pdf/fonts.ts`'s `'bebas-neue'` entry
   * for the full diagnosis), so rendering it on screen would show the author
   * one typeface and print another — a WYSIWYG break, which this app treats
   * as non-negotiable. A project saved with this choice keeps working and
   * simply shows Anton in both places. */
  'bebas-neue': '"Anton", sans-serif',
  oswald: '"Oswald", sans-serif',
  'playfair-display': '"Playfair Display", serif',
  'dm-serif-display': '"DM Serif Display", serif',
  'abril-fatface': '"Abril Fatface", serif',
  fraunces: '"Fraunces", serif',
}

export function resolveCoverFontFamily(typography: CoverTypographyOverride | undefined, themeFamily: string): string {
  const choice = typography?.fontChoice
  if (choice === 'serif') return SERIF_FAMILY
  if (choice === 'sans') return SANS_FAMILY
  if (choice && choice !== 'theme') return CUSTOM_FAMILY_CSS[choice]
  return themeFamily
}

/** `1` (or absent) reproduces the pre-existing fixed size exactly. */
export function resolveCoverSizeScale(typography: CoverTypographyOverride | undefined): number {
  return typography?.sizeScale ?? 1
}

export function resolveCoverWeight(typography: CoverTypographyOverride | undefined, defaultWeight: number): number {
  return typography?.weight ?? defaultWeight
}

/**
 * Resolves the dominant text element's colour (Cover's title, Back
 * Cover's blurb), honouring an optional override — same "absent means
 * today's exact automatic behaviour" rule as the rest of this file.
 * `fallback` is whatever the caller's own automatic rule already computed
 * (white on a photo, theme ink otherwise) so this function stays a pure
 * override resolver, not a second copy of that rule. Phase 49.
 */
export function resolveCoverColor(typography: CoverTypographyOverride | undefined, fallback: string): string {
  return typography?.color ?? fallback
}

/** Same as `resolveCoverColor`, for every secondary text element (Cover's
 * subtitle/author, Back Cover's author bio) — one shared override, see
 * `CoverTypographyOverride.secondaryColor`'s doc comment for why. Phase 49. */
export function resolveCoverSecondaryColor(typography: CoverTypographyOverride | undefined, fallback: string): string {
  return typography?.secondaryColor ?? fallback
}
