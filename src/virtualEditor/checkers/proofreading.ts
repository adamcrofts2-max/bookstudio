/**
 * Virtual Editor — Proofreading checkers.
 *
 * Deterministic, synchronous, pure. Each checker reads the manuscript via
 * `extractTextSpans` and returns `Finding[]` — it never mutates a block.
 * These are the "real, working" checkers for this milestone; the rest of
 * the proofreading taxonomy (spelling, broken hyperlinks, malformed URLs,
 * ellipsis/dash consistency, missing spaces after punctuation, etc.) is
 * designed but not yet implemented — see docs/VIRTUAL_EDITOR.md.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { extractTextSpans, blockPlainText } from '@/virtualEditor/textExtract'
import { patchTextField } from '@/virtualEditor/textPatch'
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

/** Book-wide: mixes straight quotes/apostrophes with curly ones. Informational
 * only — deciding which direction to normalise requires more context than a
 * deterministic checker should guess at, so there is no suggested fix. */
export const quoteStyleConsistencyChecker: Checker = {
  id: 'proofreading.quote-style-consistency',
  category: 'proofreading',
  label: 'Straight vs curly quote consistency',
  description: 'Flags manuscripts that mix straight and curly quotation marks/apostrophes.',
  run(ctx: CheckerContext): Finding[] {
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

export const PROOFREADING_CHECKERS: Checker[] = [
  doubleSpaceChecker,
  repeatedWordChecker,
  unmatchedQuotesChecker,
  unmatchedBracketsChecker,
  missingTerminalPunctuationChecker,
  quoteStyleConsistencyChecker,
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
