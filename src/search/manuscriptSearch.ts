/**
 * Manuscript search — Find (and Find-and-Replace) across the whole book
 * (docs/ROADMAP.md Phase B, flagged 2026-08-01). Pure text logic only, no
 * store access — same separation `virtualEditor/textExtract.ts`/`textPatch.ts`
 * already establish, and this module deliberately reuses both directly
 * rather than a second implementation: `extractTextSpans` for "every
 * checkable piece of text in the manuscript" and `getRawFieldText`/
 * `patchTextField` (via `store/editorActions.ts`'s `replaceMatchWithHistory`/
 * `replaceAllMatchesWithHistory`, not here) for writing a replacement back.
 *
 * Deliberately plain substring search, not word-boundary matching — "Find"
 * means "contains this text," unlike the Continuity checker's whole-name
 * matching (`checkers/continuity.ts`) or the AI prompt generator's mention
 * detection (`promptContext.ts`'s `detectMentionedEntityIds`), both of which
 * specifically want whole-word/phrase matches for a different reason
 * (avoiding "Ann" matching inside "Anna").
 *
 * Also covers chapter titles (docs/SUGGESTIONS.md's Phase 75 entry flagged
 * this as the most likely real gap — a chapter title isn't a `ContentBlock`,
 * so `extractTextSpans` never sees it) — a `SearchMatch.kind` discriminant
 * tells the caller whether a match came from a block field or a chapter
 * title, since the two are patched through completely different store
 * actions (`patchTextField`+`editBlock` vs. `renameChapterWithHistory`).
 */

import type { Chapter, Manuscript } from '@/types/content'
import { extractTextSpans } from '@/virtualEditor/textExtract'
import { escapeRegExp } from '@/utils/format'

interface OccurrenceHit {
  index: number
  occurrenceIndexInField: number
  excerpt: string
  excerptMatchStart: number
  excerptMatchLength: number
}

export type SearchMatch =
  | {
      kind: 'block'
      id: string
      chapterId: string
      chapterTitle: string
      blockId: string
      /** Same field-path shape `textExtract.ts`/`textPatch.ts` use — `'html'`,
       * `'text'`, `'items[2]'`, `'header[0]'`, `'rows[1][3]'`, etc. */
      field: string
      /**
       * Which occurrence (0-indexed) of the query this is within its own
       * field's text — left-to-right occurrence order is identical between
       * a block's raw field (e.g. a paragraph's HTML) and its stripped
       * plain text (`blockPlainText`/`extractTextSpans` only ever *remove*
       * tag markup between characters, never reorder the characters
       * themselves), so this index safely replays against the raw field
       * for a precise single-match replace — see `replaceOccurrence` below.
       */
      occurrenceIndexInField: number
      /** A short excerpt around the match, for display. */
      excerpt: string
      /** Where the match starts within `excerpt` (already accounts for a
       * leading "…" when the excerpt doesn't start at the field's start). */
      excerptMatchStart: number
      excerptMatchLength: number
    }
  | {
      kind: 'chapterTitle'
      id: string
      chapterId: string
      chapterTitle: string
      occurrenceIndexInField: number
      excerpt: string
      excerptMatchStart: number
      excerptMatchLength: number
    }

export interface SearchOptions {
  /** Defaults to `false` — case-insensitive, matching every other
   * name-matching feature in this codebase (`detectMentionedEntityIds`,
   * the Continuity checker). Exposed as a toggle since "Find" is a more
   * general-purpose tool than those two — a user checking spelling
   * consistency of a proper noun may specifically want case to matter. */
  caseSensitive?: boolean
}

/** Characters of context kept on each side of a match in its excerpt. */
const EXCERPT_RADIUS = 40

function buildPattern(query: string, caseSensitive: boolean): RegExp {
  return new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi')
}

/** Scans `text` for every occurrence of `pattern`, tracking a running
 * per-`fieldKey` occurrence count in `counters` (shared across calls so a
 * field scanned in two passes — not currently needed, but keeps the
 * counting logic in one place — still numbers occurrences correctly). */
function scanOccurrences(text: string, pattern: RegExp, fieldKey: string, counters: Map<string, number>): OccurrenceHit[] {
  const hits: OccurrenceHit[] = []
  pattern.lastIndex = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const occurrenceIndex = counters.get(fieldKey) ?? 0
    counters.set(fieldKey, occurrenceIndex + 1)

    const start = Math.max(0, match.index - EXCERPT_RADIUS)
    const end = Math.min(text.length, match.index + match[0].length + EXCERPT_RADIUS)
    const prefixEllipsis = start > 0 ? '…' : ''
    const suffixEllipsis = end < text.length ? '…' : ''

    hits.push({
      index: match.index,
      occurrenceIndexInField: occurrenceIndex,
      excerpt: `${prefixEllipsis}${text.slice(start, end)}${suffixEllipsis}`,
      excerptMatchStart: match.index - start + prefixEllipsis.length,
      excerptMatchLength: match[0].length,
    })

    // A query can't actually be empty here (guarded by callers), so
    // `match[0]` is never zero-length — this guard is defensive only, in
    // case a future caller relaxes that constraint.
    if (match[0].length === 0) pattern.lastIndex += 1
  }
  return hits
}

function findChapterTitleMatches(chapter: Chapter, pattern: RegExp, counters: Map<string, number>): SearchMatch[] {
  const fieldKey = `chapterTitle:${chapter.id}`
  return scanOccurrences(chapter.title, pattern, fieldKey, counters).map((hit) => ({
    kind: 'chapterTitle' as const,
    id: `${fieldKey}:${hit.index}`,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    occurrenceIndexInField: hit.occurrenceIndexInField,
    excerpt: hit.excerpt,
    excerptMatchStart: hit.excerptMatchStart,
    excerptMatchLength: hit.excerptMatchLength,
  }))
}

/** Every occurrence of `query` across the whole manuscript's visible text —
 * chapter titles first (they're the book's own table of contents, the most
 * natural "find this" starting point), then every block field, in
 * chapter/block/field order. Empty/whitespace-only queries return no
 * matches rather than "everything" — an empty pattern would otherwise match
 * at every character position. */
export function findMatches(manuscript: Manuscript, query: string, options: SearchOptions = {}): SearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const pattern = buildPattern(trimmed, !!options.caseSensitive)
  const matches: SearchMatch[] = []
  const occurrenceCounters = new Map<string, number>()

  for (const chapter of manuscript.chapters) {
    matches.push(...findChapterTitleMatches(chapter, pattern, occurrenceCounters))
  }

  for (const span of extractTextSpans(manuscript)) {
    const chapter = manuscript.chapters.find((c) => c.id === span.chapterId)
    if (!chapter) continue

    const fieldKey = `${span.blockId}:${span.field}`
    const hits = scanOccurrences(span.text, pattern, fieldKey, occurrenceCounters)
    for (const hit of hits) {
      matches.push({
        kind: 'block',
        id: `${fieldKey}:${hit.index}`,
        chapterId: span.chapterId,
        chapterTitle: chapter.title,
        blockId: span.blockId,
        field: span.field,
        occurrenceIndexInField: hit.occurrenceIndexInField,
        excerpt: hit.excerpt,
        excerptMatchStart: hit.excerptMatchStart,
        excerptMatchLength: hit.excerptMatchLength,
      })
    }
  }

  return matches
}

/** Replaces one specific occurrence (0-indexed, matching
 * `SearchMatch.occurrenceIndexInField`) of `query` with `replacement` in
 * `text` — every other occurrence in the same field is left untouched. */
export function replaceOccurrence(
  text: string,
  query: string,
  occurrenceIndex: number,
  replacement: string,
  caseSensitive: boolean,
): string {
  const pattern = buildPattern(query, caseSensitive)
  let count = 0
  return text.replace(pattern, (matched) => (count++ === occurrenceIndex ? replacement : matched))
}

/** Replaces every occurrence of `query` with `replacement` in `text` — used
 * for Replace All on a single field. */
export function replaceAllOccurrences(text: string, query: string, replacement: string, caseSensitive: boolean): string {
  return text.replace(buildPattern(query, caseSensitive), replacement)
}
