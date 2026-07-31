/**
 * Virtual Editor — Consistency checkers.
 *
 * Deterministic, synchronous, book-wide pattern checks — no NLP, no
 * spelling/proper-noun dictionary, nothing that "understands" the text.
 * Both checkers below follow `proofreading.ts`'s `quoteStyleConsistencyChecker`
 * precedent exactly: count a pattern across the whole manuscript, flag when
 * the book contradicts itself, informational only. Deciding *which* variant
 * is "correct" (Title Case or lowercase? metric or imperial?) needs a human
 * with editorial judgement, not a regex — so neither checker here ever
 * offers a `suggestedFix`.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { extractTextSpans } from '@/virtualEditor/textExtract'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'consistency',
    source: 'deterministic',
    ...partial,
  }
}

/**
 * Tracks two-word phrases that appear both fully Title Case (e.g. "Forest
 * Garden") and fully lowercase (e.g. "forest garden") somewhere in the book
 * — a strong signal the term is meant to be a consistently-capitalised
 * proper noun/name but hasn't been applied consistently.
 *
 * Deliberately only matches when *both* words in a pair share the same
 * casing (either both `Aaaa` or both `aaaa`). Ordinary sentence-initial
 * capitalisation ("The forest is quiet...") only ever capitalises the first
 * word of a two-word pair, never the second, so it never registers as the
 * Title Case variant here — no part-of-speech tagging, no dictionary of
 * known proper nouns, just a cheap heuristic that happens to sidestep the
 * most common false-positive source for this class of check.
 *
 * One real false positive this heuristic *would* otherwise produce: a
 * sentence opening with an article immediately before a proper noun (e.g.
 * "The Forest Garden thrives...") capitalises both words of "The Forest"
 * even though "The" is only capitalised because it starts the sentence, not
 * because "the forest" is meant to be a proper noun. `LEADING_STOPWORDS`
 * excludes a short list of common articles/determiners/prepositions from
 * ever counting as the Title Case *first* word of a pair, closing that gap
 * without needing real sentence-boundary detection.
 *
 * A combined frequency floor (>=3 total mentions of the pair, with at least
 * one of each casing) guards against a single coincidental match
 * masquerading as a genuine book-wide naming inconsistency.
 *
 * Known limitations, documented not hidden: only catches exactly two-word
 * terms (a three-word proper noun like "Forest Garden Method" is missed);
 * hyphenated or apostrophised words aren't matched as part of a pair; and a
 * genuinely different pair of words that happens to share a lowercase
 * bigram with an unrelated Title Case pair elsewhere (rare, but possible in
 * a large book) could still produce a false positive.
 */
const LEADING_STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'in', 'on', 'at',
  'for', 'with', 'and', 'but', 'or', 'of', 'to', 'as',
])

export const termCasingConsistencyChecker: Checker = {
  id: 'consistency.term-casing',
  category: 'consistency',
  label: 'Term capitalisation consistency',
  description:
    'Flags two-word terms used both Title Case and lowercase across the book (e.g. "Forest Garden" vs "forest garden").',
  run(ctx: CheckerContext): Finding[] {
    const TITLE_WORD = /^[A-Z][a-z]+$/
    const LOWER_WORD = /^[a-z]+$/

    interface Entry {
      titleCount: number
      lowerCount: number
      titleExample?: { chapterId: string; blockId: string }
      lowerExample?: { chapterId: string; blockId: string }
      titleDisplay?: string
      lowerDisplay?: string
    }
    const seen = new Map<string, Entry>()

    for (const span of extractTextSpans(ctx.manuscript)) {
      // Tokenise into words first and slide a two-word window across them,
      // rather than a global regex `exec` loop — a regex match consumes its
      // whole match before the next search starts, so a non-overlapping
      // bigram scan would only ever see every *other* pair (e.g. in "The
      // Forest Garden", matching "The Forest" first would skip straight to
      // "Garden thrives" next, never examining "Forest Garden" itself). A
      // word-array sliding window has no such gap: every adjacent pair,
      // including ones that start where the previous pair ended, is seen.
      const words = span.text.match(/[A-Za-z]+/g) ?? []
      for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i]!
        const w2 = words[i + 1]!
        const isTitle = TITLE_WORD.test(w1) && TITLE_WORD.test(w2) && !LEADING_STOPWORDS.has(w1.toLowerCase())
        const isLower = LOWER_WORD.test(w1) && LOWER_WORD.test(w2)
        if (!isTitle && !isLower) continue

        const key = `${w1.toLowerCase()} ${w2.toLowerCase()}`
        const entry: Entry = seen.get(key) ?? { titleCount: 0, lowerCount: 0 }
        if (isTitle) {
          entry.titleCount++
          entry.titleExample ??= { chapterId: span.chapterId, blockId: span.blockId }
          entry.titleDisplay ??= `${w1} ${w2}`
        } else {
          entry.lowerCount++
          entry.lowerExample ??= { chapterId: span.chapterId, blockId: span.blockId }
          entry.lowerDisplay ??= `${w1} ${w2}`
        }
        seen.set(key, entry)
      }
    }

    const findings: Finding[] = []
    for (const entry of seen.values()) {
      if (entry.titleCount === 0 || entry.lowerCount === 0) continue
      if (entry.titleCount + entry.lowerCount < 3) continue

      const location = entry.titleExample ?? entry.lowerExample!
      findings.push(
        makeFinding({
          checkerId: termCasingConsistencyChecker.id,
          issueType: 'term-casing-inconsistency',
          severity: 'minor',
          confidence: 0.5,
          location,
          message: `"${entry.titleDisplay}" and "${entry.lowerDisplay}" are both used across the book (${entry.titleCount} Title Case, ${entry.lowerCount} lowercase) — likely the same term with inconsistent capitalisation.`,
          whyItMatters:
            'Publishers pick one capitalisation for a named term (a place, a technique, a proprietary method) and use it every time it appears; switching case reads as unedited and can make a reader wonder if two different things are being discussed.',
        }),
      )
    }
    return findings
  },
}

// Ordered longest/most-specific alternative first within each group so the
// regex engine's first-match-wins alternation never truncates a longer unit
// name to a shorter one that happens to be a prefix of it (e.g. "kilomet(re|
// er)s?" must be tried before "met(re|er)s?", or "5 kilometres" would match
// as "5 ki" + leftover "lometres" instead of the whole word).
const METRIC_ABBR = /\b\d+(?:\.\d+)?\s?(mm|cm|km|kg|ml|m)\b/gi
const METRIC_FULL =
  /\b\d+(?:\.\d+)?\s?(millimetres?|centimetres?|kilomet(?:re|er)s?|met(?:re|er)s?|kilograms?|grams?|millilitres?|lit(?:re|er)s?)\b/gi
// Deliberately excludes the abbreviation "in" for inches — bare "in" is
// overwhelmingly the preposition, not a unit, and a digit-adjacency
// requirement alone isn't enough to disambiguate "5 in the garden" from a
// genuine "5 in" (inches). Spelled-out "inch(es)" has no such ambiguity and
// is included below.
const IMPERIAL_ABBR = /\b\d+(?:\.\d+)?\s?(ft|yds?|mi|lbs?|oz)\b/gi
const IMPERIAL_FULL = /\b\d+(?:\.\d+)?\s?(feet|foot|yards?|miles?|pounds?|ounces?|inch(?:es)?)\b/gi

/**
 * Book-wide measurement-unit style, split into two independent findings
 * (mirroring how `quoteStyleConsistencyChecker` counts one pattern across
 * every span in the manuscript):
 *
 * 1. Metric vs imperial mixing — the book uses both systems with no
 *    apparent "give both" convention (e.g. "5 metres (16 feet)" pairs would
 *    still trip this, since the checker only counts totals, not adjacency —
 *    a documented simplification, not a hidden one).
 * 2. Abbreviated vs spelled-out metric style — "5m" alongside "5 metres".
 *    Imperial abbreviation-style isn't checked (only metric), since "in"
 *    for inches can't be reliably distinguished from the preposition; a
 *    future pass could add "5ft" vs "5 feet" once a safer inches pattern
 *    exists.
 */
export const measurementUnitConsistencyChecker: Checker = {
  id: 'consistency.measurement-units',
  category: 'consistency',
  label: 'Measurement unit consistency',
  description:
    'Flags a book that mixes metric and imperial units, or mixes abbreviated and spelled-out metric unit styles (e.g. "5m" vs "5 metres").',
  run(ctx: CheckerContext): Finding[] {
    interface Example {
      chapterId: string
      blockId: string
      text: string
    }
    let metricAbbrCount = 0
    let metricFullCount = 0
    let imperialCount = 0
    let metricAbbrExample: Example | undefined
    let metricFullExample: Example | undefined
    let imperialExample: Example | undefined

    for (const span of extractTextSpans(ctx.manuscript)) {
      const abbrMatches = span.text.match(METRIC_ABBR) ?? []
      const fullMatches = span.text.match(METRIC_FULL) ?? []
      const imperialAbbrMatches = span.text.match(IMPERIAL_ABBR) ?? []
      const imperialFullMatches = span.text.match(IMPERIAL_FULL) ?? []

      if (abbrMatches.length > 0) {
        metricAbbrCount += abbrMatches.length
        metricAbbrExample ??= { chapterId: span.chapterId, blockId: span.blockId, text: abbrMatches[0]!.trim() }
      }
      if (fullMatches.length > 0) {
        metricFullCount += fullMatches.length
        metricFullExample ??= { chapterId: span.chapterId, blockId: span.blockId, text: fullMatches[0]!.trim() }
      }
      const imperialTotal = imperialAbbrMatches.length + imperialFullMatches.length
      if (imperialTotal > 0) {
        imperialCount += imperialTotal
        imperialExample ??= {
          chapterId: span.chapterId,
          blockId: span.blockId,
          text: (imperialAbbrMatches[0] ?? imperialFullMatches[0]!).trim(),
        }
      }
    }

    const findings: Finding[] = []
    const metricCount = metricAbbrCount + metricFullCount
    const metricExample = metricAbbrExample ?? metricFullExample

    if (metricCount > 0 && imperialCount > 0 && metricExample && imperialExample) {
      findings.push(
        makeFinding({
          checkerId: measurementUnitConsistencyChecker.id,
          issueType: 'metric-imperial-mixing',
          severity: 'minor',
          confidence: 0.55,
          location: { chapterId: metricExample.chapterId, blockId: metricExample.blockId },
          message: `This book mixes metric and imperial measurements (${metricCount} metric mentions, e.g. "${metricExample.text}", vs ${imperialCount} imperial, e.g. "${imperialExample.text}").`,
          whyItMatters:
            'A book aimed at a single readership normally commits to one measurement system throughout (or consistently gives both, e.g. "5 metres (16 feet)") — an unplanned mix reads as though different sections were written or edited separately.',
        }),
      )
    }

    if (metricAbbrCount > 0 && metricFullCount > 0 && metricAbbrExample && metricFullExample) {
      findings.push(
        makeFinding({
          checkerId: measurementUnitConsistencyChecker.id,
          issueType: 'unit-abbreviation-style-inconsistency',
          severity: 'minor',
          confidence: 0.5,
          location: { chapterId: metricAbbrExample.chapterId, blockId: metricAbbrExample.blockId },
          message: `Metric units appear both abbreviated (e.g. "${metricAbbrExample.text}") and spelled out (e.g. "${metricFullExample.text}") — ${metricAbbrCount} abbreviated vs ${metricFullCount} spelled-out mentions.`,
          whyItMatters:
            'Consistent unit styling (always "5m" or always "5 metres") is a basic copy-editing standard; switching between the two within a book looks unpolished even though both forms are individually correct.',
        }),
      )
    }

    return findings
  },
}

export const CONSISTENCY_CHECKERS: Checker[] = [termCasingConsistencyChecker, measurementUnitConsistencyChecker]
