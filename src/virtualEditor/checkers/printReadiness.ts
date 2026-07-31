/**
 * Virtual Editor — Print Readiness checkers.
 *
 * The first checkers to read `ctx.project` (trim size, margins, bleed) and
 * `ctx.assets` (each image's real pixel dimensions) — see `CheckerContext`'s
 * doc comment in `types.ts` for why both were added. Every checker here
 * mirrors real print-on-demand production rules (Amazon KDP's published
 * gutter-margin table, the standard 300ppi print-resolution floor, the
 * conventional 0.125in/3mm minimum bleed) rather than inventing thresholds —
 * see each checker's own doc comment for its source.
 *
 * Deliberately out of scope for this milestone (real future work, not
 * silently faked): CMYK colour-space conversion/soft-proofing, embedded
 * font subset validation, and true page-count-triggered spine-width
 * calculation for a wraparound cover — all still checkbox items in
 * `docs/ROADMAP.md` Phase D/E, which need capabilities (a real colour
 * pipeline, a cover designer) this checker layer has no access to.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { ImageBlock } from '@/types/content'
import { computePageBox, PX_PER_MM } from '@/renderer/pageGeometry'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'print',
    source: 'deterministic',
    ...partial,
  }
}

const MM_PER_INCH = 25.4

/** Effective rendered width in millimetres, reusing the exact same
 * `widthMm` > `widthPercent ?? 100` precedence established in
 * `layout.ts`'s `effectiveImageWidth` and `src/blocks/types/image.tsx` —
 * except here it's resolved all the way to a physical mm value using real
 * page geometry, which `layout.ts`'s version explicitly couldn't do without
 * `ctx.project` (see that function's own "honest limitation" doc comment,
 * now closed by this file's access to `ctx.project`). */
function effectiveWidthMm(block: ImageBlock, contentWidthMm: number): number {
  if (block.widthMm) return block.widthMm
  return contentWidthMm * ((block.widthPercent ?? 100) / 100)
}

const MIN_ACCEPTABLE_PRINT_DPI = 300
const SEVERELY_LOW_PRINT_DPI = 150

/**
 * Standard print-production floor: an image needs roughly 300 pixels per
 * printed inch to look sharp (the same rule of thumb Amazon KDP, IngramSpark
 * and every professional print workflow use). Below ~150ppi, print
 * softness/pixelation is usually visible even to a casual reader; between
 * 150 and 300 it's a real but less severe quality risk. Silent when either
 * `ctx.assets` or `ctx.project` is unavailable, or when a referenced asset
 * simply isn't found in `ctx.assets` (an asset that failed to load isn't
 * this checker's concern).
 */
export const lowResolutionImageChecker: Checker = {
  id: 'print.low-resolution-image',
  category: 'print',
  label: 'Image below print resolution',
  description: 'Flags images whose real pixel dimensions fall below ~300ppi at their rendered print size.',
  isApplicable: (ctx) => !!ctx.project && !!ctx.assets,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project || !ctx.assets) return []
    const assetById = new Map(ctx.assets.map((a) => [a.id, a]))
    const contentWidthMm = computePageBox(ctx.project.settings).contentWidthPx / PX_PER_MM
    const findings: Finding[] = []

    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'image') continue
        const asset = assetById.get(block.assetId)
        if (!asset) continue

        const widthMm = effectiveWidthMm(block, contentWidthMm)
        if (widthMm <= 0) continue
        const dpi = asset.width / (widthMm / MM_PER_INCH)
        if (dpi >= MIN_ACCEPTABLE_PRINT_DPI) continue

        const severity = dpi < SEVERELY_LOW_PRINT_DPI ? 'major' : 'minor'
        findings.push(
          makeFinding({
            checkerId: lowResolutionImageChecker.id,
            issueType: 'low-resolution-image',
            severity,
            confidence: 0.85,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `This image renders at ~${Math.round(dpi)}ppi at its current size (${Math.round(widthMm)}mm wide) — below the ${MIN_ACCEPTABLE_PRINT_DPI}ppi standard for sharp print output.`,
            whyItMatters:
              'Professional print-on-demand platforms expect roughly 300 pixels per printed inch; below that, an image can look soft, blurry or visibly pixelated on the printed page even though it looks fine on a screen. Use a higher-resolution source image or render it smaller.',
          }),
        )
      }
    }
    return findings
  },
}

/**
 * An image with an explicit physical size (`widthMm`) larger than the
 * page's own content column overflows into the margin — the one case
 * `layout.ts`'s `effectiveImageWidth` explicitly couldn't check without
 * page geometry. A small tolerance (1mm) avoids flagging harmless
 * rounding-level overages.
 */
export const imageExceedsColumnWidthChecker: Checker = {
  id: 'print.image-exceeds-column-width',
  category: 'print',
  label: 'Image wider than the content column',
  description: "Flags an image whose explicit physical width is larger than the page's content column, overflowing into the margin.",
  isApplicable: (ctx) => !!ctx.project,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project) return []
    const contentWidthMm = computePageBox(ctx.project.settings).contentWidthPx / PX_PER_MM
    const TOLERANCE_MM = 1
    const findings: Finding[] = []

    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'image' || !block.widthMm) continue
        if (block.widthMm <= contentWidthMm + TOLERANCE_MM) continue

        findings.push(
          makeFinding({
            checkerId: imageExceedsColumnWidthChecker.id,
            issueType: 'image-exceeds-column-width',
            severity: 'minor',
            confidence: 0.8,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `This image is set to ${Math.round(block.widthMm)}mm wide, but the page's content column is only ${Math.round(contentWidthMm)}mm — it will overflow into the margin.`,
            whyItMatters:
              "An image wider than the content column either gets clipped or bleeds unintentionally into the margin, breaking the page's safe-area boundaries a professional layout relies on.",
          }),
        )
      }
    }
    return findings
  },
}

/**
 * Amazon KDP's published black-and-white interior gutter (inner margin)
 * minimums scale with page count, since a thicker perfect-bound book curves
 * more into the spine: 0.375in up to 150 pages, 0.5in up to 300, 0.625in up
 * to 500, 0.75in up to 700, 0.875in beyond that. This is the same real
 * table referenced in `docs/ROADMAP.md` Phase D's "Print-on-demand
 * validation profiles (Amazon KDP...)" item — this checker implements the
 * one concrete, table-driven rule from that larger item now; a fuller
 * multi-platform validation report (IngramSpark's own table, colour
 * interior rules, etc.) remains that Phase D item's separate, larger scope.
 * Silent when `ctx.pages` is absent (page count isn't known yet this
 * session) or the manuscript has no chapters to anchor the finding to.
 */
const KDP_GUTTER_TABLE: { maxPages: number; minInches: number }[] = [
  { maxPages: 150, minInches: 0.375 },
  { maxPages: 300, minInches: 0.5 },
  { maxPages: 500, minInches: 0.625 },
  { maxPages: 700, minInches: 0.75 },
  { maxPages: Infinity, minInches: 0.875 },
]

export const kdpGutterMarginChecker: Checker = {
  id: 'print.kdp-gutter-margin',
  category: 'print',
  label: 'Inner margin below KDP gutter minimum',
  description: "Flags an inner (gutter) margin below Amazon KDP's published minimum for the book's page count.",
  isApplicable: (ctx) => !!ctx.project && !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project || !ctx.pages) return []
    const firstChapterId = ctx.manuscript.chapters[0]?.id
    if (!firstChapterId) return []

    const pageCount = ctx.pages.length
    const rule = KDP_GUTTER_TABLE.find((r) => pageCount <= r.maxPages)!
    const innerIn = ctx.project.settings.margins.inner / MM_PER_INCH
    if (innerIn >= rule.minInches) return []

    return [
      makeFinding({
        checkerId: kdpGutterMarginChecker.id,
        issueType: 'kdp-gutter-margin-too-small',
        severity: 'major',
        confidence: 0.8,
        location: { chapterId: firstChapterId },
        message: `This book is ${pageCount} pages with a ${innerIn.toFixed(2)}in inner margin — Amazon KDP recommends at least ${rule.minInches}in for a book this length.`,
        whyItMatters:
          "A thicker perfect-bound book curves more into the spine, so print-on-demand platforms require a wider inner margin as page count grows — too narrow a gutter risks text disappearing into the binding.",
      }),
    ]
  },
}

const MIN_STANDARD_BLEED_MM = 3 // ~0.125in, the conventional minimum full bleed for commercial print

/**
 * The conventional minimum bleed for commercial print is 0.125in (~3mm) —
 * anything less risks a visible sliver of unprinted white paper at the
 * trimmed edge if the cutter is off by even a fraction of a millimetre.
 * Only fires when at least one full-bleed structural page (a Cover or Back
 * Cover with a background image set) actually exists — a book with no
 * full-bleed imagery at all has nothing that bleed insufficiency would
 * visibly affect.
 */
export const insufficientBleedForImageryChecker: Checker = {
  id: 'print.insufficient-bleed',
  category: 'print',
  label: 'Bleed below the commercial-print minimum',
  description: 'Flags a project bleed setting below the conventional 0.125in/3mm minimum when a full-bleed cover image is in use.',
  isApplicable: (ctx) => !!ctx.project && !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project || !ctx.structuralPages) return []
    if (ctx.project.settings.bleed >= MIN_STANDARD_BLEED_MM) return []

    const hasFullBleedImage = ctx.structuralPages.some(
      (page) => (page.type === 'cover' || page.type === 'back-cover') && !!page.content.imageAssetId,
    )
    if (!hasFullBleedImage) return []

    const firstChapterId = ctx.manuscript.chapters[0]?.id
    if (!firstChapterId) return []

    return [
      makeFinding({
        checkerId: insufficientBleedForImageryChecker.id,
        issueType: 'insufficient-bleed',
        severity: 'major',
        confidence: 0.75,
        location: { chapterId: firstChapterId },
        message: `This project's bleed is set to ${ctx.project.settings.bleed}mm, below the conventional ${MIN_STANDARD_BLEED_MM}mm minimum, and a Cover or Back Cover page uses a full-bleed image.`,
        whyItMatters:
          "With too little bleed, a fraction-of-a-millimetre variance in the printer's trim can leave a thin sliver of unprinted white paper at the edge of the page instead of image bleeding fully to the trim line.",
      }),
    ]
  },
}

export const PRINT_READINESS_CHECKERS: Checker[] = [
  lowResolutionImageChecker,
  imageExceedsColumnWidthChecker,
  kdpGutterMarginChecker,
  insufficientBleedForImageryChecker,
]
