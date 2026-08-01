import { useMemo } from 'react'

import { useContentStore } from '@/store/contentStore'
import { extractTextSpans } from '@/virtualEditor/textExtract'
import { wordCount } from '@/utils/format'

/**
 * Live total word count across the whole manuscript. Reuses
 * `extractTextSpans` (the Virtual Editor's own text-flattening helper,
 * already the single place that knows how to pull plain text out of every
 * block type) and `wordCount` (already used per-block by
 * `TypographyPanel.tsx` and several checkers) rather than writing a second,
 * parallel text-extraction pass — see `textExtract.ts`'s own doc comment
 * for why that file exists in the first place.
 *
 * Memoized on the `Manuscript` object's own reference: this codebase's
 * store actions always return a fresh object on a real edit and reuse the
 * existing reference otherwise (the same immutable-update convention every
 * other store here follows), so this only actually re-walks the manuscript
 * when its content has genuinely changed — not on every render, and not on
 * every keystroke either, since block edits commit on blur/pointer-up
 * rather than per character. Confirmed acceptable for CLAUDE.md's
 * 1,000+ page performance bar: a single `String.split(/\s+/)` pass per text
 * span is O(manuscript length), and only runs at edit-commit points.
 */
export function useManuscriptWordCount(projectId: string): number {
  const manuscript = useContentStore((s) => s.getManuscript(projectId))

  return useMemo(() => {
    if (!manuscript) return 0
    let total = 0
    for (const span of extractTextSpans(manuscript)) total += wordCount(span.text)
    return total
  }, [manuscript])
}
