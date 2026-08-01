import { useMemo, useState } from 'react'
import { CaseSensitive, Replace, ReplaceAll, Search as SearchIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/contentStore'
import { useSelectionStore } from '@/store/selectionStore'
import { replaceAllMatchesWithHistory, replaceMatchWithHistory } from '@/store/editorActions'
import { findMatches, type SearchMatch } from '@/search/manuscriptSearch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/common/EmptyState'
import type { Project } from '@/types'

interface SearchPanelProps {
  project: Project
}

/** One match row — excerpt with the matched text highlighted, click to
 * jump to it (reusing `requestScrollToBlock`, the same mechanism the
 * Virtual Editor's Locate/Edit actions already use to force-mount a
 * `LazySpread` page that hasn't scrolled into view yet), plus a per-match
 * Replace button once a replacement is entered. */
function MatchRow({
  match,
  query,
  replaceWith,
  onReplace,
}: {
  match: SearchMatch
  query: string
  replaceWith: string
  onReplace: (match: SearchMatch) => void
}) {
  const select = useSelectionStore((s) => s.select)
  const requestScrollToBlock = useSelectionStore((s) => s.requestScrollToBlock)

  const before = match.excerpt.slice(0, match.excerptMatchStart)
  const highlighted = match.excerpt.slice(match.excerptMatchStart, match.excerptMatchStart + match.excerptMatchLength)
  const after = match.excerpt.slice(match.excerptMatchStart + match.excerptMatchLength)

  const handleClick = () => {
    select(match.chapterId, match.blockId)
    requestScrollToBlock(match.chapterId, match.blockId)
  }

  return (
    <div className="group flex items-center gap-1 rounded-[var(--radius-button)] px-2.5 py-1.5 text-text-secondary transition-colors duration-150 hover:bg-hover">
      <button type="button" onClick={handleClick} className="min-w-0 flex-1 text-left text-[13px] leading-snug">
        {before}
        <mark className="rounded-sm bg-[var(--color-warning)]/40 px-0.5 text-text-primary">{highlighted}</mark>
        {after}
      </button>
      {query && (
        <button
          type="button"
          onClick={() => onReplace(match)}
          aria-label="Replace this match"
          title={replaceWith ? `Replace with "${replaceWith}"` : 'Enter replacement text below'}
          disabled={!replaceWith}
          className="shrink-0 rounded-sm p-0.5 text-text-muted opacity-35 transition-opacity duration-150 hover:text-text-primary hover:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-20"
        >
          <Replace className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** The Sidebar's "Search" tab (Phase B, flagged 2026-08-01) — a search box
 * that highlights matches across the whole manuscript and lets the user
 * jump to any of them, plus an optional Find-and-Replace follow-on.
 * Deliberately its own Sidebar tab (alongside Chapters/Structure/Assets)
 * rather than a new Toolbar button or a Ctrl/Cmd+F shortcut: the Toolbar is
 * already flagged as crowded (`docs/SUGGESTIONS.md`'s Phase 67 entry), and
 * `useKeyboardShortcuts.ts`'s own doc comment states this codebase
 * deliberately never intercepts Ctrl/Cmd+anything except undo/redo.
 */
export function SearchPanel({ project }: SearchPanelProps) {
  const manuscript = useContentStore((s) => s.getManuscript(project.id))
  const [query, setQuery] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)

  const matches = useMemo(
    () => (manuscript ? findMatches(manuscript, query, { caseSensitive }) : []),
    [manuscript, query, caseSensitive],
  )

  // Grouped in manuscript chapter order — `findMatches` already walks
  // chapters in that order (via `extractTextSpans`), so a `Map`'s natural
  // insertion order is enough; no separate sort needed.
  const groups = useMemo(() => {
    const map = new Map<string, { chapterTitle: string; matches: SearchMatch[] }>()
    for (const match of matches) {
      const group = map.get(match.chapterId)
      if (group) group.matches.push(match)
      else map.set(match.chapterId, { chapterTitle: match.chapterTitle, matches: [match] })
    }
    return [...map.entries()]
  }, [matches])

  const handleReplaceOne = (match: SearchMatch) => {
    if (!replaceWith) return
    replaceMatchWithHistory(project.id, match, query, replaceWith, caseSensitive)
  }

  const handleReplaceAll = () => {
    if (!replaceWith || matches.length === 0) return
    replaceAllMatchesWithHistory(project.id, matches, query, replaceWith, caseSensitive)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 py-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in manuscript…"
          className="h-8 flex-1 px-2.5 text-[13px]"
        />
        <button
          type="button"
          onClick={() => setCaseSensitive((v) => !v)}
          aria-label="Match case"
          aria-pressed={caseSensitive}
          title="Match case"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-border transition-colors duration-150',
            caseSensitive ? 'border-[var(--color-accent)] bg-accent/10 text-[var(--color-accent)]' : 'text-text-muted hover:bg-hover hover:text-text-primary',
          )}
        >
          <CaseSensitive className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={replaceWith}
          onChange={(e) => setReplaceWith(e.target.value)}
          placeholder="Replace with…"
          className="h-8 flex-1 px-2.5 text-[13px]"
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={!replaceWith || matches.length === 0}
          onClick={handleReplaceAll}
        >
          <ReplaceAll className="size-3.5" />
          All
        </Button>
      </div>

      {query.trim() && (
        <p className="px-1 text-xs text-text-muted">
          {matches.length === 0
            ? 'No matches.'
            : `${matches.length} match${matches.length === 1 ? '' : 'es'} in ${groups.length} chapter${groups.length === 1 ? '' : 's'}`}
        </p>
      )}

      <ScrollArea className="h-full flex-1">
        {!query.trim() ? (
          <EmptyState
            icon={SearchIcon}
            title="Search your manuscript"
            description="Find a word or phrase across every chapter, and optionally replace it everywhere at once."
            className="py-10"
          />
        ) : (
          <div className="flex flex-col gap-2 pb-2">
            {groups.map(([chapterId, group]) => (
              <div key={chapterId} className="flex flex-col gap-0.5">
                <span className="px-1.5 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  {group.chapterTitle}
                </span>
                {group.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    query={query}
                    replaceWith={replaceWith}
                    onReplace={handleReplaceOne}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
