import { rgb, type PDFPage } from 'pdf-lib'

import type { CoverOverlayStyle } from '@/types/structuralPage'

/**
 * Overlay drawn on a Cover/Back Cover's background image so text stays
 * readable — see `types/structuralPage.ts`'s `CoverOverlayStyle` doc
 * comment for the four options. Shared by the on-screen renderer and the
 * PDF exporter, same DRY principle as `coverLayout.ts`/`coverImageFit.ts`.
 * See `docs/STATUS.md` Phase 46.
 */

/** Cover's pre-existing fixed overlay opacity. Back Cover's pre-existing
 * constant was `0.4`, not this — callers pass their own page-specific
 * default explicitly rather than this function silently picking one. */
export const DEFAULT_OVERLAY_OPACITY = 0.35

/** How far down (as a fraction of the page height) a gradient overlay
 * fades to fully transparent — matched between the screen CSS and the PDF
 * banding approximation below so the two look the same. */
const GRADIENT_FADE_FRACTION = 0.65

export interface CoverOverlayScreenStyle {
  background: string
}

/** Screen-side overlay CSS: a flat `rgba()` tint (the pre-existing
 * behaviour) or a `linear-gradient` that only darkens the end of the image
 * nearest the text, keeping far more of a photo's detail visible than a
 * flat tint across the whole frame. Returns `null` for `'none'` — the
 * caller skips rendering an overlay `<div>` at all. */
export function computeCoverOverlayScreenStyle(
  style: CoverOverlayStyle | undefined,
  opacity: number,
): CoverOverlayScreenStyle | null {
  const resolvedStyle = style ?? 'flat'
  if (resolvedStyle === 'none') return null
  if (resolvedStyle === 'flat') return { background: `rgba(0,0,0,${opacity})` }
  // 'to bottom' starts its 0% stop at the top of the box, so 'gradient-top'
  // (dark end at the top) needs 'to bottom'; 'gradient-bottom' needs the
  // opposite. Mirrored exactly by `drawCoverOverlayPdf`'s banding order.
  const fadeDirection = resolvedStyle === 'gradient-top' ? 'to bottom' : 'to top'
  return { background: `linear-gradient(${fadeDirection}, rgba(0,0,0,${opacity}) 0%, rgba(0,0,0,0) ${GRADIENT_FADE_FRACTION * 100}%)` }
}

/**
 * PDF-side overlay. `'flat'` is one rectangle at a fixed opacity — exactly
 * the pre-existing behaviour, reproduced bit for bit. The two gradient
 * styles approximate a fade using many thin, increasingly-transparent
 * horizontal bands: pdf-lib's high-level API has no native gradient-fill
 * primitive (that would need hand-writing a raw PDF shading dictionary
 * into the content stream, far riskier than this standard, honest
 * workaround), and at `BAND_COUNT` this many strips the eye reads it as a
 * smooth fade rather than visible banding.
 */
export function drawCoverOverlayPdf(
  page: PDFPage,
  style: CoverOverlayStyle | undefined,
  opacity: number,
  mediaWidthPt: number,
  mediaHeightPt: number,
): void {
  const resolvedStyle = style ?? 'flat'
  if (resolvedStyle === 'none') return
  if (resolvedStyle === 'flat') {
    page.drawRectangle({ x: 0, y: 0, width: mediaWidthPt, height: mediaHeightPt, color: rgb(0, 0, 0), opacity })
    return
  }
  const BAND_COUNT = 40
  const fadeHeightPt = mediaHeightPt * GRADIENT_FADE_FRACTION
  const bandHeight = fadeHeightPt / BAND_COUNT
  for (let i = 0; i < BAND_COUNT; i++) {
    const fraction = i / (BAND_COUNT - 1) // 0 at the dark edge, 1 at the fade's transparent end
    const bandOpacity = Math.max(0, opacity * (1 - fraction))
    const y = resolvedStyle === 'gradient-bottom' ? i * bandHeight : mediaHeightPt - (i + 1) * bandHeight
    // +0.5pt height overlap avoids visible hairline gaps between bands
    // from floating-point rounding.
    page.drawRectangle({ x: 0, y, width: mediaWidthPt, height: bandHeight + 0.5, color: rgb(0, 0, 0), opacity: bandOpacity })
  }
}
