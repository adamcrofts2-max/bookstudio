/**
 * Virtual Editor — Accessibility checkers.
 *
 * Deterministic checks against the manuscript's own structure and content —
 * no colour-contrast or font-size measurement here (that would need real
 * rendered/theme data beyond what any checker in this codebase reads today;
 * see `docs/ROADMAP.md` Phase J's "Automated accessibility (WCAG) audit"
 * item for that larger, separate piece of work). What's checkable purely
 * from `Manuscript` content: missing image descriptions, heading-level
 * skips, and tables without header rows — all real WCAG success criteria
 * (1.1.1 Non-text Content, 1.3.1 Info and Relationships, 2.4.6 Headings and
 * Labels).
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { HeadingBlock, ImageBlock } from '@/types/content'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'accessibility',
    source: 'deterministic',
    ...partial,
  }
}

/**
 * WCAG 1.1.1 (Non-text Content): every image needs a text alternative. This
 * codebase's `ImageBlock.altText` falls back to `caption` when absent (see
 * `src/types/content.ts`), so an image only genuinely has *no* accessible
 * description when both are missing — that's flagged `major` (a screen
 * reader announces nothing at all for this image). An image with a caption
 * but no dedicated `altText` still has *something* read aloud, so it's
 * flagged only as a `suggestion` to add a purpose-built description (a
 * caption is written for a sighted reader looking at the image, which isn't
 * always the same text a screen-reader description should say).
 */
export const missingImageAltTextChecker: Checker = {
  id: 'accessibility.missing-image-alt-text',
  category: 'accessibility',
  label: 'Missing image description',
  description: 'Flags images with no alt text and no caption at all, and images relying on a caption as their only description.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'image') continue
        const img = block as ImageBlock
        const hasAlt = !!img.altText?.trim()
        const hasCaption = !!img.caption?.trim()

        if (!hasAlt && !hasCaption) {
          findings.push(
            makeFinding({
              checkerId: missingImageAltTextChecker.id,
              issueType: 'missing-image-description',
              severity: 'major',
              confidence: 0.95,
              location: { chapterId: chapter.id, blockId: img.id },
              message: 'This image has no alt text and no caption — a screen reader has nothing to announce for it.',
              whyItMatters:
                'WCAG 1.1.1 requires a text alternative for every meaningful image. Without one, a reader using a screen reader (or a browser with images disabled) gets no information about what the image shows.',
            }),
          )
        } else if (!hasAlt && hasCaption) {
          findings.push(
            makeFinding({
              checkerId: missingImageAltTextChecker.id,
              issueType: 'image-alt-text-falls-back-to-caption',
              severity: 'suggestion',
              confidence: 0.5,
              location: { chapterId: chapter.id, blockId: img.id },
              message: 'This image has a caption but no dedicated alt text, so the caption doubles as its screen-reader description.',
              whyItMatters:
                'A caption is written for a sighted reader looking at the image; a purpose-built alt text can describe what the image actually shows for a reader who can\'t see it, which is sometimes a different, more literal description than the caption.',
            }),
          )
        }
      }
    }
    return findings
  },
}

/**
 * `GalleryBlock.assetIds` (see `src/types/content.ts`) is this codebase's
 * only multi-image block, and it deliberately has no per-image alt-text
 * field yet — a documented, known limitation (see the field's own doc
 * comment: "per-image captions are out of scope this milestone"). This
 * checker surfaces that gap to the user rather than silently saying nothing
 * about galleries at all, at `suggestion` severity since it's flagging a
 * structural limitation rather than a specific authoring mistake.
 */
export const galleryMissingDescriptionsChecker: Checker = {
  id: 'accessibility.gallery-missing-descriptions',
  category: 'accessibility',
  label: 'Gallery has no per-image descriptions',
  description: 'Flags gallery blocks, which have no per-image alt-text field yet — every image in a gallery is currently undescribed to a screen reader.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'gallery') continue
        if (block.assetIds.length === 0) continue

        findings.push(
          makeFinding({
            checkerId: galleryMissingDescriptionsChecker.id,
            issueType: 'gallery-missing-descriptions',
            severity: 'suggestion',
            confidence: 0.9,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `This gallery of ${block.assetIds.length} images has no per-image descriptions — Book Studio doesn't yet support alt text on individual gallery images.`,
            whyItMatters:
              "A screen reader has no accessible description for any image in a gallery block today. Consider using individual image blocks with alt text instead if accessibility for this content matters, until per-image gallery descriptions ship.",
          }),
        )
      }
    }
    return findings
  },
}

/** `true` if `next` skips one or more heading levels below `previous` (e.g.
 * an H1 followed directly by an H3, skipping H2) — the only direction that
 * breaks WCAG 2.4.6: a book can always step *up* to a shallower level (an
 * H3 followed by an H1 for the next section is completely normal), it's
 * only skipping *down* past an intermediate level that leaves a hole in the
 * document outline a screen-reader user navigating by heading relies on. */
function skipsALevel(previous: number, next: number): boolean {
  return next > previous + 1
}

/**
 * WCAG 2.4.6 (Headings and Labels) via document-outline integrity: within
 * each chapter, a heading level shouldn't skip past an intermediate level
 * (H1 straight to H3). Tracked per chapter, reset at each chapter boundary,
 * since `paginate.ts`'s own chapter-opener H1 is a separate, theme-rendered
 * element outside `chapter.blocks` — this checker only judges the
 * `HeadingBlock`s an author actually placed in the body.
 */
export const headingHierarchySkipChecker: Checker = {
  id: 'accessibility.heading-hierarchy-skip',
  category: 'accessibility',
  label: 'Heading level skips a level',
  description: 'Flags a heading that jumps more than one level deeper than the heading before it (e.g. H1 directly to H3).',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      let previousLevel: number | null = null
      let previousHeading: HeadingBlock | null = null

      for (const block of chapter.blocks) {
        if (block.type !== 'heading') continue
        if (previousLevel !== null && skipsALevel(previousLevel, block.level)) {
          findings.push(
            makeFinding({
              checkerId: headingHierarchySkipChecker.id,
              issueType: 'heading-hierarchy-skip',
              severity: 'minor',
              confidence: 0.7,
              location: { chapterId: chapter.id, blockId: block.id },
              message: `Heading "${block.text}" (level ${block.level}) follows "${previousHeading?.text}" (level ${previousLevel}) — level ${previousLevel + 1} is skipped.`,
              whyItMatters:
                'Screen-reader users often navigate a document by jumping between headings; a skipped level creates a gap in that outline that makes the document structure confusing to navigate non-visually, even though it may look fine to a sighted reader.',
            }),
          )
        }
        previousLevel = block.level
        previousHeading = block
      }
    }
    return findings
  },
}

/**
 * A table with an empty header row has no column labels for a screen reader
 * to associate with each cell (WCAG 1.3.1) — every data cell reads out of
 * context. `header` is flagged as "empty" when every cell in it is blank,
 * not merely when the array itself is empty, since `TableBlock.header`
 * always exists with one entry per column (see `src/types/content.ts`) —
 * it's the *text* inside each header cell that authors sometimes leave
 * blank, not the array shape.
 */
export const tableMissingHeaderChecker: Checker = {
  id: 'accessibility.table-missing-header',
  category: 'accessibility',
  label: 'Table has no header row text',
  description: 'Flags tables whose header row is empty, leaving no column labels for a screen reader to announce.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'table') continue
        if (block.rows.length === 0) continue
        const hasHeaderText = block.header.some((cell) => cell.trim().length > 0)
        if (hasHeaderText) continue

        findings.push(
          makeFinding({
            checkerId: tableMissingHeaderChecker.id,
            issueType: 'table-missing-header',
            severity: 'minor',
            confidence: 0.75,
            location: { chapterId: chapter.id, blockId: block.id },
            message: 'This table has no header row text, so its columns have no labels.',
            whyItMatters:
              "A screen reader announces a data table cell-by-cell alongside its column header so the reader knows what each value means; with no header text, every cell is read without that context.",
          }),
        )
      }
    }
    return findings
  },
}

export const ACCESSIBILITY_CHECKERS: Checker[] = [
  missingImageAltTextChecker,
  galleryMissingDescriptionsChecker,
  headingHierarchySkipChecker,
  tableMissingHeaderChecker,
]
