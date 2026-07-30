/** Blends a "#rrggbb" hex colour toward white by `amount` (0 = original
 * colour, 1 = pure white) — used by the Cover page type's tinted background
 * when no cover image is set (`CoverPage.content.imageAssetId` absent). */
export function tintHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  const toHex = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}
