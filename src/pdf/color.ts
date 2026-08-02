import { cmyk, rgb, type Color } from 'pdf-lib'

/** Which colour space solid fills/text/rules render in for PDF export
 * (`docs/ROADMAP.md` Phase D, "CMYK-aware export workflow for commercial
 * print"). `'rgb'` is the long-standing default and what every existing
 * project effectively used before this option existed — screen-native, and
 * what Amazon KDP's own upload guidance recommends. `'cmyk'` matches what
 * commercial offset printers and IngramSpark's print-ready spec expect: a
 * PDF whose colours are already expressed as press separations rather than
 * relying on the printer's own (often inconsistent) RGB-to-CMYK conversion
 * at RIP time. Chosen per project in `ProjectSettingsDialog.tsx`
 * (`ProjectSettings.colorProfile`), not a global — a screen-only ebook
 * project has no reason to think in CMYK at all. */
export type PdfColorMode = 'rgb' | 'cmyk'

/** Converts a "#rrggbb" hex colour into pdf-lib's 0–1 RGB colour space. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return { r, g, b }
}

/**
 * Naive (non-colour-managed) RGB→CMYK conversion — the same "no ICC
 * profile" formula essentially every consumer design tool falls back to
 * without one: derive K from whichever channel is darkest, then divide the
 * others through by the remaining light. This is deliberately not a true
 * colorimetric conversion (that needs a real ICC profile + colour-managed
 * pipeline, out of scope for a client-side PDF writer with no network
 * access to fetch a profile) — it's the same approximation Word, most web
 * tools, and even some cheaper prepress software use, and it's a large,
 * genuine improvement over shipping RGB values unchanged into a CMYK
 * workflow (which is what "not CMYK-aware at all" means today). Documented
 * here plainly rather than implied, so nobody mistakes this for a
 * press-calibrated conversion.
 */
function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 } // pure black — avoid divide-by-zero below
  const c = (1 - r - k) / (1 - k)
  const m = (1 - g - k) / (1 - k)
  const y = (1 - b - k) / (1 - k)
  return { c, m, y, k }
}

/** Converts a "#rrggbb" hex colour into a pdf-lib `Color` in the requested
 * colour space. `mode` is required (not defaulted) — every call site
 * threads it from `DrawCtx.colorMode`/`ctx.colorMode`, itself derived once
 * per export from `ProjectSettings.colorProfile`, so a stale default here
 * can never silently diverge from what the rest of the document uses. */
export function hexToPdfColor(hex: string, mode: PdfColorMode): Color {
  const { r, g, b } = hexToRgb(hex)
  if (mode === 'cmyk') {
    const { c, m, y, k } = rgbToCmyk(r, g, b)
    return cmyk(c, m, y, k)
  }
  return rgb(r, g, b)
}

/** True black in the requested colour space — `rgb(0,0,0)` in RGB mode,
 * `cmyk(0,0,0,1)` (pure K, not a "rich black" registration mix) in CMYK
 * mode. Pure K rather than a 4-colour rich black is the deliberate choice
 * for thin lines and body text specifically: rich black on small text or
 * hairline rules is a common misregistration/muddiness complaint in real
 * print runs, where pure K prints crisp on a single plate. Used wherever
 * this codebase previously hardcoded `rgb(0, 0, 0)` as a fallback (crop
 * marks, a cover element with no explicit colour set). */
export function pdfBlack(mode: PdfColorMode): Color {
  return mode === 'cmyk' ? cmyk(0, 0, 0, 1) : rgb(0, 0, 0)
}

/** True white in the requested colour space — `rgb(1,1,1)` in RGB mode,
 * `cmyk(0,0,0,0)` (no ink at all, i.e. the paper's own white) in CMYK mode.
 * Used wherever this codebase previously hardcoded `rgb(1, 1, 1)` as a
 * fallback (cover element text/fill with no explicit colour set). */
export function pdfWhite(mode: PdfColorMode): Color {
  return mode === 'cmyk' ? cmyk(0, 0, 0, 0) : rgb(1, 1, 1)
}
