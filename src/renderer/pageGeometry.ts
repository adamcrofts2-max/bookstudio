import type { ProjectSettings, TrimSize } from '@/types/project'

export const PX_PER_MM = 96 / 25.4 // CSS px per mm at 96dpi
const MM_PER_INCH = 25.4

const TRIM_SIZE_INCHES: Record<Exclude<TrimSize, 'custom'>, { width: number; height: number }> = {
  '5x8': { width: 5, height: 8 },
  '5.5x8.5': { width: 5.5, height: 8.5 },
  '6x9': { width: 6, height: 9 },
  '7x10': { width: 7, height: 10 },
  '8.5x11': { width: 8.5, height: 11 },
}

export interface PageBox {
  widthPx: number
  heightPx: number
  bleedPx: number
  marginTopPx: number
  marginBottomPx: number
  marginInnerPx: number
  marginOuterPx: number
  contentWidthPx: number
  contentHeightPx: number
}

function trimSizeToMm(settings: ProjectSettings): { width: number; height: number } {
  if (settings.trimSize === 'custom' && settings.customTrimSize) {
    return { width: settings.customTrimSize.width, height: settings.customTrimSize.height }
  }
  const inches = TRIM_SIZE_INCHES[settings.trimSize as Exclude<TrimSize, 'custom'>] ?? TRIM_SIZE_INCHES['6x9']
  return { width: inches.width * MM_PER_INCH, height: inches.height * MM_PER_INCH }
}

/** Converts a project's trim size + margins + bleed (all stored in mm) into
 * concrete CSS pixel dimensions for on-screen rendering at 96dpi. */
export function computePageBox(settings: ProjectSettings): PageBox {
  const { width, height } = trimSizeToMm(settings)
  const widthPx = width * PX_PER_MM
  const heightPx = height * PX_PER_MM
  const bleedPx = settings.bleed * PX_PER_MM
  const marginTopPx = settings.margins.top * PX_PER_MM
  const marginBottomPx = settings.margins.bottom * PX_PER_MM
  const marginInnerPx = settings.margins.inner * PX_PER_MM
  const marginOuterPx = settings.margins.outer * PX_PER_MM

  return {
    widthPx,
    heightPx,
    bleedPx,
    marginTopPx,
    marginBottomPx,
    marginInnerPx,
    marginOuterPx,
    contentWidthPx: widthPx - marginInnerPx - marginOuterPx,
    contentHeightPx: heightPx - marginTopPx - marginBottomPx,
  }
}
