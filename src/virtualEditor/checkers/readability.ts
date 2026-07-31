/**
 * Virtual Editor — Readability checkers.
 *
 * Real, standard readability formulas — pure arithmetic over word/sentence/
 * syllable counts, no AI and no external service. Both checkers below only
 * look at `paragraph` blocks (the manuscript's actual prose): headings,
 * list items, table cells and captions aren't sentence-structured text and
 * would only dilute a sentence-length/syllable-density measurement.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'readability',
    source: 'deterministic',
    ...partial,
  }
}

/**
 * Approximate syllable counter using vowel-group counting — the same
 * heuristic virtually every deterministic readability tool uses in place of
 * a full pronunciation dictionary. It counts runs of consecutive vowels
 * (`aeiouy`) as one syllable each, then applies one small, well-documented
 * correction: a trailing silent "e" doesn't usually add its own syllable
 * ("like" -> 1, not 2). That correction is deliberately skipped for words
 * ending "-le" after a consonant ("table", "little", "handle"): there, the
 * "e" is never merged into the preceding vowel's group in the first place
 * (the intervening consonant already splits them into two separate vowel
 * groups — "a" and "e" in "table" — so the raw group count is already
 * correct at 2 and needs no further adjustment; subtracting would
 * undercount, and an earlier version of this function mistakenly *added* an
 * extra syllable here too, which overcounted "table" as 3).
 * Every word counts as at least one syllable, even if the vowel-group
 * heuristic finds none (e.g. very short words, acronyms).
 * This is an approximation, not a dictionary lookup — it will misjudge some
 * irregular words (silent letters beyond a trailing "e", diphthongs that are
 * sometimes one syllable and sometimes two) but is accurate enough in
 * aggregate across a whole manuscript for a book-level score. This is the
 * same accepted tradeoff the original Flesch tools and every mainstream
 * readability checker make; a dictionary-backed counter is a possible
 * future upgrade, not required for this to be a genuinely useful signal.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.match(/[aeiouy]+/g)
  let count = groups ? groups.length : 0
  if (w.length > 2 && w.endsWith('e') && !w.endsWith('le') && count > 1) count--
  return Math.max(1, count)
}

function splitWords(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? []
}

/** Naive sentence splitting on `.`/`!`/`?` runs. Like any punctuation-based
 * splitter, abbreviations ("e.g.", "Dr.") create false sentence breaks —
 * this undercounts true sentence length rather than overcounting, a
 * conservative direction for a "flag unusually long sentences" check. */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** The "standard" to "fairly difficult" Flesch Reading Ease band — a
 * reasonable target for illustrated general-audience nonfiction (neither
 * simplified for young readers nor dense enough for an academic audience).
 * Documented, adjustable threshold, not a hidden assumption. */
const TARGET_BAND = { min: 50, max: 70 }

/** Words-per-sentence above which a paragraph is flagged as unusually
 * long. Common style guidance treats an average sentence over ~20 words as
 * starting to tax working memory and over ~25 as difficult; 30 is chosen
 * here deliberately higher than that to keep this check to genuinely
 * outlying paragraphs rather than every merely-long sentence in the book. */
const LONG_SENTENCE_WORDS_PER_SENTENCE = 30

/**
 * Book-level Flesch Reading Ease and Flesch-Kincaid Grade Level, computed
 * once across every paragraph in the manuscript. Informational only — there
 * is nothing mechanical to fix about a readability score, so this never
 * carries a `suggestedFix`.
 */
export const fleschReadabilityChecker: Checker = {
  id: 'readability.flesch',
  category: 'readability',
  label: 'Flesch Reading Ease & Grade Level',
  description:
    'Computes the standard Flesch Reading Ease score and Flesch-Kincaid Grade Level across every paragraph in the manuscript.',
  run(ctx: CheckerContext): Finding[] {
    let totalWords = 0
    let totalSentences = 0
    let totalSyllables = 0
    let firstChapterId: string | undefined

    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'paragraph') continue
        const sentences = splitSentences(blockPlainText(block))
        if (sentences.length === 0) continue
        firstChapterId ??= chapter.id
        totalSentences += sentences.length
        for (const sentence of sentences) {
          const words = splitWords(sentence)
          totalWords += words.length
          for (const word of words) totalSyllables += countSyllables(word)
        }
      }
    }

    if (totalWords === 0 || totalSentences === 0 || !firstChapterId) return []

    const wordsPerSentence = totalWords / totalSentences
    const syllablesPerWord = totalSyllables / totalWords
    // Standard, published formulas — see e.g. Flesch (1948) and
    // Kincaid et al. (1975). Not proprietary, not invented for this project.
    const readingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord
    const gradeLevel = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59

    const roundedEase = Math.round(readingEase * 10) / 10
    const roundedGrade = Math.round(gradeLevel * 10) / 10

    const distanceBelow = TARGET_BAND.min - readingEase // > 0 => harder/denser than target
    const distanceAbove = readingEase - TARGET_BAND.max // > 0 => simpler/easier than target
    const distance = Math.max(distanceBelow, distanceAbove, 0)

    // Severity reflects how far outside the target band the score falls.
    // Capped at 'major' (never 'critical') because a book being harder or
    // simpler than the target audience isn't a manuscript-breaking defect
    // the way a critical proofreading error is — it's a prompt to sample a
    // few paragraphs, not an automatic verdict.
    let severity: Finding['severity']
    if (distance === 0) severity = 'suggestion'
    else if (distance <= 15) severity = 'minor'
    else severity = 'major'

    const whyItMatters =
      distance === 0
        ? `This falls within the ${TARGET_BAND.min}–${TARGET_BAND.max} band this tool treats as a reasonable target for general-audience illustrated nonfiction — neither too simple nor too dense for the intended reader.`
        : distanceBelow > 0
          ? `A score below the ${TARGET_BAND.min}–${TARGET_BAND.max} target band means the prose is denser/more academic than a general-audience nonfiction book usually aims for — it may ask more of casual readers than intended. Readability formulas are estimates, not a verdict, so treat this as a prompt to sample a few paragraphs aloud rather than a hard rule.`
          : `A score above the ${TARGET_BAND.min}–${TARGET_BAND.max} target band means the prose is simpler than a general-audience nonfiction book typically aims for — it may read as oversimplified for the subject matter. Readability formulas are estimates, not a verdict, so treat this as a prompt to sample a few paragraphs aloud rather than a hard rule.`

    return [
      makeFinding({
        checkerId: fleschReadabilityChecker.id,
        issueType: 'flesch-reading-ease',
        severity,
        // Well-established, correctly-implemented formulas, but the input
        // syllable count is itself a heuristic approximation (see
        // `countSyllables`) — confident, not certain.
        confidence: 0.7,
        location: { chapterId: firstChapterId },
        message: `Book-wide Flesch Reading Ease is ${roundedEase} (Flesch-Kincaid Grade Level ${roundedGrade}) across ${totalWords} words and ${totalSentences} sentences.`,
        whyItMatters,
      }),
    ]
  },
}

/**
 * Per-paragraph: flags paragraphs whose average sentence length is
 * unusually long. Unlike the book-level Flesch finding above, this gives
 * the user something actionable at the exact block that needs attention.
 */
export const longSentenceParagraphChecker: Checker = {
  id: 'readability.long-sentences',
  category: 'readability',
  label: 'Unusually long sentences',
  description: `Flags paragraphs whose average sentence length exceeds ${LONG_SENTENCE_WORDS_PER_SENTENCE} words per sentence.`,
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type !== 'paragraph') continue
        const sentences = splitSentences(blockPlainText(block))
        if (sentences.length === 0) continue
        const wordCounts = sentences.map((s) => splitWords(s).length)
        const totalWords = wordCounts.reduce((sum, n) => sum + n, 0)
        const avgWordsPerSentence = totalWords / sentences.length
        if (avgWordsPerSentence <= LONG_SENTENCE_WORDS_PER_SENTENCE) continue

        findings.push(
          makeFinding({
            checkerId: longSentenceParagraphChecker.id,
            issueType: 'long-average-sentence-length',
            severity: 'minor',
            // Naive punctuation-based sentence splitting (see
            // `splitSentences`) can misjudge sentence boundaries around
            // abbreviations, so the measured average is an estimate.
            confidence: 0.6,
            location: { chapterId: chapter.id, blockId: block.id },
            message: `This paragraph averages ${Math.round(avgWordsPerSentence)} words per sentence across ${sentences.length} sentence${sentences.length === 1 ? '' : 's'} — well above a comfortable reading length.`,
            whyItMatters:
              'Long, multi-clause sentences ask more of working memory and are a common source of reader fatigue; breaking them up usually improves comprehension without losing meaning.',
          }),
        )
      }
    }
    return findings
  },
}

export const READABILITY_CHECKERS: Checker[] = [fleschReadabilityChecker, longSentenceParagraphChecker]
