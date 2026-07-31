/**
 * Virtual Editor — Copy editing checkers.
 *
 * Deterministic, synchronous, pure — same contract as every other checker
 * in this directory. Unlike proofreading/consistency/readability, every
 * checker registered here today is **Style-Guide-dependent**: it only ever
 * produces findings when the project has explicitly opted into a
 * preference via `ctx.styleGuide`. With no preference set, these checkers
 * are silent — there's no "default correct" capitalisation convention to
 * enforce on a project that hasn't said which one it wants, unlike
 * `quoteStyleConsistencyChecker`'s book-wide-mixing fallback in
 * `proofreading.ts`.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'copyEditing',
    source: 'deterministic',
    ...partial,
  }
}

// Minor words that Title Case conventionally lowercases unless they open or
// close the heading (articles, coordinating conjunctions, and short
// prepositions). Not an exhaustive style-guide-grade list — a documented,
// honest heuristic, same spirit as `consistency.ts`'s `LEADING_STOPWORDS`.
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'nor', 'of', 'on', 'onto', 'or', 'over', 'per', 'the', 'to', 'up', 'via',
  'with', 'under',
])

/** First alphabetic character in `word`, or `undefined` if it has none
 * (pure punctuation/digits) — such words carry no capitalisation signal and
 * are skipped rather than judged. */
function firstAlphaChar(word: string): string | undefined {
  return word.match(/[A-Za-z]/)?.[0]
}

/** `true`/`false` for "is the word's first letter uppercase", or `null` if
 * the word has no letters to judge at all. */
function isUpperFirst(word: string): boolean | null {
  const ch = firstAlphaChar(word)
  if (!ch) return null
  return ch === ch.toUpperCase()
}

/** Strips everything but letters and lowercases, for matching against
 * `MINOR_WORDS`/acronym checks regardless of surrounding punctuation
 * (e.g. "Garden:" or "(Forest)"). */
function normaliseWord(word: string): string {
  return word.replace(/[^A-Za-z]/g, '').toLowerCase()
}

/**
 * Title Case heuristic: every word should start with a capital letter
 * *unless* it's a minor word (see `MINOR_WORDS`) that isn't the first or
 * last word of the heading. Words with no letters (numbers, punctuation
 * only) are skipped rather than judged either way.
 *
 * Known limitation, documented not hidden: this has no dictionary of
 * proper nouns or a real part-of-speech tagger, so an unusual capitalised
 * word choice or a minor word used unconventionally could still slip
 * through or false-positive in an edge case. It's directionally useful,
 * not linguistically perfect — matching every other heuristic checker's
 * honesty in this codebase.
 */
function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const upper = isUpperFirst(word)
    if (upper === null) continue

    const isEdge = i === 0 || i === words.length - 1
    const isMinor = MINOR_WORDS.has(normaliseWord(word))
    const expectUpper = isEdge || !isMinor
    if (upper !== expectUpper) return false
  }
  return true
}

// The pronoun "I" is always capitalised regardless of position — excluded
// from the "only the first word may be capitalised" rule below so it isn't
// treated as a false violation of Sentence case.
const SENTENCE_CASE_EXCEPTIONS = new Set(['i'])

/**
 * Sentence case heuristic: only the first word (plus proper nouns) should
 * be capitalised. Since this checker has no dictionary of real proper
 * nouns, it approximates: the first word must be capitalised, and every
 * later word is allowed to be capitalised only if it's a whole-word
 * acronym (all-caps, 2+ letters, e.g. "NASA", "DNA" — assumed deliberate)
 * or the pronoun "I". Anything else capitalised after the first word is
 * flagged.
 *
 * Known, honestly-documented limitation: a genuine proper noun in a later
 * position (e.g. "The history of London") **will** false-positive here,
 * since there's no dictionary to tell "London" apart from an accidentally
 * capitalised common word. This is a directionally useful heuristic, not a
 * linguistically complete grammar check — the same honesty standard every
 * other checker in this codebase documents about its own approximations
 * (see e.g. `termCasingConsistencyChecker`'s doc comment).
 */
function isSentenceCase(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const upper = isUpperFirst(word)
    if (upper === null) continue

    if (i === 0) {
      if (!upper) return false
      continue
    }

    const normalised = normaliseWord(word)
    const bareLetters = word.replace(/[^A-Za-z]/g, '')
    const isAcronym = bareLetters.length >= 2 && bareLetters === bareLetters.toUpperCase()
    if (isAcronym || SENTENCE_CASE_EXCEPTIONS.has(normalised)) continue

    if (upper) return false
  }
  return true
}

/**
 * Flags `heading` blocks that don't match the project's declared Title
 * Case or Sentence case convention. **Only fires when
 * `ctx.styleGuide?.headingCapitalisation` is `'title-case'` or
 * `'sentence-case'`** — with no preference set (or no `styleGuide` passed
 * at all), this checker returns no findings, since there's no house style
 * to enforce. This is the first Style-Guide-dependent checker in the
 * codebase; see `docs/VIRTUAL_EDITOR.md` § Style Guide.
 *
 * No `suggestedFix` is offered: safely rewriting a heading's capitalisation
 * requires distinguishing minor words and proper nouns from ordinary
 * words, which this heuristic approximates but can't do with certainty —
 * exactly the same "flag-only, no fix" precedent as
 * `termCasingConsistencyChecker`/`quoteStyleConsistencyChecker`'s
 * no-preference path.
 */
export const headingCapitalisationChecker: Checker = {
  id: 'copyEditing.heading-capitalisation',
  category: 'copyEditing',
  label: 'Heading capitalisation style',
  description:
    'Flags headings that don\'t match the project\'s Style Guide heading-capitalisation preference (Title Case or Sentence case). Silent when no preference is set.',
  run(ctx: CheckerContext): Finding[] {
    const preference = ctx.styleGuide?.headingCapitalisation
    if (preference !== 'title-case' && preference !== 'sentence-case') return []

    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'heading') continue
        const text = block.text.trim()
        if (!text) continue

        const matches = preference === 'title-case' ? isTitleCase(text) : isSentenceCase(text)
        if (matches) continue

        const conventionLabel = preference === 'title-case' ? 'Title Case' : 'Sentence case'
        findings.push(
          makeFinding({
            checkerId: headingCapitalisationChecker.id,
            issueType: 'heading-capitalisation-mismatch',
            severity: 'minor',
            confidence: 0.5,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `Heading "${text}" doesn't follow this project's ${conventionLabel} convention.`,
            whyItMatters:
              `The project's Style Guide declares ${conventionLabel} for headings — an inconsistent heading breaks that stated convention and reads as unedited next to every heading that does follow it.`,
          }),
        )
      }
    }
    return findings
  },
}

export const COPY_EDITING_CHECKERS: Checker[] = [headingCapitalisationChecker]
