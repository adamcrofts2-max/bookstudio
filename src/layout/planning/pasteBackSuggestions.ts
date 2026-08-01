import type { Character, Layer0Bible, Location } from '@/types/layer0'
import { escapeRegExp } from '@/utils/format'

/**
 * The "bible sync must be a reviewable diff, never automatic" V1
 * (`docs/AI_WORKSPACE_VISION.md`): a user pastes their AI's response back in
 * and Book Studio proposes *append-to-notes* suggestions for existing
 * Character/Location entities it mentions — never a silent auto-write, never
 * full field extraction. The vision doc is explicit that free-text
 * extraction into structured fields is "unsolved and error-prone," so this
 * deliberately does not try to guess which field a sentence belongs in, or
 * invent brand-new entities from prose. It only surfaces "here's a sentence
 * that mentions {existing entity} — want to append it to their notes?" and
 * leaves everything else (new entities, other fields, restructuring) to the
 * user's own follow-up edit in the entity's form. Same "cheap, predictable,
 * no dictionary/NLP" idiom as `promptContext.ts`'s `detectMentionedEntityIds`
 * and every Virtual Editor checker.
 *
 * Scoped to Character/Location only (not all eight kinds): both are the only
 * two entity shapes with a free-text `notes` field that's *always* safe to
 * append to without corrupting a more specific field — `GlossaryTerm
 * .definition`, `StyleRule.rule`, etc. are single-purpose fields where
 * appending arbitrary prose would make them worse, not better.
 */

export type BibleSuggestionKind = 'character' | 'location'

export interface BibleSuggestion {
  /** Stable within one `extractBibleSuggestions` call — not persisted, so
   * no collision risk across calls. */
  id: string
  kind: BibleSuggestionKind
  entityId: string
  entityLabel: string
  excerpt: string
}

/** Splits pasted text into sentence-ish chunks — first by line (so list
 * items/paragraph breaks don't get glued together), then by sentence-ending
 * punctuation. Not linguistically perfect (an abbreviation like "Dr." will
 * split early), but excerpts are user-editable before accepting, so a
 * slightly-off boundary costs a small edit, not a wrong suggestion. */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/))
    .map((s) => s.trim())
    .filter(Boolean)
}

/** One entity's suggestion candidates: every unique sentence in `sentences`
 * that mentions `label` as a whole word/phrase (case-insensitive), same
 * word-boundary regex approach `detectMentionedEntityIds` already uses. */
function suggestionsForEntity(
  kind: BibleSuggestionKind,
  entityId: string,
  label: string,
  sentences: string[],
): BibleSuggestion[] {
  const trimmedLabel = label.trim()
  if (!trimmedLabel) return []
  const pattern = new RegExp(`\\b${escapeRegExp(trimmedLabel)}\\b`, 'i')
  const seen = new Set<string>()
  const results: BibleSuggestion[] = []
  let index = 0
  for (const sentence of sentences) {
    if (seen.has(sentence) || !pattern.test(sentence)) continue
    seen.add(sentence)
    results.push({ id: `${entityId}-${index++}`, kind, entityId, entityLabel: trimmedLabel, excerpt: sentence })
  }
  return results
}

/** Every append-to-notes suggestion the pasted text yields, across every
 * Character and Location already in the bible. Entities with no mentions
 * contribute nothing — an empty pasted text or a bible with no
 * characters/locations yet both correctly yield `[]`. */
export function extractBibleSuggestions(bible: Layer0Bible, pastedText: string): BibleSuggestion[] {
  if (!pastedText.trim()) return []
  const sentences = splitIntoSentences(pastedText)
  const suggestions: BibleSuggestion[] = []
  for (const character of bible.characters as Character[]) {
    suggestions.push(...suggestionsForEntity('character', character.id, character.name, sentences))
  }
  for (const location of bible.locations as Location[]) {
    suggestions.push(...suggestionsForEntity('location', location.id, location.name, sentences))
  }
  return suggestions
}

/** Appends `excerpt` to an entity's existing notes, separated by a blank
 * line — never overwrites, matching `CLAUDE.md`'s "never make destructive
 * edits without confirmation." A first note just becomes the notes field
 * outright rather than starting with a stray blank line. */
export function appendToNotes(existingNotes: string | undefined, excerpt: string): string {
  const trimmedExisting = (existingNotes ?? '').trim()
  const trimmedExcerpt = excerpt.trim()
  return trimmedExisting ? `${trimmedExisting}\n\n${trimmedExcerpt}` : trimmedExcerpt
}
