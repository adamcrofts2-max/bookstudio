import { rgb, LineCapStyle, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from 'pdf-lib'

import type { DrawCtx } from '@/pdf/exportPdf'
import type { CoverElement, CoverElementKind, CoverShapeElement, CoverTextElement, CoverIconElement, CoverBadgeElement, CoverImageElement } from '@/types/structuralPage'
import { generateId } from '@/utils/id'
import { hexToPdfColor } from '@/pdf/color'
import { PX_TO_PT } from '@/pdf/drawBlockHelpers'
import { pickFont, pickItalicFont } from '@/pdf/fonts'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'
import { COVER_ICON_PDF_NODES } from '@/structuralPages/coverIcons'
import { computeCoverImagePdfPlacement } from '@/structuralPages/coverImageFit'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'

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

  if (kind === 'icon') {
    const el: CoverIconElement = {
      ...base,
      kind: 'icon',
      width: 0.12,
      height: 0.12,
      iconId: 'star',
      color: '#ffffff',
      strokeWidth: 2,
    }
    return el
  }

  if (kind === 'badge') {
    const el: CoverBadgeElement = {
      ...base,
      kind: 'badge',
      width: 0.2,
      height: 0.2,
      shape: 'circle',
      text: 'NEW',
      backgroundColor: '#dc2626',
      textColor: '#ffffff',
      fontSize: 15,
    }
    return el
  }

  if (kind === 'image') {
    const el: CoverImageElement = {
      ...base,
      kind: 'image',
      width: 0.25,
      height: 0.25,
      // `imageAssetId` starts unset — `ElementBody` renders an upload
      // placeholder until the user picks one, same "empty state prompts
      // for content" pattern as `StructuralImageDropZone`.
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

/** Moves an element exactly one step forward (toward the front) in paint
 * order — swaps `zIndex` with whichever element is immediately above it in
 * the current stack, rather than jumping straight to the front like
 * `bringToFront`. A plain `+1` to `zIndex` isn't safe here: `bringToFront`/
 * `sendToBack` deliberately leave gaps (`max + 1`, `min - 1`), so two
 * elements can be many zIndex units apart while still being adjacent in
 * paint order — swapping with the actual sorted neighbour is the only way
 * to guarantee moving exactly one step. No-op if already topmost. Part of
 * the Phase 59 brainstorm's layers-panel follow-up (`CoverLayersPanel`). */
export function bringForward(elements: CoverElement[] | undefined, id: string): CoverElement[] {
  const list = elements ?? []
  const sorted = [...list].sort((a, b) => a.zIndex - b.zIndex)
  const index = sorted.findIndex((e) => e.id === id)
  if (index === -1 || index === sorted.length - 1) return list
  const current = sorted[index]
  const next = sorted[index + 1]
  return list.map((e) => {
    if (e.id === current.id) return { ...e, zIndex: next.zIndex } as CoverElement
    if (e.id === next.id) return { ...e, zIndex: current.zIndex } as CoverElement
    return e
  })
}

/** Inverse of `bringForward` — swaps with the element immediately below in
 * the stack. No-op if already at the back. */
export function sendBackward(elements: CoverElement[] | undefined, id: string): CoverElement[] {
  const list = elements ?? []
  const sorted = [...list].sort((a, b) => a.zIndex - b.zIndex)
  const index = sorted.findIndex((e) => e.id === id)
  if (index <= 0) return list
  const current = sorted[index]
  const prev = sorted[index - 1]
  return list.map((e) => {
    if (e.id === current.id) return { ...e, zIndex: prev.zIndex } as CoverElement
    if (e.id === prev.id) return { ...e, zIndex: current.zIndex } as CoverElement
    return e
  })
}

/** Clones an element with a fresh id, nudged slightly down-right (same
 * small offset `createCoverElement` uses for a freshly-added element) so
 * the copy doesn't sit exactly on top of the original and look like nothing
 * happened, and brought to the front (`nextZIndex`) so it's immediately
 * visible and already the topmost/selected-feeling element. Returns the new
 * element's id alongside the array so the caller can select it immediately,
 * matching every other "add" action's convention (`createCoverElement` +
 * `CoverElementToolbar`'s `onAdd`). */
export function duplicateElement(elements: CoverElement[] | undefined, id: string): { elements: CoverElement[]; newId: string } | undefined {
  const list = elements ?? []
  const source = list.find((e) => e.id === id)
  if (!source) return undefined

  const DUPLICATE_OFFSET = 0.03
  const clone: CoverElement = {
    ...source,
    id: generateId('cover-el'),
    x: clampFraction(source.x + DUPLICATE_OFFSET, source.width),
    y: clampFraction(source.y + DUPLICATE_OFFSET, source.height),
    zIndex: nextZIndex(list),
  }
  return { elements: [...list, clone], newId: clone.id }
}

function clampFraction(value: number, size: number): number {
  return Math.min(Math.max(value, 0), 1 - size)
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
export async function drawCoverElementsPdf(
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
    // Whole-element opacity multiplier (Phase 59 brainstorm) — declared on
    // `BaseCoverElement` so it applies uniformly regardless of kind.
    // `rect`/`ellipse`'s pre-existing `fillOpacity` only ever affected the
    // fill (a stroke stayed fully opaque); this composes on top of that
    // rather than replacing it, matching the on-screen `ElementBody`'s
    // nested-opacity treatment.
    const elementOpacity = el.opacity ?? 1

    if (el.kind === 'rect') {
      ctx.page.drawRectangle({
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        color: el.fill ? hexToPdfColor(el.fill) : undefined,
        opacity: el.fill ? (el.fillOpacity ?? 1) * elementOpacity : elementOpacity,
        borderColor: el.stroke ? hexToPdfColor(el.stroke) : undefined,
        borderWidth: el.stroke ? (el.strokeWidth ?? 1) * PX_TO_PT : undefined,
        borderOpacity: el.stroke ? elementOpacity : undefined,
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
        opacity: el.fill ? (el.fillOpacity ?? 1) * elementOpacity : elementOpacity,
        borderColor: el.stroke ? hexToPdfColor(el.stroke) : undefined,
        borderWidth: el.stroke ? (el.strokeWidth ?? 1) * PX_TO_PT : undefined,
        borderOpacity: el.stroke ? elementOpacity : undefined,
      })
    } else if (el.kind === 'line') {
      const midYPt = yPt + hPt / 2
      ctx.page.drawLine({
        start: { x: xPt, y: midYPt },
        end: { x: xPt + wPt, y: midYPt },
        thickness: (el.strokeWidth ?? 1) * PX_TO_PT,
        color: el.stroke ? hexToPdfColor(el.stroke) : rgb(0, 0, 0),
        opacity: elementOpacity,
      })
    } else if (el.kind === 'icon') {
      // Square icon centred within the element's box (an icon box need not
      // be square itself — e.g. dragged wider than tall — but the icon
      // inside it always keeps its own 1:1 aspect ratio, matching the
      // screen layer's `<Icon>` render).
      const iconSizePt = Math.min(wPt, hPt)
      const iconScale = iconSizePt / 24
      const iconX = xPt + (wPt - iconSizePt) / 2
      const iconTopY = yPt + hPt - (hPt - iconSizePt) / 2
      const color = el.color ? hexToPdfColor(el.color) : rgb(1, 1, 1)
      // NOT pre-multiplied by `iconScale` here: `drawSvgPath` applies its
      // own `scale(iconScale, -iconScale)` transform to the current
      // graphics state before stroking, and per the PDF spec a stroke's
      // line width is itself subject to the CTM in effect at stroke time —
      // so a width already multiplied by `iconScale` gets scaled a SECOND
      // time, producing a stroke `iconScale`× too fat (confirmed visually:
      // rendered as solid overstroked blobs, not thin outlines, before this
      // fix). The raw, un-scaled `strokeWidth` is correct here, matching
      // lucide's own SVG, which also specifies `stroke-width="2"` directly
      // in the un-scaled 24-unit viewBox and lets the viewport's own scale
      // do the rest. `drawEllipse` below has no such transform, so its
      // `borderWidth` is pre-multiplied by `iconScale` as normal.
      const svgBorderWidth = el.strokeWidth ?? 2
      const ellipseBorderWidthPt = (el.strokeWidth ?? 2) * iconScale
      for (const node of COVER_ICON_PDF_NODES[el.iconId]) {
        if (node.type === 'path') {
          ctx.page.drawSvgPath(node.d, {
            x: iconX,
            y: iconTopY,
            scale: iconScale,
            borderColor: color,
            borderWidth: svgBorderWidth,
            borderLineCap: LineCapStyle.Round,
            opacity: elementOpacity,
            borderOpacity: elementOpacity,
          })
        } else {
          ctx.page.drawEllipse({
            x: iconX + node.cx * iconScale,
            y: iconTopY - node.cy * iconScale,
            xScale: node.r * iconScale,
            yScale: node.r * iconScale,
            borderColor: color,
            borderWidth: ellipseBorderWidthPt,
            borderOpacity: elementOpacity,
          })
        }
      }
    } else if (el.kind === 'badge') {
      // Background shape first, then centred text on top — the same two
      // ingredients as a `rect`/`ellipse` element plus a `text` element,
      // just always drawn together so the text can't be repositioned away
      // from the shape's centre (see `CoverBadgeElement`'s doc comment).
      const bg = el.backgroundColor ? hexToPdfColor(el.backgroundColor) : undefined
      const border = el.borderColor ? hexToPdfColor(el.borderColor) : undefined
      const borderWidthPt = el.borderColor ? (el.borderWidth ?? 1) * PX_TO_PT : undefined
      if (el.shape === 'circle') {
        const rPt = Math.min(wPt, hPt) / 2
        ctx.page.drawEllipse({
          x: xPt + wPt / 2,
          y: yPt + hPt / 2,
          xScale: rPt,
          yScale: rPt,
          color: bg,
          borderColor: border,
          borderWidth: borderWidthPt,
          opacity: elementOpacity,
          borderOpacity: elementOpacity,
        })
      } else {
        ctx.page.drawRectangle({
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          color: bg,
          borderColor: border,
          borderWidth: borderWidthPt,
          opacity: elementOpacity,
          borderOpacity: elementOpacity,
        })
      }

      const fontFamily = resolveCoverFontFamily({ fontChoice: el.fontChoice }, ctx.theme.fonts.body)
      const font = pickFont(ctx.fonts, fontFamily, 600)
      const size = (el.fontSize ?? 15) * PX_TO_PT
      const textWidth = font.widthOfTextAtSize(el.text, size)
      ctx.page.drawText(el.text, {
        x: xPt + (wPt - textWidth) / 2,
        y: yPt + hPt / 2 - size * 0.35,
        size,
        font,
        color: el.textColor ? hexToPdfColor(el.textColor) : rgb(1, 1, 1),
        opacity: elementOpacity,
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
        opacity: elementOpacity,
      })
    } else if (el.kind === 'image' && el.imageAssetId) {
      const blob = await getAssetBlob(el.imageAssetId)
      if (blob) {
        const { bytes, width, height } = await blobToPng(blob, false)
        const pdfImage = await ctx.page.doc.embedPng(bytes)
        // Same cover-fit math as the page background image
        // (`computeCoverImagePdfPlacement` is generic over any box, not
        // just the full media box), scoped down to this element's own
        // width/height in place of `mediaWidthPt`/`mediaHeightPt`. Focal
        // point + zoom (Phase 59) reuse the same `CoverImageFocalPoint`
        // shape as the main background image.
        const placement = computeCoverImagePdfPlacement({
          mediaWidthPt: wPt,
          mediaHeightPt: hPt,
          imageWidth: width,
          imageHeight: height,
          focalPoint: el.imageFocalPoint,
          zoom: el.imageZoom,
        })
        // A secondary image's cover-fit-scaled source is routinely larger
        // than its own box (that's the point of "cover" fit), so — unlike
        // the full-bleed background image, which never overflows the page
        // — this needs an explicit clip to its element box or the excess
        // would paint straight over the rest of the cover.
        ctx.page.pushOperators(pushGraphicsState(), rectangle(xPt, yPt, wPt, hPt), clip(), endPath())
        ctx.page.drawImage(pdfImage, {
          x: xPt + placement.x,
          y: yPt + placement.y,
          width: placement.width,
          height: placement.height,
          opacity: elementOpacity,
        })
        ctx.page.pushOperators(popGraphicsState())
      }
    }
  }
}
