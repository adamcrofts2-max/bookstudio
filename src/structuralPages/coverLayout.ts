import type { CoverTextLayout } from '@/types/structuralPage'
import type { PageBox } from '@/renderer/pageGeometry'

/**
 * Shared layout math for Cover/Back Cover's text block, used by both the
 * on-screen renderer (`cover.tsx`/`backCover.tsx`'s `*Render`) and the PDF
 * exporter (`drawCoverPdf`/`drawBackCoverPdf`) so the two never drift apart —
 * this app's true-WYSIWYG non-negotiable applies to layout presets exactly
 * as much as it does to fonts and colour. See `docs/STATUS.md` Phase 45.
 *
 * Deliberately a *coarse* preset system (three vertical anchors, a single
 * drag-adjustable nudge), not a full per-element x/y canvas — see that
 * phase entry for the reasoning.
 */

/** Fine-tune drag range, in on-screen CSS px, for `verticalNudge` (-1..1).
 * The PDF exporter multiplies this same constant by its own px→pt factor
 * rather than hand-picking a second constant, so a full drag from one end
 * to the other moves the text by the same physical distance on screen and
 * in the exported PDF. */
export const COVER_NUDGE_RANGE_PX = 90

/** Fraction of the page height used as top/bottom breathing room for the
 * 'top'/'bottom' layout presets. */
const ZONE_PADDING_FRACTION = 0.12

export interface CoverLayoutScreenStyle {
  justifyContent: 'flex-start' | 'center' | 'flex-end'
  paddingTop?: number
  paddingBottom?: number
  translateYPx: number
}

/** On-screen flex justification + zone padding (computed in px from the
 * real `pageBox`, never a CSS percentage — padding percentages resolve
 * against the containing block's *width*, not height, which would distort
 * a portrait page) + the drag handle's current offset. */
export function computeCoverLayoutScreenStyle(
  layout: CoverTextLayout | undefined,
  pageBox: PageBox,
  nudge: number | undefined,
): CoverLayoutScreenStyle {
  const zonePad = pageBox.heightPx * ZONE_PADDING_FRACTION
  const translateYPx = (nudge ?? 0) * COVER_NUDGE_RANGE_PX
  if (layout === 'top') return { justifyContent: 'flex-start', paddingTop: zonePad, translateYPx }
  if (layout === 'bottom') return { justifyContent: 'flex-end', paddingBottom: zonePad, translateYPx }
  return { justifyContent: 'center', translateYPx }
}

/**
 * PDF-side vertical cursor for the text block's topmost line, in PDF
 * points measured from the page's bottom edge (pdf-lib's y-up convention).
 *
 * `totalSpanPt` is the caller's own precomputed vertical distance from that
 * topmost line's cursor down to the last line's baseline (each caller
 * already knows its own line sizes/gaps — `drawCoverPdf` sums
 * title/subtitle/author gaps, `drawBackCoverPdf` passes `0` since its
 * blurb is drawn as a single flowing block whose start point this
 * function alone determines).
 */
export function computeCoverLayoutCursorY(params: {
  layout: CoverTextLayout | undefined
  mediaHeightPt: number
  topLineSizePt: number
  totalSpanPt: number
  nudge: number | undefined
  pxToPt: number
}): number {
  const { layout, mediaHeightPt, topLineSizePt, totalSpanPt, nudge, pxToPt } = params
  const zonePadPt = mediaHeightPt * ZONE_PADDING_FRACTION
  let cursorY: number
  if (layout === 'top') {
    cursorY = mediaHeightPt - zonePadPt - topLineSizePt
  } else if (layout === 'bottom') {
    cursorY = zonePadPt + totalSpanPt + topLineSizePt * 0.3
  } else {
    cursorY = mediaHeightPt / 2 + topLineSizePt * 0.6
  }
  return cursorY + (nudge ?? 0) * COVER_NUDGE_RANGE_PX * pxToPt
}

export const COVER_LAYOUT_OPTIONS: { id: CoverTextLayout; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'centered', label: 'Centered' },
  { id: 'bottom', label: 'Bottom' },
]
