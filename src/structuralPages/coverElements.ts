import { rgb } from 'pdf-lib'

import type { DrawCtx } from '@/pdf/exportPdf'
import type { CoverElement, CoverElementKind, CoverShapeElement, CoverTextElement } from '@/types/structuralPage'
import { generateId } from '@/utils/id'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { pickFont, pickItalicFont } from '@/pdf/fonts'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'

/**
 * Pure data helpers for `CoverElement` arrays (see `docs/COVER_CANVAS_PLAN.md`)
 * plus the PDF-side drawing function. No React here — `coverElementLayer.tsx`
 * is the interactive on-screen counterpart; both are used identically by
 * `cover.tsx` and `backCover.tsx`. Every mutation here returns a brand-new
 * array rather than mutating in place, so a caller can hand the result
 * straight to `onCommit({ elements })` → `updatePageContentWithHistory`,
 * which already snapshots/restores whole `content` objects generically —
 * no new history-store wiring needed for any of this.
 */

/** Default size/position for a freshly-added element, as a fraction of the
 * trim box — roughly a quarter of the cover, nudged a little further down
 * and right each time (`existingCount`) so adding several in a row doesn't
 * stack them exactly on top of each other. */
export function createCoverElement(kind: CoverElementKind, existingCount: number, zIndex: number): CoverElement {
  const offset = Math.min(existingCount, 6) * 0.03
  const base = {
    id: generateId('cover-el'),
    x: 0.3 + offset,
    y: 0.3 + offset,
    zIndex,
  }

  if (kind === 'text') {
    const el: CoverTextElement = {
      ...base,
      kind: 'text',
      width: 0.4,
      height: 0.08,
      text: 'Text',
      fontSize: 24,
      align: 'center',
    }
    return el
  }

  if (kind === 'line') {
    const el: CoverShapeElement = {
      ...base,
      kind: 'line',
      width: 0.4,
      height: 0.02,
      stroke: '#ffffff',
      strokeWidth: 2,
    }
    return el
  }

  const el: CoverShapeElement = {
    ...base,
    kind,
    width: 0.35,
    height: kind === 'ellipse' ? 0.2 : 0.15,
    fill: '#ffffff',
    fillOpacity: 0.85,
    cornerRadius: kind === 'rect' ? 8 : undefined,
  }
  return el
}

export function nextZIndex(elements: CoverElement[] | undefined): number {
  if (!elements || elements.length === 0) return 1
  return Math.max(...elements.map((e) => e.zIndex)) + 1
}

export function addElement(elements: CoverElement[] | undefined, element: CoverElement): CoverElement[] {
  return [...(elements ?? []), element]
}

export function updateElement(elements: CoverElement[] | undefined, id: string, patch: Partial<CoverElement>): CoverElement[] {
  return (elements ?? []).map((e) => (e.id === id ? ({ ...e, ...patch } as CoverElement) : e))
}

export function removeElement(elements: CoverElement[] | undefined, id: string): CoverElement[] {
  return (elements ?? []).filter((e) => e.id !== id)
}

export function bringToFront(elements: CoverElement[] | undefined, id: string): CoverElement[] {
  const z = nextZIndex(elements)
  return updateElement(elements, id, { zIndex: z })
}

export function sendToBack(elements: CoverElement[] | undefined, id: string): CoverElement[] {
  const list = elements ?? []
  const minZ = list.length === 0 ? 0 : Math.min(...list.map((e) => e.zIndex))
  return updateElement(elements, id, { zIndex: minZ - 1 })
}

/**
 * Draws every element in a Cover/Back Cover's `elements` array into the PDF,
 * in `zIndex` order. `bleedPt`/`trimWidthPt`/`trimHeightPt` mirror exactly
 * what `drawCoverPdf`/`drawBackCoverPdf` already compute for the background
 * image — normalised `x`/`y`/`width`/`height` convert to PDF points the same
 * way every other cover measurement does (`PX_TO_PT`, offset by `bleedPt`
 * since the media box extends past the trim edge on every side). PDF's
 * origin is bottom-left and `y` grows upward, while `CoverElement.y` is a
 * top-down fraction (matching CSS) — flipped once here, at the boundary,
 * exactly like `drawCoverOverlayPdf` already does for the overlay gradient.
 */
export function drawCoverElementsPdf(
  ctx: DrawCtx,
  elements: CoverElement[] | undefined,
  bleedPt: number,
  trimWidthPt: number,
  trimHeightPt: number,
) {
  if (!elements || elements.length === 0) return
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    const xPt = bleedPt + el.x * trimWidthPt
    const wPt = el.width * trimWidthPt
    const hPt = el.height * trimHeightPt
    const yPt = bleedPt + trimHeightPt - el.y * trimHeightPt - hPt

    if (el.kind === 'rect') {
      ctx.page.drawRectangle({
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        color: el.fill ? hexToPdfColor(el.fill) : undefined,
        opacity: el.fill ? (el.fillOpacity ?? 1) : undefined,
        borderColor: el.stroke ? hexToPdfColor(el.stroke) : undefined,
        borderWidth: el.stroke ? (el.strokeWidth ?? 1) * PX_TO_PT : undefined,
        // pdf-lib has no native rounded-rectangle primitive; a plain
        // rectangle is an honest approximation until a future milestone
        // switches this to `drawSvgPath` for a real rounded corner. Not
        // worse than what's on screen going unrepresented — see
        // docs/COVER_CANVAS_PLAN.md's rotation note for the same
        // "don't half-implement a visible property" reasoning; corner
        // radius is a minor enough visual miss to accept for Milestone 1.
      })
    } else if (el.kind === 'ellipse') {
      ctx.page.drawEllipse({
        x: xPt + wPt / 2,
        y: yPt + hPt / 2,
        xScale: wPt / 2,
        yScale: hPt / 2,
        color: el.fill ? hexToPdfColor(el.fill) : undefined,
        opacity: el.fill ? (el.fillOpacity ?? 1) : undefined,
        borderColor: el.stroke ? hexToPdfColor(el.stroke) : undefined,
        borderWidth: el.stroke ? (el.strokeWidth ?? 1) * PX_TO_PT : undefined,
      })
    } else if (el.kind === 'line') {
      const midYPt = yPt + hPt / 2
      ctx.page.drawLine({
        start: { x: xPt, y: midYPt },
        end: { x: xPt + wPt, y: midYPt },
        thickness: (el.strokeWidth ?? 1) * PX_TO_PT,
        color: el.stroke ? hexToPdfColor(el.stroke) : rgb(0, 0, 0),
      })
    } else if (el.kind === 'text') {
      // An explicit check here (not a bare `else`) is deliberate, not
      // redundant — this TypeScript version doesn't reliably narrow a
      // union member whose discriminant is itself a multi-value literal
      // type (`CoverShapeElement.kind: 'rect' | 'ellipse' | 'line'`) purely
      // by exclusion into a trailing `else`; every branch needs its own
      // positive `===` check to narrow correctly. Confirmed with a minimal
      // repro against this exact `tsc` before landing this fix.
      const fontFamily = resolveCoverFontFamily({ fontChoice: el.fontChoice }, ctx.theme.fonts.body)
      const weight = el.weight ?? 400
      const font = el.italic ? pickItalicFont(ctx.fonts, fontFamily, weight) : pickFont(ctx.fonts, fontFamily, weight)
      const size = (el.fontSize ?? 24) * PX_TO_PT
      const textWidth = font.widthOfTextAtSize(el.text, size)
      const align = el.align ?? 'center'
      const textX = align === 'left' ? xPt : align === 'right' ? xPt + wPt - textWidth : xPt + (wPt - textWidth) / 2
      // Vertically centred within the box, matching the on-screen layer's
      // flex `items-center` treatment.
      const textY = yPt + hPt / 2 - size * 0.35
      ctx.page.drawText(el.text, {
        x: textX,
        y: textY,
        size,
        font,
        color: el.color ? hexToPdfColor(el.color) : rgb(1, 1, 1),
      })
    }
  }
}
