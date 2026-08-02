/**
 * Virtual Editor — Proofreading checkers.
 *
 * Deterministic, synchronous, pure. Each checker reads the manuscript via
 * `extractTextSpans` and returns `Finding[]` — it never mutates a block.
 * Spelling (below) is the one exception to "deterministic == instant": it
 * depends on an offline dictionary that loads asynchronously the first time
 * it's needed, gated through `isApplicable` exactly like the `pages`-
 * dependent checkers elsewhere in this codebase — see `spellingChecker`'s
 * own comment. The rest of the proofreading taxonomy (broken hyperlinks,
 * malformed URLs, ellipsis/dash consistency, missing spaces after
 * punctuation, etc.) remains designed but not yet implemented — see
 * docs/VIRTUAL_EDITOR.md.
 */

import type { Checker, CheckerContext, Finding, StyleGuide } from '@/virtualEditor/types'
import type { Layer0Bible } from '@/types/layer0'
import { extractTextSpans, blockPlainText } from '@/virtualEditor/textExtract'
import { patchTextField } from '@/virtualEditor/textPatch'
import { ensureSpellDictionaryLoading, getSpeller, isSpellDictionaryReady } from '@/virtualEditor/spellcheckDictionary'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'proofreading',
    source: 'deterministic',
    ...partial,
  }
}

/** Two or more consecutive spaces within a text span. Mechanically
 * fixable: collapse to one space. */
export const doubleSpaceChecker: Checker = {
  id: 'proofreading.double-space',
  category: 'proofreading',
  label: 'Double spaces',
  description: 'Finds runs of two or more consecutive spaces.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const span of extractTextSpans(ctx.manuscript)) {
      if (/ {2,}/.test(span.text)) {
        findings.push(
          makeFinding({
            checkerId: doubleSpaceChecker.id,
            issueType: 'double-space',
            severity: 'minor',
            confidence: 1,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message: `Double space found in "${excerpt(span.text)}".`,
            whyItMatters:
              'Extra inter-word spacing is a proofreading inconsistency professional typesetting always removes — once justified, stray double spaces create visible rivers of white space on the printed page.',
            suggestedFix: {
              summary: 'Collapse to a single space',
              apply: (block) => patchTextField(block, span.field, (text) => text.replace(/ {2,}/g, ' ')),
            },
          }),
        )
      }
    }
    return findings
  },
}

/** Same word repeated back-to-back ("the the"). Case-insensitive,
 * word-boundary matched. Mechanically fixable: drop the duplicate. */
export const repeatedWordChecker: Checker = {
  id: 'proofreading.repeated-word',
  category: 'proofreading',
  label: 'Repeated words',
  description: 'Finds the same word typed twice in a row.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    const pattern = /\b([A-Za-z]+)\s+\1\b/i
    for (const span of extractTextSpans(ctx.manuscript)) {
      const match = pattern.exec(span.text)
      if (match) {
        findings.push(
          makeFinding({
            checkerId: repeatedWordChecker.id,
            issueType: 'repeated-word',
            severity: 'major',
            confidence: 0.9,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message: `The word "${match[1]}" appears twice in a row.`,
            whyItMatters:
              'Accidental word repetition reads as a typo to every reader who notices it and is one of the first things a professional proofreader removes.',
            suggestedFix: {
              summary: `Remove the duplicate "${match[1]}"`,
              apply: (block) =>
                patchTextField(block, span.field, (text) =>
                  text.replace(new RegExp(`\\b(${escapeRegExp(match[1])})\\s+\\1\\b`, 'i'), '$1'),
                ),
            },
          }),
        )
      }
    }
    return findings
  },
}

/** Unmatched quotation marks — an odd count of straight double quotes, or
 * an unequal count of curly opening/closing quotes, within a single span. */
export const unmatchedQuotesChecker: Checker = {
  id: 'proofreading.unmatched-quotes',
  category: 'proofreading',
  label: 'Unmatched quotation marks',
  description: 'Finds text spans with an odd number of quotation marks.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const span of extractTextSpans(ctx.manuscript)) {
      const straight = (span.text.match(/"/g) ?? []).length
      const curlyOpen = (span.text.match(/“/g) ?? []).length
      const curlyClose = (span.text.match(/”/g) ?? []).length

      if (straight % 2 !== 0) {
        findings.push(
          makeFinding({
            checkerId: unmatchedQuotesChecker.id,
            issueType: 'unmatched-quote',
            severity: 'major',
            confidence: 0.6,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message: `Odd number of straight quotation marks (${straight}) in "${excerpt(span.text)}".`,
            whyItMatters:
              "An unmatched quotation mark leaves the reader unsure where a quoted phrase ends, and it's a hallmark of an unproofread manuscript.",
          }),
        )
      } else if (curlyOpen !== curlyClose) {
        // Common false-positive, discovered against a real manuscript: a
        // single stray closing curly quote (”) directly after a letter, with
        // no matching opener anywhere in this span, is almost always a
        // misplaced apostrophe from an import/autocorrect artifact (e.g.
        // "moments”" instead of "moments’") — not a genuinely unmatched
        // quotation. That distinction matters because it's the difference
        // between a safe, mechanical fix and a judgment call: only this
        // narrow, high-confidence shape gets a `suggestedFix` (so Fix/Fix All
        // has something real to do); anything less clear-cut stays
        // informational-only, exactly as before.
        const strayApostrophePattern = /\w”/
        const looksLikeStrayApostrophe =
          Math.abs(curlyOpen - curlyClose) === 1 && curlyClose > curlyOpen && strayApostrophePattern.test(span.text)

        if (looksLikeStrayApostrophe) {
          findings.push(
            makeFinding({
              checkerId: unmatchedQuotesChecker.id,
              issueType: 'quote-mark-as-apostrophe',
              severity: 'minor',
              confidence: 0.75,
              location: { chapterId: span.chapterId, blockId: span.blockId },
              message: `A closing curly quotation mark is likely being used as an apostrophe in "${excerpt(span.text)}".`,
              whyItMatters:
                'A right double quotation mark (”) standing in for an apostrophe (’) is a common import artifact — it reads as a typo and creates false "unmatched quote" alarms throughout the manuscript.',
              suggestedFix: {
                summary: 'Replace with an apostrophe (’)',
                apply: (block) =>
                  patchTextField(block, span.field, (text) => {
                    const matches = [...text.matchAll(/\w”/g)]
                    if (matches.length === 0) return text
                    const last = matches[matches.length - 1]
                    const idx = last.index ?? 0
                    return `${text.slice(0, idx)}${last[0][0]}’${text.slice(idx + last[0].length)}`
                  }),
              },
            }),
          )
        } else {
          findings.push(
            makeFinding({
              checkerId: unmatchedQuotesChecker.id,
              issueType: 'unmatched-quote',
              severity: 'major',
              confidence: 0.6,
              location: { chapterId: span.chapterId, blockId: span.blockId },
              message: `Unbalanced curly quotation marks (${curlyOpen} opening vs ${curlyClose} closing) in "${excerpt(span.text)}".`,
              whyItMatters:
                "An unmatched quotation mark leaves the reader unsure where a quoted phrase ends, and it's a hallmark of an unproofread manuscript.",
            }),
          )
        }
      }
    }
    return findings
  },
}

const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const CLOSERS = new Set(Object.values(BRACKET_PAIRS))

/** Stack-based bracket/parenthesis matching within a single text span. */
export const unmatchedBracketsChecker: Checker = {
  id: 'proofreading.unmatched-brackets',
  category: 'proofreading',
  label: 'Unmatched brackets',
  description: 'Finds unbalanced (), [] or {} within a text span.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const span of extractTextSpans(ctx.manuscript)) {
      const stack: string[] = []
      let unbalanced = false
      for (const char of span.text) {
        if (char in BRACKET_PAIRS) {
          stack.push(BRACKET_PAIRS[char])
        } else if (CLOSERS.has(char)) {
          if (stack.pop() !== char) {
            unbalanced = true
            break
          }
        }
      }
      if (unbalanced || stack.length > 0) {
        findings.push(
          makeFinding({
            checkerId: unmatchedBracketsChecker.id,
            issueType: 'unmatched-bracket',
            severity: 'major',
            confidence: 0.85,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message: `Unbalanced brackets or parentheses in "${excerpt(span.text)}".`,
            whyItMatters:
              'A bracket or parenthesis left open (or closed without an opener) reads as broken formatting and often signals accidentally deleted or duplicated text.',
          }),
        )
      }
    }
    return findings
  },
}

/** Paragraphs of reasonable length that don't end in terminal punctuation.
 * Soft confidence: some short lines are intentionally punctuation-free. */
export const missingTerminalPunctuationChecker: Checker = {
  id: 'proofreading.missing-terminal-punctuation',
  category: 'proofreading',
  label: 'Missing terminal punctuation',
  description: 'Finds paragraphs that appear to be missing a full stop or other closing punctuation.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'paragraph') continue
        const text = blockPlainText(block).trim()
        if (wordCount(text) < 4) continue
        if (/[.!?"'”’)\]:;]$/.test(text)) continue

        findings.push(
          makeFinding({
            checkerId: missingTerminalPunctuationChecker.id,
            issueType: 'missing-terminal-punctuation',
            severity: 'minor',
            confidence: 0.55,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `Paragraph doesn't end in punctuation: "…${excerpt(text, true)}".`,
            whyItMatters:
              'A paragraph without closing punctuation reads as truncated to readers, even when the thought is actually complete.',
            suggestedFix: {
              summary: 'Add a full stop',
              apply: (b) => patchTextField(b, 'html', (html) => `${html}.`),
            },
          }),
        )
      }
    }
    return findings
  },
}

/**
 * Quotation-mark style. Two distinct behaviours, chosen by
 * `ctx.styleGuide?.quoteStyle`:
 *
 * - **No preference set** (`'no-preference'` or `styleGuide` absent) — the
 *   original, backward-compatible behaviour: a single book-wide
 *   informational finding when the manuscript mixes straight and curly
 *   quotes/apostrophes at all, with no opinion on which is "correct".
 *   Deciding which direction to normalise needs more context than a
 *   deterministic checker should guess at, so there is still no suggested
 *   fix here.
 * - **`'curly'` or `'straight'` preference set** — a more actionable mode:
 *   every text span containing a quote/apostrophe mark that contradicts the
 *   explicit preference gets its own finding (not one vague book-wide
 *   pattern), so the user can see and fix each offending block. Still no
 *   `suggestedFix` — converting a straight quote to the correct curly
 *   opening/closing variant (or vice versa) needs to know which side of a
 *   quotation it's on, which this checker doesn't attempt to parse.
 */
export const quoteStyleConsistencyChecker: Checker = {
  id: 'proofreading.quote-style-consistency',
  category: 'proofreading',
  label: 'Straight vs curly quote consistency',
  description:
    'Flags manuscripts that mix straight and curly quotation marks/apostrophes, or (when a Style Guide quote-style preference is set) flags any quote not matching it.',
  run(ctx: CheckerContext): Finding[] {
    const preference = ctx.styleGuide?.quoteStyle

    if (preference === 'curly' || preference === 'straight') {
      const findings: Finding[] = []
      const violatingPattern = preference === 'curly' ? /["']/ : /[‘’“”]/
      const violatingPatternGlobal = preference === 'curly' ? /["']/g : /[‘’“”]/g
      const preferredLabel = preference === 'curly' ? 'curly ("smart")' : 'straight'
      const violatingLabel = preference === 'curly' ? 'straight' : 'curly'

      for (const span of extractTextSpans(ctx.manuscript)) {
        if (!violatingPattern.test(span.text)) continue
        const count = (span.text.match(violatingPatternGlobal) ?? []).length
        findings.push(
          makeFinding({
            checkerId: quoteStyleConsistencyChecker.id,
            issueType: 'quote-style-preference-violation',
            severity: 'minor',
            confidence: 0.7,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message: `Found ${count} ${violatingLabel} quotation mark${count === 1 ? '' : 's'}/apostrophe${count === 1 ? '' : 's'} in "${excerpt(span.text)}", but this project's Style Guide prefers ${preferredLabel} quotes.`,
            whyItMatters:
              `The project's Style Guide explicitly sets quote style to ${preferredLabel} — a mismatched quote here breaks that stated rule and will read as inconsistent with the rest of the book.`,
          }),
        )
      }
      return findings
    }

    // No preference set (or no styleGuide passed at all) — exactly the
    // original book-wide mixing behaviour, unchanged.
    const spans = extractTextSpans(ctx.manuscript)
    let straightCount = 0
    let curlyCount = 0
    let firstOffender: (typeof spans)[number] | undefined

    for (const span of spans) {
      const straight = (span.text.match(/["']/g) ?? []).length
      const curly = (span.text.match(/[‘’“”]/g) ?? []).length
      straightCount += straight
      curlyCount += curly
      if (!firstOffender && straight > 0 && curlyCount > 0) firstOffender = span
      if (!firstOffender && straight > 0) firstOffender = span
    }

    if (straightCount > 0 && curlyCount > 0 && firstOffender) {
      return [
        makeFinding({
          checkerId: quoteStyleConsistencyChecker.id,
          issueType: 'quote-style-inconsistency',
          severity: 'minor',
          confidence: 0.5,
          location: { chapterId: firstOffender.chapterId, blockId: firstOffender.blockId },
          message: `This book mixes straight and curly quotation marks/apostrophes (${straightCount} straight vs ${curlyCount} curly across the manuscript).`,
          whyItMatters:
            'Professional typesetting uses one quotation style consistently throughout a book — mixed styles look like an unedited manuscript to experienced readers.',
        }),
      ]
    }
    return []
  },
}

/** A run of letters, optionally joined by a single internal apostrophe
 * (straight or curly) — matches "don't"/"won't" as one token instead of
 * splitting on the apostrophe, without also swallowing a leading/trailing
 * quotation mark around a whole word (the regex only counts an apostrophe
 * as part of the word when there's a letter immediately on both sides). */
const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g

/** Every Layer 0 bible entry's name, split into individual lowercase words
 * — invented character/place names ("Kaelith", "Thornwood") are exactly
 * the kind of word a generic dictionary has never heard of and a novelist
 * chose on purpose, so they're excluded from spelling findings rather than
 * flagged every single time they appear. Multi-word names ("Elara
 * Thornwood") are split so each half is recognised individually, since
 * prose might use either half alone. Timeline events/glossary terms/
 * references/etc. are deliberately not included — their "name" is a title
 * or phrase, not a word coined for this book, so excluding it would risk
 * hiding a real typo inside it. */
function collectLayer0Names(bible: Layer0Bible | undefined): Set<string> {
  const names = new Set<string>()
  if (!bible) return names
  for (const entity of [...bible.characters, ...bible.locations]) {
    for (const word of entity.name.split(/\s+/)) {
      const cleaned = word.replace(/[^A-Za-z']/g, '').toLowerCase()
      if (cleaned) names.add(cleaned)
    }
  }
  return names
}

/** All-caps tokens longer than one letter ("NASA", "ISBN", "OK") are almost
 * always intentional acronyms/abbreviations, not typos a dictionary lookup
 * should judge — the same "reduce novelist-relevant false positives"
 * reasoning as `collectLayer0Names` above, just for a shape a story bible
 * can't enumerate in advance. */
function looksLikeAcronym(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()
}

/** `StyleGuide.englishVariant` is a closed `'british' | 'american'` choice
 * (unlike every other Style Guide field, it has no `'no-preference'`
 * option), and `DEFAULT_STYLE_GUIDE.englishVariant` is `'british'` — so an
 * absent `ctx.styleGuide` (a manuscript reviewed before Style Guide was
 * ever opened) defaults to British here too, matching what the project
 * would actually use once its Style Guide loads, rather than silently
 * treating "unknown" as American. */
function effectiveEnglishVariant(ctx: CheckerContext): StyleGuide['englishVariant'] {
  return ctx.styleGuide?.englishVariant ?? 'british'
}

/**
 * Real, dictionary-backed spelling — the one item in this file's own doc
 * comment that used to say "designed but not yet implemented." Unblocked
 * Phase 109 (2026-08-02) once the user installed `nspell` + `dictionary-en`
 * (American) from their own terminal, then extended the same day once they
 * also installed `dictionary-en-gb` (British) — this sandbox has no npm
 * registry access, so none of the three packages could be added from here.
 * See `spellcheckDictionary.ts`'s doc comment for the full loading story
 * and why each variant is its own independently-loaded dictionary rather
 * than one combined word list.
 */
export const spellingChecker: Checker = {
  id: 'proofreading.spelling',
  category: 'proofreading',
  label: 'Spelling',
  description: 'Flags words not found in a bundled offline English dictionary (British or American, per the Style Guide).',
  isApplicable(ctx) {
    const variant = effectiveEnglishVariant(ctx)
    ensureSpellDictionaryLoading(variant)
    return isSpellDictionaryReady(variant)
  },
  run(ctx: CheckerContext): Finding[] {
    const speller = getSpeller(effectiveEnglishVariant(ctx))
    if (!speller) return []
    const ignoreWords = collectLayer0Names(ctx.layer0Bible)

    const findings: Finding[] = []
    for (const span of extractTextSpans(ctx.manuscript)) {
      // One finding per distinct misspelling per span, not per occurrence —
      // a typo repeated three times in one paragraph is one thing to fix,
      // not three near-identical dashboard entries.
      const flaggedInSpan = new Set<string>()
      for (const match of span.text.matchAll(WORD_PATTERN)) {
        const word = match[0]
        const lower = word.toLowerCase()
        if (flaggedInSpan.has(lower)) continue
        if (looksLikeAcronym(word)) continue
        if (ignoreWords.has(lower)) continue
        if (speller.correct(word)) continue

        flaggedInSpan.add(lower)
        const suggestions = speller.suggest(word).slice(0, 3)
        findings.push(
          makeFinding({
            checkerId: spellingChecker.id,
            issueType: 'spelling',
            severity: 'minor',
            confidence: 0.65,
            location: { chapterId: span.chapterId, blockId: span.blockId },
            message:
              suggestions.length > 0
                ? `"${word}" isn't in the dictionary — did you mean "${suggestions[0]}"?`
                : `"${word}" isn't in the dictionary.`,
            whyItMatters:
              'An unrecognised word is either a typo a reader will notice, or a deliberate name/term worth being consistent about — either way it is worth a second look.',
            suggestedFix:
              suggestions.length > 0
                ? {
                    summary: `Replace with "${suggestions[0]}"`,
                    apply: (block) =>
                      patchTextField(block, span.field, (text) =>
                        text.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`), suggestions[0]),
                      ),
                  }
                : undefined,
          }),
        )
      }
    }
    return findings
  },
}

export const PROOFREADING_CHECKERS: Checker[] = [
  doubleSpaceChecker,
  repeatedWordChecker,
  unmatchedQuotesChecker,
  unmatchedBracketsChecker,
  missingTerminalPunctuationChecker,
  quoteStyleConsistencyChecker,
  spellingChecker,
]

function excerpt(text: string, fromEnd = false): string {
  const trimmed = text.trim()
  if (trimmed.length <= 60) return trimmed
  return fromEnd ? trimmed.slice(-60) : `${trimmed.slice(0, 60)}…`
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
