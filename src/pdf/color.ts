import { rgb, type RGB } from 'pdf-lib'

/** Converts a "#rrggbb" hex colour into pdf-lib's 0–1 RGB colour space. */
export function hexToPdfColor(hex: string): RGB {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}
