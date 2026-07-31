import type { CoverTypographyOverride } from '@/types/structuralPage'

/**
 * Resolves a Cover/Back Cover's actual font family, honouring an optional
 * `typography` override that's deliberately independent of the book's
 * interior theme — see `types/structuralPage.ts`'s `CoverFontChoice` doc
 * comment. Shared by the on-screen renderer and the PDF exporter so the
 * two can never disagree, same DRY principle as `coverLayout.ts`.
 */

const SERIF_FAMILY = '"Source Serif 4", serif'
const SANS_FAMILY = '"Inter", sans-serif'

export function resolveCoverFontFamily(typography: CoverTypographyOverride | undefined, themeFamily: string): string {
  if (typography?.fontChoice === 'serif') return SERIF_FAMILY
  if (typography?.fontChoice === 'sans') return SANS_FAMILY
  return themeFamily
}

/** `1` (or absent) reproduces the pre-existing fixed size exactly. */
export function resolveCoverSizeScale(typography: CoverTypographyOverride | undefined): number {
  return typography?.sizeScale ?? 1
}

export function resolveCoverWeight(typography: CoverTypographyOverride | undefined, defaultWeight: number): number {
  return typography?.weight ?? defaultWeight
}
