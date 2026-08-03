/**
 * Word-tokenizing and false-positive-exclusion rules shared by every real
 * spell-check surface in this app: the Virtual Editor's `spellingChecker`
 * (`checkers/proofreading.ts`, Phase 109/110) and the live on-canvas
 * underliner (`renderer/useLiveSpellcheck.ts`, Phase 116, 2026-08-03).
 * Extracted here (rather than left duplicated in `proofreading.ts`, where
 * they originated) so both surfaces agree on exactly which words count as
 * "a word" and which known-good words never get flagged — a word that's
 * fine live but flagged in a Virtual Editor review (or vice versa) would
 * look like a bug to a user, not like two independent implementations of
 * the same rule that happened to drift apart.
 */

import type { Layer0Bible } from '@/types/layer0'

/** A run of letters, optionally joined by a single internal apostrophe
 * (straight or curly) — matches "don't"/"won't" as one token instead of
 * splitting on the apostrophe, without also swallowing a leading/trailing
 * quotation mark around a whole word (the regex only counts an apostrophe
 * as part of the word when there's a letter immediately on both sides).
 * `g` flag: every call site uses this via `matchAll`, which requires it. */
export const WORD_PATTERN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g

/** All-caps tokens longer than one letter ("NASA", "ISBN", "OK") are almost
 * always intentional acronyms/abbreviations, not typos a dictionary lookup
 * should judge. */
export function looksLikeAcronym(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()
}

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
export function collectLayer0Names(bible: Layer0Bible | undefined): Set<string> {
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
