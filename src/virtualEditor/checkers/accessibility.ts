/**
 * Virtual Editor — Accessibility checkers.
 *
 * Deterministic checks against the manuscript's own structure and content:
 * missing image descriptions, heading-level skips, tables without header
 * rows — real WCAG success criteria (1.1.1 Non-text Content, 1.3.1 Info and
 * Relationships, 2.4.6 Headings and Labels) checkable purely from
 * `Manuscript` content. Plus one checker below that does real colour-
 * contrast math (WCAG 1.4.3) against Cover/Back Cover's free-form
 * `CoverElement`s — the one piece of "real rendered/theme data" this file's
 * earlier doc comment used to say was out of scope; it's in scope now that
 * `CoverElement` colours are concrete, explicit data rather than something
 * needing a live DOM measurement. Manuscript body-text contrast (theme
 * colours against the page background) is a separate, larger piece of work
 * still — see `docs/ROADMAP.md` Phase J.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { HeadingBlock, ImageBlock } from '@/types/content'
import type { CoverElement } from '@/types/structuralPage'
import { generateId } from '@/utils/id'
import { resolveTheme } from '@/theme/presets'
import { tintHex } from '@/structuralPages/colorUtils'

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

// --- Cover element contrast (WCAG 1.4.3) ----------------------------------

/** `#rgb`/`#rrggbb` → 0-255 channels. Same parsing convention as
 * `colorUtils.ts`'s `tintHex`, extended to accept the 3-digit shorthand
 * since `CoverElement` colour fields are free-typed hex strings an author
 * could enter either way via the colour picker. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0]
}

/** WCAG relative luminance — the standard formula (sRGB → linear light,
 * then the 0.2126/0.7152/0.0722 perceptual weighting). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  }
  const [rl, gl, bl] = [linear(r), linear(g), linear(b)]
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** WCAG contrast ratio between two hex colours — `(L1+0.05)/(L2+0.05)` with
 * the lighter colour on top, so the result is always `>= 1`. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG's "large text" carve-out gets a looser 3:1 minimum instead of 4.5:1
 * — 18pt (24px) regular weight, or 14pt (≈18.66px) at bold (>=700). */
function isLargeText(fontSizePx: number, weight: number | undefined): boolean {
  return (weight ?? 400) >= 700 ? fontSizePx >= 18.66 : fontSizePx >= 24
}

function truncateForMessage(text: string): string {
  const trimmed = text.trim() || '(empty)'
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed
}

/** Finds the nearest fully-opaque `rect`/`ellipse`/`badge` sitting directly
 * beneath `target` — lower `zIndex`, `target`'s own centre point falling
 * inside its box, closest `zIndex` first. A translucent candidate (element
 * `opacity` or shape `fillOpacity` below 0.95) is skipped rather than
 * colour-blended — compositing an arbitrary stack of translucent layers is
 * real extra complexity for a case that's rare in practice (most cover
 * shapes are opaque fills); skipping it means this checker stays honest
 * (falls through to "unverifiable" below) rather than reporting a
 * confidently wrong number. */
function findSolidBackgroundBelow(elements: CoverElement[], target: CoverElement): string | undefined {
  const centerX = target.x + target.width / 2
  const centerY = target.y + target.height / 2
  const candidates = elements
    .filter((el) => el.id !== target.id && el.zIndex < target.zIndex)
    .filter((el) => centerX >= el.x && centerX <= el.x + el.width && centerY >= el.y && centerY <= el.y + el.height)
    .sort((a, b) => b.zIndex - a.zIndex)

  for (const el of candidates) {
    if ((el.opacity ?? 1) < 0.95) continue
    if ((el.kind === 'rect' || el.kind === 'ellipse') && el.fill && (el.fillOpacity ?? 1) >= 0.95) return el.fill
    if (el.kind === 'badge') return el.backgroundColor ?? '#dc2626'
  }
  return undefined
}

/**
 * WCAG 1.4.3 (Contrast Minimum) for Cover/Back Cover's free-form text and
 * badge elements (`CoverElement`, `docs/COVER_CANVAS_PLAN.md`) — the one
 * place in this codebase where colour is concrete, explicit per-element
 * data rather than something needing a live render to know. Text sitting
 * directly on a background photo, or an element that's itself translucent,
 * is flagged as unverifiable at low confidence rather than skipped
 * outright — the same "surface the gap, don't stay silent" idiom
 * `galleryMissingDescriptionsChecker` above already uses (a `suggestion`
 * finding with reduced `confidence` in place of a dedicated "info" severity
 * tier, which doesn't exist in this codebase's `Severity` type). Title/
 * subtitle/author/blurb/author-bio — Cover's *other* text fields — aren't
 * covered here: their colour has a more involved automatic-fallback rule
 * (`resolveCoverColor`) this checker doesn't attempt to replicate; see
 * `docs/ROADMAP.md` Phase E for that as a follow-up.
 */
export const coverElementContrastChecker: Checker = {
  id: 'accessibility.cover-element-contrast',
  category: 'accessibility',
  label: 'Cover element text contrast',
  description:
    "Flags Cover/Back Cover text and badge elements whose text colour falls short of WCAG's 4.5:1 (normal text) / 3:1 (large text) contrast minimum against a computable background.",
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = ctx.manuscript.chapters[0]?.id
    if (!chapterId) return []
    const theme = ctx.project ? resolveTheme(ctx.project.settings.themeId) : undefined

    const findings: Finding[] = []
    for (const page of ctx.structuralPages) {
      if (page.type !== 'cover' && page.type !== 'back-cover') continue
      const elements = page.content.elements ?? []
      if (elements.length === 0) continue

      const hasPhoto = !!page.content.imageAssetId
      // Fixed tint amounts `cover.tsx`/`backCover.tsx` actually paint when
      // no image is set — see those files' own background `style`.
      const flatBackgroundHex = !hasPhoto && theme ? tintHex(theme.page.accent, page.type === 'cover' ? 0.85 : 0.92) : undefined
      const pageLabel = page.type === 'cover' ? 'Cover' : 'Back Cover'

      for (const el of elements) {
        if (el.kind !== 'text' && el.kind !== 'badge') continue
        const label = el.kind === 'badge' ? 'badge' : 'text'

        if ((el.opacity ?? 1) < 0.95) {
          findings.push(
            makeFinding({
              checkerId: coverElementContrastChecker.id,
              issueType: 'cover-element-contrast-unverifiable',
              severity: 'suggestion',
              confidence: 0.3,
              location: { chapterId },
              message: `${pageLabel} ${label} "${truncateForMessage(el.text)}" is partly transparent, so its contrast against the page can't be checked automatically — verify it visually.`,
              whyItMatters:
                'A translucent element blends with whatever sits behind it, which this checker would need full layer compositing to compute accurately; reporting a number here risks being confidently wrong instead of honestly unverifiable.',
            }),
          )
          continue
        }

        const textColor = el.kind === 'text' ? (el.color ?? '#ffffff') : (el.textColor ?? '#ffffff')
        const fontSize = el.fontSize ?? (el.kind === 'text' ? 24 : 15)
        const weight = el.kind === 'text' ? el.weight : 600
        const backgroundHex = el.kind === 'badge' ? (el.backgroundColor ?? '#dc2626') : (findSolidBackgroundBelow(elements, el) ?? flatBackgroundHex)

        if (!backgroundHex) {
          findings.push(
            makeFinding({
              checkerId: coverElementContrastChecker.id,
              issueType: 'cover-element-contrast-unverifiable',
              severity: 'suggestion',
              confidence: 0.3,
              location: { chapterId },
              message: `${pageLabel} text "${truncateForMessage(el.text)}" sits over ${hasPhoto ? 'the cover photo' : 'a background this checker can\'t resolve to a flat colour'} — contrast can't be measured automatically; verify it visually.`,
              whyItMatters:
                "Text over a photo has no single background colour to measure against — different parts of the image may be light or dark. Check readability against the actual busiest/lightest part of the image it overlaps.",
            }),
          )
          continue
        }

        const ratio = contrastRatio(textColor, backgroundHex)
        const threshold = isLargeText(fontSize, weight) ? 3 : 4.5
        if (ratio >= threshold) continue

        findings.push(
          makeFinding({
            checkerId: coverElementContrastChecker.id,
            issueType: 'cover-element-low-contrast',
            severity: 'major',
            confidence: 0.9,
            location: { chapterId },
            message: `${pageLabel} ${label} "${truncateForMessage(el.text)}" has a contrast ratio of ${ratio.toFixed(2)}:1 against its background — below WCAG's ${threshold}:1 minimum for ${isLargeText(fontSize, weight) ? 'large' : 'normal-size'} text.`,
            whyItMatters:
              "Low-contrast text is hard or impossible to read for anyone with low vision, and fails WCAG 1.4.3 (Contrast Minimum) — a real, checkable publishing-accessibility requirement, not just a style preference.",
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
  coverElementContrastChecker,
]
