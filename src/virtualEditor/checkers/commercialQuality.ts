/**
 * Virtual Editor — Commercial Quality checkers.
 *
 * "Would a reader browsing a bookstore or an Amazon listing recognise this
 * as a finished, professionally published book?" — checked here purely
 * through front-/back-matter completeness (`ctx.structuralPages`), since
 * that's the concrete, structural half of "market readiness" this codebase
 * can check deterministically. The subjective half — cover design quality,
 * blurb persuasiveness — stays out of scope for a deterministic checker and
 * is exactly the kind of judgement call `docs/VIRTUAL_EDITOR.md` earmarks
 * for a future real `AiReviewer`, not something faked here with a heuristic
 * that can't actually judge writing quality.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'commercial',
    source: 'deterministic',
    ...partial,
  }
}

/** Every commercial-quality checker below needs a chapter to anchor its
 * finding to (`FindingLocation.chapterId` is required, even for a book-wide
 * finding with no single block — see `fleschReadabilityChecker`'s and
 * `publishingStandards.ts`'s own precedent for this same anchoring
 * pattern). Returns `undefined` if the manuscript has no chapters at all,
 * in which case these checkers have nothing to attach a finding to and stay
 * silent rather than fabricate a location. */
function anchorChapterId(ctx: CheckerContext): string | undefined {
  return ctx.manuscript.chapters[0]?.id
}

/**
 * A book with no copyright page (or one with no text in it) is missing a
 * legal/professional convention every commercially published book includes
 * — copyright notice, edition, printing information. `major` severity: this
 * isn't a style nit, it's a required page for a book to look and function
 * like a finished commercial product.
 */
export const missingCopyrightPageChecker: Checker = {
  id: 'commercial.missing-copyright-page',
  category: 'commercial',
  label: 'Missing or empty copyright page',
  description: 'Flags a project with no Copyright structural page, or one with no text.',
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = anchorChapterId(ctx)
    if (!chapterId) return []

    const copyright = ctx.structuralPages.find((p) => p.type === 'copyright')
    if (copyright && copyright.content.text?.trim()) return []

    return [
      makeFinding({
        checkerId: missingCopyrightPageChecker.id,
        issueType: 'missing-copyright-page',
        severity: 'major',
        confidence: 0.85,
        location: { chapterId },
        message: copyright
          ? 'This book has a Copyright page, but it has no text in it yet.'
          : 'This book has no Copyright page at all.',
        whyItMatters:
          'Every commercially published book includes a copyright page — notice of copyright, edition information, and (for print) printer details. Its absence is one of the fastest ways a book reads as self-published-and-unfinished rather than professionally produced.',
      }),
    ]
  },
}

/**
 * A missing or empty ISBN page is a softer signal than a missing copyright
 * page — some self-published authors deliberately use a platform-assigned
 * free ISBN (e.g. KDP's own) instead of purchasing one, so this is `minor`,
 * not `major`, and the message is worded to acknowledge that possibility
 * rather than assert the book is broken.
 */
export const missingIsbnChecker: Checker = {
  id: 'commercial.missing-isbn',
  category: 'commercial',
  label: 'Missing ISBN',
  description: 'Flags a project with no ISBN page, or one with no ISBN entered.',
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = anchorChapterId(ctx)
    if (!chapterId) return []

    const isbnPage = ctx.structuralPages.find((p) => p.type === 'isbn-page')
    if (isbnPage?.content.isbn?.trim()) return []

    return [
      makeFinding({
        checkerId: missingIsbnChecker.id,
        issueType: 'missing-isbn',
        severity: 'minor',
        confidence: 0.55,
        location: { chapterId },
        message: isbnPage
          ? 'This book has an ISBN page, but no ISBN has been entered yet.'
          : 'This book has no ISBN page or ISBN entered.',
        whyItMatters:
          "An ISBN is required for wide retail distribution (bookstores, most library systems) — not required if you're only using a print-on-demand platform's own free assigned number, but worth a deliberate decision rather than an oversight.",
      }),
    ]
  },
}

/**
 * Back-cover copy (the blurb) is one of the most sales-critical pieces of
 * text in a commercially published book — the thing a browsing reader
 * actually reads before deciding to buy. A missing or empty Back Cover page
 * is flagged `major`.
 */
export const missingBackCoverBlurbChecker: Checker = {
  id: 'commercial.missing-back-cover-blurb',
  category: 'commercial',
  label: 'Missing back-cover blurb',
  description: 'Flags a project with no Back Cover page, or one with no blurb text.',
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = anchorChapterId(ctx)
    if (!chapterId) return []

    const backCover = ctx.structuralPages.find((p) => p.type === 'back-cover')
    if (backCover?.content.blurb?.trim()) return []

    return [
      makeFinding({
        checkerId: missingBackCoverBlurbChecker.id,
        issueType: 'missing-back-cover-blurb',
        severity: 'major',
        confidence: 0.8,
        location: { chapterId },
        message: backCover
          ? 'This book has a Back Cover page, but no blurb text has been written yet.'
          : 'This book has no Back Cover page or blurb.',
        whyItMatters:
          "The back-cover blurb is often the single piece of copy that convinces a browsing reader to buy — a book without one reads as unfinished on the shelf or in an online listing's back-cover preview.",
      }),
    ]
  },
}

/**
 * A Title Page is the conventional first typeset page inside the book
 * (distinct from the Cover, which is the outward-facing jacket) — its
 * absence is a structural gap in what a finished book normally includes.
 */
export const missingTitlePageChecker: Checker = {
  id: 'commercial.missing-title-page',
  category: 'commercial',
  label: 'Missing title page',
  description: 'Flags a project with no Title Page structural page.',
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = anchorChapterId(ctx)
    if (!chapterId) return []
    if (ctx.structuralPages.some((p) => p.type === 'title-page')) return []

    return [
      makeFinding({
        checkerId: missingTitlePageChecker.id,
        issueType: 'missing-title-page',
        severity: 'minor',
        confidence: 0.7,
        location: { chapterId },
        message: 'This book has no Title Page.',
        whyItMatters:
          "A Title Page (title, subtitle, author — set on its own page inside the book, ahead of the copyright page) is a near-universal convention in professionally published books, distinct from the outward-facing Cover.",
      }),
    ]
  },
}

/**
 * An author bio helps a reader connect with the author and is a small but
 * real piece of marketing collateral — checked across *either* of the two
 * places this codebase lets an author provide one (the dedicated About the
 * Author page, or the shorter `authorBio` field on the Back Cover), so a
 * book that has it in either place is never falsely flagged. `suggestion`
 * severity: unlike copyright/ISBN/blurb, this is good practice rather than
 * a near-mandatory convention.
 */
export const missingAuthorBioChecker: Checker = {
  id: 'commercial.missing-author-bio',
  category: 'commercial',
  label: 'No author bio anywhere in the book',
  description: 'Flags a project with neither an About the Author page nor a back-cover author bio.',
  isApplicable: (ctx) => !!ctx.structuralPages,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.structuralPages) return []
    const chapterId = anchorChapterId(ctx)
    if (!chapterId) return []

    const aboutPage = ctx.structuralPages.find((p) => p.type === 'about-the-author')
    const backCover = ctx.structuralPages.find((p) => p.type === 'back-cover')
    const hasAboutPageText = !!aboutPage?.content.text?.trim()
    const hasBackCoverBio = !!backCover?.content.authorBio?.trim()
    if (hasAboutPageText || hasBackCoverBio) return []

    return [
      makeFinding({
        checkerId: missingAuthorBioChecker.id,
        issueType: 'missing-author-bio',
        severity: 'suggestion',
        confidence: 0.5,
        location: { chapterId },
        message: 'This book has no author bio — not on an About the Author page, and not as a short bio on the Back Cover.',
        whyItMatters:
          'A short author bio helps a reader connect with who wrote the book, and is standard in most commercially published titles, whether as its own page or a few lines on the back cover.',
      }),
    ]
  },
}

export const COMMERCIAL_QUALITY_CHECKERS: Checker[] = [
  missingCopyrightPageChecker,
  missingIsbnChecker,
  missingBackCoverBlurbChecker,
  missingTitlePageChecker,
  missingAuthorBioChecker,
]
