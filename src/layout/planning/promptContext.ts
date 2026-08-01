import type { Chapter, Manuscript } from '@/types/content'
import type { Layer0Bible, Layer0EntityKind } from '@/types/layer0'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_LABELS, LAYER0_KIND_TO_COLLECTION } from '@/types/layer0'
import { blockPlainText } from '@/virtualEditor/textExtract'

/**
 * Layer 0's context-curation logic — per `docs/AI_WORKSPACE_VISION.md`,
 * "the actual hard problem: context curation, not storage." This is a
 * deliberately deterministic, no-NLP v1 of "which entities are relevant to
 * this chapter" (word-boundary name matching against the chapter's plain
 * text) — the same "cheap, predictable, no dictionary/NLP" idiom every
 * Virtual Editor checker in this codebase already follows, not a
 * fundamentally different kind of feature. Full auto-tagging (a persistent
 * entity↔chapter association, maintained as the user writes) is a bigger
 * follow-up; this gets useful relevance signal today with zero new data
 * model.
 */

/** One entity's plain-text label — the field `promptContext.ts` name-matches
 * against and prints in the assembled prompt. Every entity kind has exactly
 * one field playing this role (mirrors `layer0FormConfig.ts`'s
 * `primaryKey`, kept as a separate small map here rather than importing the
 * UI-form config into this pure-logic module). */
const PRIMARY_LABEL_KEY: Record<Layer0EntityKind, string> = {
  character: 'name',
  location: 'name',
  timelineEvent: 'title',
  glossaryTerm: 'term',
  reference: 'title',
  illustrationBrief: 'title',
  styleRule: 'rule',
  researchNote: 'title',
}

/** Kinds worth auto-detecting by name-mention in chapter text. Style rules/
 * references/illustration briefs/research notes aren't "mentioned by name"
 * in prose the way a character or place is, so they're left for the user to
 * opt into manually rather than producing a meaningless always-false (or
 * noisy false-positive) detection signal. Timeline events are excluded for
 * the same reason: an event's title ("The bridge collapses") isn't text
 * that literally recurs in a chapter about its aftermath. */
const AUTO_DETECTABLE_KINDS: Layer0EntityKind[] = ['character', 'location', 'glossaryTerm']

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One entity's display label (name/title/term/rule) — exported for the
 * picker UI's checkbox rows, which need the same label this module prints
 * into the assembled prompt. */
export function getEntityPrimaryLabel(kind: Layer0EntityKind, entity: Record<string, unknown>): string {
  return (entity[PRIMARY_LABEL_KEY[kind]] as string | undefined)?.trim() ?? ''
}

/** Plain text of one chapter — every block's own extractable text, joined.
 * Reuses `blockPlainText` (the Virtual Editor's own per-block text
 * flattener) rather than a second implementation. */
export function chapterPlainText(chapter: Chapter): string {
  return chapter.blocks.map(blockPlainText).filter(Boolean).join('\n')
}

/** Ids of every entity (across the three `AUTO_DETECTABLE_KINDS`) whose
 * name appears as a whole word/phrase somewhere in `text` — the
 * "auto-detected as relevant to this chapter" signal the picker
 * pre-checks. Case-insensitive; a name is escaped before being dropped into
 * a regex so a character literally named e.g. "Dr. Vance" doesn't blow up
 * matching on the unescaped `.`. */
export function detectMentionedEntityIds(bible: Layer0Bible, text: string): Set<string> {
  const detected = new Set<string>()
  if (!text.trim()) return detected

  for (const kind of AUTO_DETECTABLE_KINDS) {
    const collection = bible[LAYER0_KIND_TO_COLLECTION[kind]] as unknown as Record<string, unknown>[]
    for (const entity of collection) {
      const label = getEntityPrimaryLabel(kind, entity)
      if (!label) continue
      const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'i')
      if (pattern.test(text)) detected.add(entity.id as string)
    }
  }
  return detected
}

/** One Layer 0 entity's secondary text — the field shown under its name in
 * the assembled prompt (character description, location description,
 * glossary definition, etc.). Distinct per kind, so a small map rather than
 * a single field name like `PRIMARY_LABEL_KEY`. */
const DETAIL_KEYS: Record<Layer0EntityKind, string[]> = {
  character: ['role', 'description', 'notes'],
  location: ['description', 'notes'],
  timelineEvent: ['when', 'description'],
  glossaryTerm: ['definition'],
  reference: ['url', 'citation', 'notes'],
  illustrationBrief: ['description'],
  styleRule: [],
  researchNote: ['sourceUrl', 'body'],
}

function formatEntityLine(kind: Layer0EntityKind, entity: Record<string, unknown>): string {
  const label = getEntityPrimaryLabel(kind, entity)
  const details = DETAIL_KEYS[kind]
    .map((key) => (entity[key] as string | undefined)?.trim())
    .filter((value): value is string => !!value)
  if (kind === 'styleRule') return `- ${label}`
  return details.length > 0 ? `- **${label}** — ${details.join('; ')}` : `- **${label}**`
}

export interface PromptGeneratorSelection {
  task: string
  chapterId: string | null
  includePreviousChapterTail: boolean
  /** Selected entity ids, keyed by kind — matches `Layer0Bible`'s own
   * collection keys via `LAYER0_KIND_TO_COLLECTION` at the read site. */
  selectedIds: Record<Layer0EntityKind, string[]>
}

/** How much of the previous chapter's tail to quote for continuity —
 * short enough to stay a "the last beat, for tone/continuity" reference,
 * not a second copy of the whole chapter. */
const PREVIOUS_CHAPTER_TAIL_CHARS = 600

/**
 * Assembles the final prompt text — a minimum-relevant context bundle
 * (task + only the selected entities + optional previous-chapter tail),
 * never the whole bible, per `docs/AI_WORKSPACE_VISION.md`'s framing of
 * context curation as the actual differentiator. Markdown-formatted since
 * every mainstream chat AI renders/reads markdown natively.
 */
export function buildPromptText(bible: Layer0Bible, manuscript: Manuscript | undefined, selection: PromptGeneratorSelection): string {
  const lines: string[] = []
  const chapter = manuscript?.chapters.find((c) => c.id === selection.chapterId)

  lines.push('# Task', '', selection.task.trim() || '(describe what you want written or planned)', '')

  if (chapter) {
    lines.push(`# Chapter`, '', `Writing for: "${chapter.title}"`, '')
  }

  if (selection.includePreviousChapterTail && chapter && manuscript) {
    const chapters = [...manuscript.chapters].sort((a, b) => a.order - b.order)
    const index = chapters.findIndex((c) => c.id === chapter.id)
    const previous = index > 0 ? chapters[index - 1] : undefined
    const tail = previous ? chapterPlainText(previous).trim() : ''
    if (tail) {
      const excerpt = tail.length > PREVIOUS_CHAPTER_TAIL_CHARS ? `…${tail.slice(-PREVIOUS_CHAPTER_TAIL_CHARS)}` : tail
      lines.push(`# Continuity — end of "${previous!.title}"`, '', excerpt, '')
    }
  }

  for (const kind of LAYER0_ENTITY_KINDS) {
    const ids = selection.selectedIds[kind]
    if (!ids || ids.length === 0) continue
    const collection = bible[LAYER0_KIND_TO_COLLECTION[kind]] as unknown as Record<string, unknown>[]
    const entities = collection.filter((e) => ids.includes(e.id as string))
    if (entities.length === 0) continue

    lines.push(`# ${LAYER0_KIND_LABELS[kind].plural}`, '')
    for (const entity of entities) lines.push(formatEntityLine(kind, entity))
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}
