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

/** Common short words that show up inside entity names/titles ("The
 * Lighthouse", "House of Ash") but are themselves near-universal in
 * ordinary prose — matching on these alone would flag almost every
 * sentence a user pastes, defeating the point of a *suggestion*. Excluded
 * from `matchableTokens`, not from the full-label match (the full label —
 * "The Lighthouse" — still needs to work, only the bare word "The" doesn't
 * count as a standalone signal). */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'is', 'it', 'he', 'she',
  'they', 'we', 'you', 'i', 'that', 'this', 'for', 'with', 'as', 'by', 'from', 'but',
  'not', 'so', 'if', 'be', 'are', 'was', 'were', 'been', 'has', 'have', 'had', 'will',
  'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'do', 'does',
  'did', 'no', 'yes', 'all', 'any', 'our', 'your', 'his', 'her', 'its', 'their', 'my',
  'me', 'him', 'them', 'us', 'de', 'van', 'von',
])

/** Word-ish tokens (2+ letters, not a `STOPWORD`) worth matching on their
 * own, longest first so a longer/more distinctive token doesn't get
 * shadowed by a short one in the alternation below. Skips a bare single
 * initial ("J.") — too likely to false-positive on ordinary prose to be
 * worth surfacing as a suggestion. */
function matchableTokens(label: string): string[] {
  const tokens = label
    .split(/\s+/)
    .filter((t) => t.replace(/[^\p{L}]/gu, '').length >= 2 && !STOPWORDS.has(t.toLowerCase()))
  return [...new Set(tokens)].sort((a, b) => b.length - a.length)
}

/** One entity's suggestion candidates: every unique sentence in `sentences`
 * that mentions `label` — either the full label as a whole phrase, or any
 * individual word within it (case-insensitive, word-boundary matched, same
 * approach `detectMentionedEntityIds` already uses for the full-phrase
 * case). Matching on individual words too (not just the complete label) is
 * deliberate: a `Character.name` is typically stored as a full name like
 * "Wren Ashgrove", but prose almost always refers back to a character by
 * first name alone after their first introduction — full-label-only
 * matching missed the overwhelming majority of real mentions. Found via a
 * live first-time-author UX audit (docs/STATUS.md, Phase 78, 2026-08-02):
 * pasting a paragraph that only ever said "Wren" produced zero suggestions.
 * Broader matching costs nothing here since every suggestion is reviewed
 * and explicitly accepted before it touches the bible (see this file's own
 * doc comment) — a false-positive candidate is a two-second dismissal, not
 * a silent bad write. */
function suggestionsForEntity(
  kind: BibleSuggestionKind,
  entityId: string,
  label: string,
  sentences: string[],
): BibleSuggestion[] {
  const trimmedLabel = label.trim()
  if (!trimmedLabel) return []
  const alternatives = [trimmedLabel, ...matchableTokens(trimmedLabel)].map(escapeRegExp)
  const pattern = new RegExp(`\\b(?:${alternatives.join('|')})\\b`, 'i')
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
