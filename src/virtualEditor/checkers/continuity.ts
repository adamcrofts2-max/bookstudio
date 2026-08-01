/**
 * Virtual Editor — Continuity checker.
 *
 * Extends the checker architecture to Layer 0 (`docs/AI_WORKSPACE_VISION.md`'s
 * story bible) — the first checker to read `ctx.layer0Bible`. Like every
 * other checker in this codebase, this is a "cheap, predictable, no
 * dictionary/NLP" deterministic pass (see `promptContext.ts`'s identical
 * framing for Layer 0 context curation), not an attempt at real semantic
 * continuity checking (e.g. "this character's eye colour changed between
 * chapters" — that genuinely needs language understanding no checker here
 * has). Two checks, in the same "small, honest start" spirit as
 * `fieldGuide.ts` (2 checkers, not a shallow rule for every entity kind):
 *
 * 1. A bible entry (Character/Location/Glossary Term) that's never
 *    mentioned anywhere in the manuscript — word-boundary name matching,
 *    the same technique `promptContext.ts`'s `detectMentionedEntityIds`
 *    already uses for chapter relevance, just applied book-wide instead of
 *    per-chapter.
 * 2. Two entries of the same kind sharing the same name (case-insensitive)
 *    — almost always an accidental duplicate rather than an intentional
 *    choice, since two story-bible entries can't genuinely share an
 *    identity.
 *
 * Timeline Events, References, Illustration Briefs, Style Rules, and
 * Research Notes are deliberately out of scope for check 1, for the same
 * reason `promptContext.ts`'s `AUTO_DETECTABLE_KINDS` excludes them: a
 * timeline event's title or a style rule's text isn't something that
 * literally recurs as a name in prose, so name-matching against it would be
 * meaningless rather than merely noisy.
 *
 * `continuity` doesn't get its own dashboard score tile (see `scoring.ts`'s
 * `SCORE_TILES` comment) — its findings still fully contribute to the
 * overall score and surface in the report's issue list under their own
 * category label, same as `developmental`/`fieldGuide`.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import type { Layer0Bible } from '@/types/layer0'
import { blockPlainText } from '@/virtualEditor/textExtract'
import { escapeRegExp } from '@/utils/format'
import { generateId } from '@/utils/id'

function makeFinding(partial: Omit<Finding, 'id' | 'category' | 'source'>): Finding {
  return {
    id: generateId('finding'),
    category: 'continuity',
    source: 'deterministic',
    ...partial,
  }
}

/** Every block's text, across every chapter, joined — the same
 * `blockPlainText` flattener every other checker uses (see
 * `developmental.ts`), just book-wide instead of chapter-scoped. */
function manuscriptPlainText(manuscript: CheckerContext['manuscript']): string {
  return manuscript.chapters
    .flatMap((chapter) => chapter.blocks.map(blockPlainText))
    .filter(Boolean)
    .join('\n')
}

/** Below this many characters of real manuscript text, "not mentioned yet"
 * is expected, not a finding — a brand-new project with an empty or
 * barely-started manuscript would otherwise flag every single bible entry
 * on the very first review, which is noise, not signal. */
const MIN_MANUSCRIPT_CHARS_FOR_MENTION_CHECK = 200

function hasAnyMentionableEntries(bible: Layer0Bible): boolean {
  return bible.characters.length > 0 || bible.locations.length > 0 || bible.glossaryTerms.length > 0
}

/** Case-insensitive whole-word/phrase match, escaping the label first so an
 * entity literally named e.g. "Dr. Vance" doesn't blow up matching on the
 * unescaped `.` — same technique as `promptContext.ts`'s
 * `detectMentionedEntityIds`. */
function isMentionedInText(label: string, text: string): boolean {
  const trimmed = label.trim()
  if (!trimmed) return false
  return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i').test(text)
}

/**
 * Flags a Character, Location, or Glossary Term that never appears by name
 * anywhere in the manuscript. `suggestion` severity and a soft confidence:
 * a bible entry can legitimately be planned for a not-yet-written chapter,
 * kept for reference after being cut, or referred to under a nickname this
 * simple matching can't see — this is a nudge to check, not an assertion
 * that something is wrong.
 */
export const unmentionedBibleEntityChecker: Checker = {
  id: 'continuity.unmentioned-bible-entity',
  category: 'continuity',
  label: 'Bible entry never mentioned in manuscript',
  description:
    "Flags a Character, Location, or Glossary Term in the story bible that doesn't appear anywhere in the written manuscript.",
  isApplicable: (ctx) => !!ctx.layer0Bible && hasAnyMentionableEntries(ctx.layer0Bible),
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.layer0Bible || !hasAnyMentionableEntries(ctx.layer0Bible)) return []
    const chapterId = ctx.manuscript.chapters[0]?.id
    if (!chapterId) return []

    const text = manuscriptPlainText(ctx.manuscript)
    if (text.trim().length < MIN_MANUSCRIPT_CHARS_FOR_MENTION_CHECK) return []

    const findings: Finding[] = []
    const checkKind = (kindSingular: string, labels: string[]) => {
      for (const label of labels) {
        if (!label.trim() || isMentionedInText(label, text)) continue
        findings.push(
          makeFinding({
            checkerId: unmentionedBibleEntityChecker.id,
            issueType: 'unmentioned-bible-entity',
            severity: 'suggestion',
            confidence: 0.4,
            location: { chapterId },
            message: `"${label.trim()}" is a ${kindSingular} in your story bible but doesn't appear anywhere in the manuscript yet.`,
            whyItMatters:
              "Bible entries are meant to inform what actually gets written — an entry that's never mentioned may be planned for a later chapter, cut, or referred to under a different name elsewhere. Worth a quick check.",
          }),
        )
      }
    }

    checkKind('Character', ctx.layer0Bible.characters.map((c) => c.name))
    checkKind('Location', ctx.layer0Bible.locations.map((l) => l.name))
    checkKind('Glossary Term', ctx.layer0Bible.glossaryTerms.map((g) => g.term))

    return findings
  },
}

/**
 * Flags two entities of the same kind (Character, Location, or Glossary
 * Term) sharing the same name, case-insensitively — almost always an
 * accidental duplicate (a second entry created by mistake, or a rename that
 * only stuck on one copy) rather than a deliberate choice.
 */
export const duplicateEntityNameChecker: Checker = {
  id: 'continuity.duplicate-entity-name',
  category: 'continuity',
  label: 'Duplicate bible entry name',
  description: 'Flags two Characters, Locations, or Glossary Terms sharing the same name.',
  isApplicable: (ctx) => !!ctx.layer0Bible && hasAnyMentionableEntries(ctx.layer0Bible),
  run(ctx: CheckerContext): Finding[] {
    if (!ctx.layer0Bible) return []
    const chapterId = ctx.manuscript.chapters[0]?.id
    if (!chapterId) return []

    const findings: Finding[] = []
    const checkKind = (kindPlural: string, labels: string[]) => {
      const groups = new Map<string, string[]>()
      for (const label of labels) {
        const normalized = label.trim().toLowerCase()
        if (!normalized) continue
        const group = groups.get(normalized) ?? []
        group.push(label.trim())
        groups.set(normalized, group)
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue
        findings.push(
          makeFinding({
            checkerId: duplicateEntityNameChecker.id,
            issueType: 'duplicate-entity-name',
            severity: 'minor',
            confidence: 0.7,
            location: { chapterId },
            message: `${group.length} ${kindPlural} in your story bible share the name "${group[0]}".`,
            whyItMatters:
              "Two bible entries with the same name are almost always an accidental duplicate — a second entry created by mistake, or a rename that only stuck on one of them — rather than a deliberate choice.",
          }),
        )
      }
    }

    checkKind('Characters', ctx.layer0Bible.characters.map((c) => c.name))
    checkKind('Locations', ctx.layer0Bible.locations.map((l) => l.name))
    checkKind('Glossary Terms', ctx.layer0Bible.glossaryTerms.map((g) => g.term))

    return findings
  },
}

export const CONTINUITY_CHECKERS: Checker[] = [unmentionedBibleEntityChecker, duplicateEntityNameChecker]
