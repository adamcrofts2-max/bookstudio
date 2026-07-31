/**
 * Virtual Editor — Layout checkers.
 *
 * Like `publishingStandards.ts`, these read real pagination output
 * (`CheckerContext.pages`) — see `docs/VIRTUAL_EDITOR.md` § the architectural
 * gap this closes. Both checkers here are `suggestion` severity: polish
 * nits about visual consistency, not errors, matching the product spec's own
 * framing of the Layout category as design critique rather than correctness.
 *
 * Neither checker needs any height/measurement data beyond what
 * `LaidOutPage`/`ContentBlock` already carry — no new dependency on
 * `HeightMeasurer` or page geometry.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { LaidOutPage } from '@/renderer/paginate'
import type { ContentBlock, ImageBlock } from '@/types/content'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'layout',
    source: 'deterministic',
    ...partial,
  }
}

interface PagedChapter {
  id: string
  title: string
  pages: LaidOutPage[]
}

/** Same grouping helper as `publishingStandards.ts` — duplicated rather than
 * shared across files, since it's a handful of lines and this codebase's own
 * precedent (`consistency.ts` vs `proofreading.ts`) is one small helper per
 * checker file rather than a shared checkers-internal utility module. */
function chaptersFromPages(pages: LaidOutPage[]): PagedChapter[] {
  const order: string[] = []
  const byId = new Map<string, PagedChapter>()

  for (const page of pages) {
    if (page.kind === 'structural' || !page.chapterId) continue
    let entry = byId.get(page.chapterId)
    if (!entry) {
      entry = { id: page.chapterId, title: page.chapterTitle ?? 'Untitled chapter', pages: [] }
      byId.set(page.chapterId, entry)
      order.push(page.chapterId)
    }
    entry.pages.push(page)
  }

  return order.map((id) => byId.get(id)!)
}

function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image'
}

/**
 * Reuses the exact same width-precedence rule already established in
 * `src/blocks/types/image.tsx` (`ImageRender`) and `exportPdf.ts`'s
 * `drawImagePdf` — `widthMm` wins when set, otherwise `widthPercent ?? 100`
 * — rather than inventing a second, possibly-drifting notion of "effective
 * width." See `ImageBlock`'s own doc comments in `src/types/content.ts` for
 * why `widthMm` takes precedence (it's the more specific, explicit choice).
 *
 * **Honest limitation**: `widthMm` (a physical size in millimetres) and
 * `widthPercent` (a percentage of the content column) are different units.
 * A chapter that deliberately mixes a few `widthMm`-sized images with a few
 * `widthPercent`-sized ones could, in principle, produce a numeric
 * coincidence this function can't tell apart from a genuine sizing
 * inconsistency — `CheckerContext` doesn't carry page geometry (the content
 * column's width in px/mm), so there's no way to convert one unit into the
 * other here. Documented, not hidden; a future pass could close this gap by
 * threading `pageBox` through the same way `pages` was added this milestone.
 */
function effectiveImageWidth(block: ImageBlock): number {
  return block.widthMm ?? (block.widthPercent ?? 100)
}

/** Buckets an effective width to the nearest 10 (whether the underlying unit
 * is mm or a percentage) so that near-identical sizes — e.g. 84% vs 85%,
 * a rounding-level difference with no real visual impact — count as the same
 * bucket rather than tripping a false positive, while genuinely different
 * sizes (e.g. 40% vs 100%) still land in different buckets. A simple,
 * explainable rule, not a statistics library. */
function widthBucket(width: number): number {
  return Math.round(width / 10) * 10
}

const MIN_IMAGES_FOR_SIZING_CHECK = 3
const MAX_DISTINCT_WIDTH_BUCKETS = 3

/**
 * Flags a chapter whose images vary widely in size with no apparent
 * intentional grouping — 3+ images spread across more than 3 distinct
 * effective-width buckets (see `widthBucket`). `suggestion` severity: this
 * is a visual-polish nit (a book can legitimately mix a few deliberate
 * sizes — a hero image at 100%, inline photos at 65% — this only fires once
 * the variety goes beyond what reads as a deliberate small set of sizes),
 * never something "wrong" the way a proofreading error is.
 */
export const inconsistentImageSizingChecker: Checker = {
  id: 'layout.inconsistent-image-sizing',
  category: 'layout',
  label: 'Inconsistent image sizing',
  description: 'Flags a chapter whose images use many different sizes with no apparent consistent grouping.',
  isApplicable: (ctx) => !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.pages) return []
    const findings: Finding[] = []

    for (const chapter of chaptersFromPages(ctx.pages)) {
      const images = chapter.pages.flatMap((page) => page.blocks.filter(isImageBlock))
      if (images.length < MIN_IMAGES_FOR_SIZING_CHECK) continue

      const buckets = new Set(images.map((img) => widthBucket(effectiveImageWidth(img))))
      if (buckets.size <= MAX_DISTINCT_WIDTH_BUCKETS) continue

      const first = images[0]!
      findings.push(
        makeFinding({
          checkerId: inconsistentImageSizingChecker.id,
          issueType: 'inconsistent-image-sizing',
          severity: 'suggestion',
          confidence: 0.5,
          location: { chapterId: chapter.id, blockId: first.id },
          message: `"${chapter.title}" has ${images.length} images spread across ${buckets.size} different sizes — consider settling on a smaller, more consistent set of sizes.`,
          whyItMatters:
            'Publishers typically use a small, deliberate set of image sizes within a chapter (e.g. one "feature" size and one "inline" size) — a wide, seemingly arbitrary spread of sizes reads as unplanned rather than art-directed.',
        }),
      )
    }

    return findings
  },
}

const ZERO_IMAGE_FLAG_AVERAGE_THRESHOLD = 2
const HIGH_IMAGE_COUNT_MULTIPLIER = 2

/**
 * Book-wide: compares each chapter's image count against the book's own
 * average and flags real outliers, using two simple, explainable rules
 * (not a statistics library):
 *
 * 1. **Zero images in a chapter when the book-wide average is >= 2** — a
 *    chapter with no images at all stands out as under-illustrated relative
 *    to how the rest of the book actually reads.
 * 2. **More than double the book average** — a chapter with a dramatically
 *    higher image count than every other chapter, which as often signals an
 *    accidental duplicate-insertion or a gallery dumped in the wrong place
 *    as it does deliberate art direction.
 *
 * Both rules require the book average to be meaningfully above zero (a book
 * with few or no images anywhere has nothing to be an outlier against).
 * `suggestion` severity — this is a "worth a second look" signal, not an
 * error.
 */
export const imageDensityImbalanceChecker: Checker = {
  id: 'layout.image-density-imbalance',
  category: 'layout',
  label: 'Image density imbalance',
  description: "Flags a chapter whose image count is a real outlier against the book's own average.",
  isApplicable: (ctx) => !!ctx.pages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.pages) return []
    const chapters = chaptersFromPages(ctx.pages)
    if (chapters.length === 0) return []

    const counts = chapters.map((chapter) => ({
      chapter,
      count: chapter.pages.reduce((sum, page) => sum + page.blocks.filter(isImageBlock).length, 0),
      firstImageId: chapter.pages.flatMap((page) => page.blocks.filter(isImageBlock)).at(0)?.id,
    }))
    const bookAverage = counts.reduce((sum, c) => sum + c.count, 0) / counts.length
    if (bookAverage <= 0) return []

    const findings: Finding[] = []
    for (const { chapter, count, firstImageId } of counts) {
      if (count === 0 && bookAverage >= ZERO_IMAGE_FLAG_AVERAGE_THRESHOLD) {
        findings.push(
          makeFinding({
            checkerId: imageDensityImbalanceChecker.id,
            issueType: 'image-density-zero',
            severity: 'suggestion',
            confidence: 0.5,
            location: { chapterId: chapter.id },
            message: `"${chapter.title}" has no images at all, while the book averages ${bookAverage.toFixed(1)} images per chapter.`,
            whyItMatters:
              'A chapter with no illustrations in an otherwise well-illustrated book can read as unfinished, or as if artwork was lost during editing — worth a deliberate check that this is intentional.',
          }),
        )
      } else if (count > bookAverage * HIGH_IMAGE_COUNT_MULTIPLIER) {
        findings.push(
          makeFinding({
            checkerId: imageDensityImbalanceChecker.id,
            issueType: 'image-density-high',
            severity: 'suggestion',
            confidence: 0.5,
            location: { chapterId: chapter.id, blockId: firstImageId },
            message: `"${chapter.title}" has ${count} images — more than double the book's average of ${bookAverage.toFixed(1)} per chapter.`,
            whyItMatters:
              'A chapter with a dramatically higher image count than the rest of the book can be a genuine editorial choice, but is often a sign of an accidental duplicate insertion or a gallery placed in the wrong chapter — worth a second look.',
          }),
        )
      }
    }

    return findings
  },
}

export const LAYOUT_CHECKERS: Checker[] = [inconsistentImageSizingChecker, imageDensityImbalanceChecker]
