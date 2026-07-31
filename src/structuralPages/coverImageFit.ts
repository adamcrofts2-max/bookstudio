import type { CoverImageFocalPoint } from '@/types/structuralPage'

/**
 * Shared image-crop math for a Cover/Back Cover's background image — used
 * by both the on-screen renderer and the PDF exporter so a photo crops
 * identically in both, the same DRY principle `coverLayout.ts` already
 * established for text position. See `docs/STATUS.md` Phase 46.
 */

export const DEFAULT_FOCAL_POINT: CoverImageFocalPoint = { x: 0.5, y: 0.5 }

/**
 * On-screen CSS for a focal-point-aware, optionally-zoomed `object-cover`
 * image. `object-position` alone reproduces CSS's real cropping behaviour
 * (the point at `x%,y%` of the *scaled* image aligns with `x%,y%` of the
 * container) — the pre-existing fixed centred crop is just this function
 * called with the defaults. Zoom beyond cover-fit is a `scale()` transform
 * pivoted on the same focal point, so zooming in keeps the chosen point
 * fixed on screen instead of drifting toward a corner.
 */
export function computeCoverImageScreenStyle(
  focalPoint: CoverImageFocalPoint | undefined,
  zoom: number | undefined,
): { objectPosition: string; transform?: string; transformOrigin: string } {
  const x = focalPoint?.x ?? DEFAULT_FOCAL_POINT.x
  const y = focalPoint?.y ?? DEFAULT_FOCAL_POINT.y
  const z = zoom ?? 1
  return {
    objectPosition: `${x * 100}% ${y * 100}%`,
    transformOrigin: `${x * 100}% ${y * 100}%`,
    transform: z !== 1 ? `scale(${z})` : undefined,
  }
}

export interface CoverImagePdfPlacement {
  x: number
  y: number
  width: number
  height: number
}

/**
 * PDF-side equivalent of `computeCoverImageScreenStyle` — same cover-fit +
 * zoom scale factor, then positioned so the image's `(x,y)` focal fraction
 * lands on the container's `(x,y)` fraction, exactly mirroring CSS
 * `object-position` semantics. The vertical fraction is flipped (`1 - y`)
 * because pdf-lib's y-axis runs bottom-up while CSS's runs top-down.
 *
 * Verified to reproduce the exact pre-existing formula bit for bit at the
 * defaults (focal `0.5,0.5`, zoom `1`): `x = 0.5 * (mediaWidthPt - width)`
 * is `(mediaWidthPt - width) / 2`, matching `drawCoverPdf`'s original
 * centred placement, and likewise for `y`.
 */
export function computeCoverImagePdfPlacement(params: {
  mediaWidthPt: number
  mediaHeightPt: number
  imageWidth: number
  imageHeight: number
  focalPoint: CoverImageFocalPoint | undefined
  zoom: number | undefined
}): CoverImagePdfPlacement {
  const { mediaWidthPt, mediaHeightPt, imageWidth, imageHeight, focalPoint, zoom } = params
  const x = focalPoint?.x ?? DEFAULT_FOCAL_POINT.x
  const y = focalPoint?.y ?? DEFAULT_FOCAL_POINT.y
  const z = zoom ?? 1
  const baseScale = Math.max(mediaWidthPt / imageWidth, mediaHeightPt / imageHeight)
  const scale = baseScale * z
  const width = imageWidth * scale
  const height = imageHeight * scale
  return {
    x: x * (mediaWidthPt - width),
    y: (1 - y) * (mediaHeightPt - height),
    width,
    height,
  }
}
