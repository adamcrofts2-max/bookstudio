/**
 * Virtual Editor — Developmental checkers.
 *
 * Book-level structural/pacing signals — not sentence-level prose quality
 * (that's `readability.ts`) and not page-level layout (`layout.ts`). Named
 * "developmental" after the publishing-industry term for the editing pass
 * that looks at structure, pacing and organisation before any line editing
 * happens. Like `layout.ts`'s image-density checker, chapter-length
 * comparison uses the book's own average as the yardstick rather than an
 * invented universal "correct" chapter length — a thriller and a literary
 * novel can both be well-paced at very different chapter lengths, but a
 * single chapter wildly out of step with the rest of *this* book is worth a
 * second look either way.
 *
 * `developmental` doesn't get its own dashboard score tile (see
 * `scoring.ts`'s `SCORE_TILES` comment) — its findings still fully
 * contribute to the overall score and surface in the report's issue list
 * under their own category label.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'developmental',
    source: 'deterministic',
    ...partial,
  }
}

const MIN_CHAPTERS_FOR_LENGTH_COMPARISON = 3
const SHORT_OUTLIER_RATIO = 0.25
const LONG_OUTLIER_RATIO = 2.5

/**
 * Flags a chapter whose word count is a real outlier against the book's own
 * average — under a quarter of the average, or more than 2.5x it. Requires
 * at least 3 chapters (a 1- or 2-chapter book has no meaningful "average" to
 * compare against). `suggestion` severity: chapter-length variance is often
 * a deliberate pacing choice (a short, punchy chapter before a climax is a
 * real technique), not a mistake — this is a "worth a second look" signal,
 * same framing as `layout.ts`'s `imageDensityImbalanceChecker`.
 */
export const chapterLengthOutlierChecker: Checker = {
  id: 'developmental.chapter-length-outlier',
  category: 'developmental',
  label: 'Chapter length outlier',
  description: "Flags a chapter whose word count is a real outlier against the book's own average.",
  run(ctx: CheckerContext): Finding[] {
    const chapters = ctx.manuscript.chapters
    if (chapters.length < MIN_CHAPTERS_FOR_LENGTH_COMPARISON) return []

    const counts = chapters.map((chapter) => ({
      chapter,
      words: chapter.blocks.reduce((sum, block) => sum + blockPlainText(block).split(/\s+/).filter(Boolean).length, 0),
    }))
    const totalWords = counts.reduce((sum, c) => sum + c.words, 0)
    const bookAverage = totalWords / counts.length
    if (bookAverage <= 0) return []

    const findings: Finding[] = []
    for (const { chapter, words } of counts) {
      if (words > 0 && words < bookAverage * SHORT_OUTLIER_RATIO) {
        findings.push(
          makeFinding({
            checkerId: chapterLengthOutlierChecker.id,
            issueType: 'chapter-length-short-outlier',
            severity: 'suggestion',
            confidence: 0.5,
            location: { chapterId: chapter.id },
            message: `"${chapter.title}" is ${words} words, well under the book's average of ${Math.round(bookAverage)} words per chapter.`,
            whyItMatters:
              'A dramatically shorter chapter can be a deliberate pacing choice (a short chapter before a climax is a real technique), but it can also signal a chapter that\'s missing content or was split unintentionally — worth a deliberate check either way.',
          }),
        )
      } else if (words > bookAverage * LONG_OUTLIER_RATIO) {
        findings.push(
          makeFinding({
            checkerId: chapterLengthOutlierChecker.id,
            issueType: 'chapter-length-long-outlier',
            severity: 'suggestion',
            confidence: 0.5,
            location: { chapterId: chapter.id },
            message: `"${chapter.title}" is ${words} words, well over the book's average of ${Math.round(bookAverage)} words per chapter.`,
            whyItMatters:
              'A dramatically longer chapter than the rest of the book can read as unbalanced pacing, or may be a candidate for splitting into two chapters — worth a second look, though some books do deliberately vary chapter length this much.',
          }),
        )
      }
    }
    return findings
  },
}

const PLACEHOLDER_TITLE_PATTERN = /^(untitled|chapter\s*\d*|new chapter|\s*)$/i

/**
 * Flags a chapter whose title is empty or looks like an unedited
 * placeholder ("Untitled", "Chapter", "New Chapter", or blank) — a real
 * authoring gap distinct from `publishingStandards.ts`'s
 * `emptyChapterOpenerChecker` (which flags a chapter with no *body*
 * content; this flags the *title* itself). A book can have both, either,
 * or neither problem independently, so these stay two separate checkers
 * rather than one conflated "chapter looks incomplete" check.
 */
export const placeholderChapterTitleChecker: Checker = {
  id: 'developmental.placeholder-chapter-title',
  category: 'developmental',
  label: 'Placeholder or missing chapter title',
  description: 'Flags a chapter whose title is empty or looks like an unedited placeholder (e.g. "Untitled", "Chapter").',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      if (!PLACEHOLDER_TITLE_PATTERN.test(chapter.title.trim())) continue

      findings.push(
        makeFinding({
          checkerId: placeholderChapterTitleChecker.id,
          issueType: 'placeholder-chapter-title',
          severity: 'major',
          confidence: 0.75,
          location: { chapterId: chapter.id },
          message: chapter.title.trim()
            ? `This chapter's title, "${chapter.title.trim()}", looks like an unedited placeholder rather than a real chapter title.`
            : 'This chapter has no title at all.',
          whyItMatters:
            'A placeholder or missing chapter title is one of the more visible signs of an unfinished manuscript — it appears in the table of contents and on the chapter\'s own opening page exactly as written.',
        }),
      )
    }
    return findings
  },
}

export const DEVELOPMENTAL_CHECKERS: Checker[] = [chapterLengthOutlierChecker, placeholderChapterTitleChecker]
