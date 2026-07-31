/**
 * Virtual Editor — Field-guide checkers.
 *
 * "Field-guide" per the product taxonomy (`docs/VIRTUAL_EDITOR.md`) means
 * genre-specific structural conventions — what a nonfiction reference book
 * is expected to include that a novel isn't, and vice versa — rather than
 * anything true of every book regardless of genre (that's every other
 * category). Both checkers here key off `Project.category` (see
 * `src/types/project.ts`), so both need `ctx.project` and both are silent
 * without it, and both are silent for genres they have nothing specific to
 * say about — this is deliberately a small, honest start (2 checkers, 2
 * genre clusters) rather than a shallow rule for every one of the 8
 * `ProjectCategory` values, most of which don't have a crisp, checkable
 * structural convention this codebase can verify today.
 *
 * `fieldGuide` doesn't get its own dashboard score tile (see `scoring.ts`'s
 * `SCORE_TILES` comment) — its findings still fully contribute to the
 * overall score and surface in the report's issue list under their own
 * category label.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { ProjectCategory } from '@/types/project'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'fieldGuide',
    source: 'deterministic',
    ...partial,
  }
}

const REFERENCE_APPARATUS_CATEGORIES: ProjectCategory[] = ['nonfiction', 'educational', 'scientific']

/**
 * Nonfiction/educational/scientific books conventionally include at least
 * one of a Glossary, Index or Bibliography — the reference apparatus a
 * reader expects to be able to look something back up in. A novel or
 * children's book has no such convention, so this only fires for the three
 * categories above. `suggestion` severity: a short nonfiction piece can
 * legitimately have none of these, so this is a prompt to consider it, not
 * an assertion something is missing.
 */
export const nonfictionMissingReferenceApparatusChecker: Checker = {
  id: 'fieldGuide.nonfiction-missing-reference-apparatus',
  category: 'fieldGuide',
  label: 'No glossary, index, or bibliography',
  description: 'For nonfiction/educational/scientific books, flags a project with none of Glossary, Index or Bibliography.',
  isApplicable: (ctx) => !!ctx.project && !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project || !ctx.structuralPages) return []
    if (!REFERENCE_APPARATUS_CATEGORIES.includes(ctx.project.category)) return []

    const hasApparatus = ctx.structuralPages.some(
      (p) => p.type === 'glossary' || p.type === 'index' || p.type === 'bibliography',
    )
    if (hasApparatus) return []

    const chapterId = ctx.manuscript.chapters[0]?.id
    if (!chapterId) return []

    return [
      makeFinding({
        checkerId: nonfictionMissingReferenceApparatusChecker.id,
        issueType: 'nonfiction-missing-reference-apparatus',
        severity: 'suggestion',
        confidence: 0.5,
        location: { chapterId },
        message: `This ${ctx.project.category} book has no Glossary, Index, or Bibliography page.`,
        whyItMatters:
          'Readers of nonfiction, educational, and scientific books conventionally expect at least one reference apparatus to look up a term, topic, or source — its absence is worth a deliberate decision rather than an oversight.',
      }),
    ]
  },
}

const NUMBERED_CHAPTER_PATTERN = /^(chapter|part|book)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[ivxlcdm]+)\b/i
const MIN_CHAPTERS_FOR_NUMBERING_COMPARISON = 3

/**
 * Fiction and children's books conventionally number chapters consistently
 * — either every chapter title starts with "Chapter N" (or "Part"/"Book" +
 * a number/word/roman numeral), or none of them do (a purely
 * name-based chapter title convention, e.g. "The Storm", "Ashes"). A book
 * that mixes both conventions (some chapters numbered, some not) reads as
 * inconsistent front matter — this mirrors `consistency.ts`'s general
 * "flag inconsistency, not any one choice" philosophy, applied to chapter
 * titling instead of terminology. Requires at least 3 chapters (the same
 * "not enough data" floor as `chapterLengthOutlierChecker`) and that at
 * least one chapter follows each convention — a book that's 100% one way or
 * the other is, by definition, consistent.
 */
export const inconsistentChapterNumberingChecker: Checker = {
  id: 'fieldGuide.inconsistent-chapter-numbering',
  category: 'fieldGuide',
  label: 'Inconsistent chapter-title numbering',
  description: 'For novels/children\'s books, flags a mix of numbered ("Chapter One") and unnumbered chapter titles.',
  isApplicable: (ctx) => !!ctx.project,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project) return []
    if (ctx.project.category !== 'novel' && ctx.project.category !== 'childrens') return []

    const chapters = ctx.manuscript.chapters
    if (chapters.length < MIN_CHAPTERS_FOR_NUMBERING_COMPARISON) return []

    const numbered = chapters.filter((c) => NUMBERED_CHAPTER_PATTERN.test(c.title.trim()))
    const unnumbered = chapters.filter((c) => !NUMBERED_CHAPTER_PATTERN.test(c.title.trim()))
    if (numbered.length === 0 || unnumbered.length === 0) return []

    // Attribute the finding to whichever group is the minority — that's the
    // set of chapters that broke from the book's dominant convention.
    const minorityGroup = numbered.length <= unnumbered.length ? numbered : unnumbered
    const conventionName = numbered.length > unnumbered.length ? 'numbered ("Chapter One")' : 'unnumbered (name-only)'

    return minorityGroup.map((chapter) =>
      makeFinding({
        checkerId: inconsistentChapterNumberingChecker.id,
        issueType: 'inconsistent-chapter-numbering',
        severity: 'suggestion',
        confidence: 0.5,
        location: { chapterId: chapter.id },
        message: `Most chapters in this book use ${conventionName} titles, but "${chapter.title}" doesn't follow that convention.`,
        whyItMatters:
          'A book that mixes numbered and unnumbered chapter titles reads as inconsistent front matter — most novels and children\'s books settle on one convention throughout.',
      }),
    )
  },
}

export const FIELD_GUIDE_CHECKERS: Checker[] = [
  nonfictionMissingReferenceApparatusChecker,
  inconsistentChapterNumberingChecker,
]
