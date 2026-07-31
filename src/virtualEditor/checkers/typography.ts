/**
 * Virtual Editor — Typography checkers.
 *
 * Unlike `readability.ts` (sentence/word-level prose quality) or
 * `layout.ts` (page-level image balance), this file is about how text
 * *looks* when set — emphasis conventions, chapter-opener treatment, and
 * heading rhythm. Two of the three checkers here need real project/theme
 * data (`ctx.project`), not just the manuscript — the first checker file in
 * this directory to do so (see `CheckerContext`'s doc comment in
 * `types.ts`), so they declare `isApplicable` and return `[]` when it's
 * absent, exactly like the `pages`-dependent checkers in
 * `publishingStandards.ts`/`layout.ts`.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { resolveTheme } from '@/theme/presets'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'typography',
    source: 'deterministic',
    ...partial,
  }
}

// Short acronyms (NASA, DNA, USA) and units are legitimately all-caps and
// shouldn't trip the "emphasis abuse" heuristic below — excluded from the
// "2+ consecutive all-caps words" pattern purely by length. Anything 5+
// letters and all-caps reads as shouting/emphasis far more often than as an
// acronym in body prose.
const MIN_SHOUTING_WORD_LENGTH = 5
const MIN_CONSECUTIVE_SHOUTING_WORDS = 2

/** `true` if `word` is "shouting" for the purposes of this checker: every
 * letter uppercase, at least `MIN_SHOUTING_WORD_LENGTH` letters long (so
 * "NASA", "OK", "TV" never match), and not purely numeric/punctuation. */
function isShoutingWord(word: string): boolean {
  const letters = word.replace(/[^A-Za-z]/g, '')
  if (letters.length < MIN_SHOUTING_WORD_LENGTH) return false
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase()
}

/**
 * Flags runs of two or more consecutive ALL-CAPS words (5+ letters each) in
 * running prose — a common manuscript-import artefact (some word processors
 * or typewriter-era source documents use all-caps for emphasis) that a
 * professionally typeset book renders as italics or bold instead. Skips
 * headings entirely (a heading in a theme with all-caps styling is a
 * deliberate design choice made by the theme, not the author's text).
 *
 * No `suggestedFix`: converting "STOP RIGHT THERE" to italics isn't a text
 * transform this checker can perform (italics live in a paragraph's `html`
 * field as `<em>` tags, and deciding exactly which words to wrap is an
 * editorial judgement call) — flag-only, same precedent as
 * `oxfordCommaChecker`/`quoteStyleConsistencyChecker`'s no-preference path.
 */
export const shoutingTextChecker: Checker = {
  id: 'typography.shouting-text',
  category: 'typography',
  label: 'All-caps used for emphasis',
  description:
    'Flags runs of two or more consecutive ALL-CAPS words in body text, which a typeset book conventionally renders as italics or bold instead.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []

    for (const chapter of ctx.manuscript.chapters) {
      for (const block of chapter.blocks) {
        if (block.type === 'heading') continue // theme-styled, not the author's emphasis choice
        const text = blockPlainText(block)
        if (!text) continue

        const words = text.split(/\s+/).filter(Boolean)
        let runStart = -1
        for (let i = 0; i <= words.length; i++) {
          const shouting = i < words.length && isShoutingWord(words[i]!)
          if (shouting) {
            if (runStart === -1) runStart = i
            continue
          }
          const runLength = runStart === -1 ? 0 : i - runStart
          if (runLength >= MIN_CONSECUTIVE_SHOUTING_WORDS) {
            const phrase = words.slice(runStart, i).join(' ')
            findings.push(
              makeFinding({
                checkerId: shoutingTextChecker.id,
                issueType: 'shouting-text',
                severity: 'suggestion',
                confidence: 0.55,
                location: { chapterId: chapter.id, blockId: block.id },
                message: `"${phrase}" is set in ALL CAPS across ${runLength} words — likely meant as emphasis.`,
                whyItMatters:
                  'A professionally typeset book conveys emphasis with italics or bold rather than all-caps runs, which read as shouting and are a common leftover from a plain-text or typewriter-era source document.',
              }),
            )
          }
          runStart = -1
        }
      }
    }

    return findings
  },
}

/**
 * A drop cap (see `ResolvedBookTheme.typography.dropCap`) renders the first
 * letter of a chapter's opening paragraph large and decorative. That only
 * looks right when the character being enlarged is an actual capital
 * letter — a chapter that opens with a quotation mark, an ellipsis, or a
 * digit produces an odd or illegible drop cap in themes that have the
 * feature turned on. Silent when the resolved theme doesn't use drop caps
 * at all, or when the manuscript hasn't rendered enough to know the theme
 * (`ctx.project` absent) — this is the first checker in the codebase to key
 * behaviour off theme data rather than just the Style Guide.
 */
export const dropCapFirstCharacterChecker: Checker = {
  id: 'typography.drop-cap-first-character',
  category: 'typography',
  label: 'Drop cap starts on a non-letter',
  description:
    "Flags a chapter's opening paragraph when it doesn't start with a plain letter, in themes that render a decorative drop cap.",
  isApplicable: (ctx) => !!ctx.project,
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.project) return []
    const theme = resolveTheme(ctx.project.settings.themeId)
    if (!theme.typography.dropCap) return []

    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      const firstParagraph = chapter.blocks.find((b) => b.type === 'paragraph')
      if (!firstParagraph || firstParagraph.type !== 'paragraph') continue
      const text = firstParagraph.html.replace(/<[^>]+>/g, '').trimStart()
      const firstChar = text.charAt(0)
      if (!firstChar || /[A-Za-z]/.test(firstChar)) continue

      findings.push(
        makeFinding({
          checkerId: dropCapFirstCharacterChecker.id,
          issueType: 'drop-cap-non-letter',
          severity: 'minor',
          confidence: 0.6,
          location: { chapterId: chapter.id, blockId: firstParagraph.id },
          message: `"${chapter.title}" opens with "${firstChar}", not a letter — the "${theme.name}" theme's drop cap will enlarge that character instead of a proper capital.`,
          whyItMatters:
            'A drop cap is designed to enlarge the first letter of the chapter; starting with punctuation, an ellipsis, or a digit produces an odd or illegible enlarged glyph in any theme that has drop caps turned on.',
        }),
      )
    }
    return findings
  },
}

/**
 * Two heading blocks with nothing in between reads as a layout mistake in
 * print — a heading exists to introduce the content beneath it, so a
 * heading immediately followed by another heading (no paragraph, image, or
 * other content block separating them) almost always means a block was
 * deleted, misordered, or an import produced a spurious extra heading.
 */
export const consecutiveHeadingsChecker: Checker = {
  id: 'typography.consecutive-headings',
  category: 'typography',
  label: 'Consecutive headings with no content between them',
  description: 'Flags two heading blocks stacked with nothing between them, which prints as a layout mistake.',
  run(ctx: CheckerContext): Finding[] {
    const findings: Finding[] = []
    for (const chapter of ctx.manuscript.chapters) {
      for (let i = 0; i < chapter.blocks.length - 1; i++) {
        const current = chapter.blocks[i]!
        const next = chapter.blocks[i + 1]!
        if (current.type !== 'heading' || next.type !== 'heading') continue

        findings.push(
          makeFinding({
            checkerId: consecutiveHeadingsChecker.id,
            issueType: 'consecutive-headings',
            severity: 'minor',
            confidence: 0.6,
            location: { chapterId: chapter.id, blockId: next.id },
            message: `"${current.text}" is immediately followed by another heading, "${next.text}", with no content between them.`,
            whyItMatters:
              'A heading with nothing beneath it before the next heading starts prints as two stacked titles — usually a sign a paragraph was accidentally deleted or blocks were reordered, rather than an intentional design.',
          }),
        )
      }
    }
    return findings
  },
}

export const TYPOGRAPHY_CHECKERS: Checker[] = [
  shoutingTextChecker,
  dropCapFirstCharacterChecker,
  consecutiveHeadingsChecker,
]
