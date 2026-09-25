/**
 * Virtual Editor — the parts a finished book has.
 *
 * Every other checker in this directory reads content and judges it. That
 * means a book with almost nothing in it passes every one of them: a
 * two-paragraph manuscript with an untitled cover, no author, no copyright
 * page and no ISBN returned **Print Readiness 100, Publishing Quality 100
 * and an overall 99** (found Phase 157, fixed Phase 175). Nothing was
 * wrong, because there was nothing to be wrong.
 *
 * `docs/ROADMAP.md` filed that as "a design question, not a patch":
 * *should absence be a finding?* The answer here is yes, but only for
 * things whose absence is a fact rather than an opinion. Every check below
 * names a specific missing artefact that a printed book is expected to
 * carry — a cover, a title page, a copyright page, an author's name. None
 * of them says "this book is too short" or "this needs more work", because
 * those are judgements the deterministic layer has no business making and
 * the AI reviewer (Phase F) exists to make.
 *
 * The other half of the honesty problem — a confident 99 out of a 27-word
 * manuscript — is a presentation question, answered in
 * `VirtualEditorWorkspace.tsx` by saying what the score was computed from.
 */

import type { Checker, CheckerContext, Finding, Severity } from '@/virtualEditor/types'
import type { IssueCategory } from '@/virtualEditor/types'
import type { StructuralPage } from '@/types/structuralPage'
import { generateId } from '@/utils/id'

/** Absence is not a matter of degree: the page is there or it is not. */
const CERTAIN = 1

function makeFinding(
  category: IssueCategory,
  issueType: string,
  severity: Severity,
  message: string,
  whyItMatters: string,
  chapterId: string,
): Finding {
  return {
    id: generateId('finding'),
    checkerId: 'completeness',
    category,
    issueType,
    severity,
    confidence: CERTAIN,
    // These findings belong to the book, not to a paragraph. The first
    // chapter is the only anchor the report's "jump to it" affordance can
    // use; the message says plainly what is actually missing.
    location: { chapterId },
    message,
    whyItMatters,
    source: 'deterministic',
  }
}

const has = (pages: StructuralPage[], type: string) => pages.some((p) => p.type === type)

function fieldOf(pages: StructuralPage[], type: string, key: string): string {
  const page = pages.find((p) => p.type === type)
  const value = (page?.content as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The front and back matter a printed book is expected to carry.
 *
 * Deliberately not "every structural page type exists" — a book needs no
 * dedication, foreword or index to be finished, and demanding one would be
 * the checker inventing a house style. These four are the ones a printer,
 * a bookshop or a reader would notice missing.
 */
export const bookPartsChecker: Checker = {
  id: 'completeness.book-parts',
  category: 'print',
  label: 'Book parts',
  description: 'The cover, title page and copyright page a finished book carries.',
  isApplicable: (ctx) => !!ctx.structuralPages && !!ctx.manuscript.chapters.length,
  run: (ctx: CheckerContext): Finding[] => {
    const pages = ctx.structuralPages ?? []
    const chapterId = ctx.manuscript.chapters[0]?.id ?? ''
    const findings: Finding[] = []

    if (!has(pages, 'cover')) {
      findings.push(
        makeFinding(
          'commercial',
          'missing-cover',
          'major',
          'This book has no cover.',
          'A cover is the one page every reader sees first, and print-on-demand services will not accept a book without one. Add it from Structure → Front matter.',
          chapterId,
        ),
      )
    }

    if (!has(pages, 'title-page')) {
      findings.push(
        makeFinding(
          'print',
          'missing-title-page',
          'major',
          'This book has no title page.',
          'The title page carries the book’s full title, author and imprint, and is the first printed page of every professionally produced book.',
          chapterId,
        ),
      )
    }

    if (!has(pages, 'copyright')) {
      findings.push(
        makeFinding(
          'print',
          'missing-copyright-page',
          'major',
          'This book has no copyright page.',
          'The copyright page is where the edition, rights, publisher and ISBN are recorded. Its absence is the quickest way a printed book reads as self-published in the unflattering sense.',
          chapterId,
        ),
      )
    }

    if (has(pages, 'cover') && !has(pages, 'back-cover')) {
      findings.push(
        makeFinding(
          'commercial',
          'missing-back-cover',
          'minor',
          'This book has a cover but no back cover.',
          'The back cover carries the blurb a browsing reader actually reads before buying. A paperback needs one; an e-book edition can reasonably skip it.',
          chapterId,
        ),
      )
    }

    return findings
  },
}

/**
 * Fields that exist but were never filled in.
 *
 * Separate from the checker above because "the page is missing" and "the
 * page is blank" are different problems with different fixes, and a report
 * that says both at once is more useful than one that says "front matter
 * incomplete".
 */
export const bookDetailsChecker: Checker = {
  id: 'completeness.book-details',
  category: 'commercial',
  label: 'Book details',
  description: 'The title, author and ISBN a book is identified by.',
  isApplicable: (ctx) => !!ctx.structuralPages && !!ctx.manuscript.chapters.length,
  run: (ctx: CheckerContext): Finding[] => {
    const pages = ctx.structuralPages ?? []
    const chapterId = ctx.manuscript.chapters[0]?.id ?? ''
    const findings: Finding[] = []

    // The author's name, wherever it is allowed to live. Absent from both
    // places means the book genuinely does not say who wrote it.
    const author = fieldOf(pages, 'title-page', 'author') || fieldOf(pages, 'cover', 'author')
    if ((has(pages, 'cover') || has(pages, 'title-page')) && !author) {
      findings.push(
        makeFinding(
          'commercial',
          'missing-author',
          'major',
          'The book does not name its author.',
          'Nothing on the cover or title page says who wrote this. Booksellers, libraries and readers all index by author, and an unattributed book cannot be catalogued.',
          chapterId,
        ),
      )
    }

    // A cover falls back to the project's name when its own title is empty
    // (Phase 157), which is a good default and a bad thing to ship: the
    // project's name is whatever was typed into "What's the idea?".
    if (has(pages, 'cover') && !fieldOf(pages, 'cover', 'title')) {
      findings.push(
        makeFinding(
          'commercial',
          'cover-title-is-a-fallback',
          'minor',
          'The cover is showing the project’s name rather than a title of its own.',
          'Covers fall back to the project name so a new book is never blank, but that name is whatever was typed when the project was created. Set the real title on the cover.',
          chapterId,
        ),
      )
    }

    if (has(pages, 'copyright') && !fieldOf(pages, 'copyright', 'isbn')) {
      findings.push(
        makeFinding(
          'print',
          'missing-isbn',
          'suggestion',
          'No ISBN is recorded on the copyright page.',
          'An ISBN is how a book is ordered and tracked by every shop and library. Not every book needs one — a private edition or a purely digital release can go without — so this is a prompt, not a fault.',
          chapterId,
        ),
      )
    }

    return findings
  },
}

export const completenessCheckers: Checker[] = [bookPartsChecker, bookDetailsChecker]
