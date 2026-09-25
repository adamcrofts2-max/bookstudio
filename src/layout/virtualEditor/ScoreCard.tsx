import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { ScoreTile } from '@/virtualEditor/scoring'

interface ScoreCardProps {
  tile: ScoreTile
  score: number | null
  findingCount?: number
  /**
   * Replaces the number with "—" and this reason. Used for the Overall
   * tile on a manuscript too short to summarise (Phase 175): the category
   * scores below it are real — a missing copyright page is a fact at any
   * length — but "Overall Editorial Score 97" on a 27-word book is a claim
   * about a whole book that does not exist yet, and it is exactly the
   * claim that made the dashboard untrustworthy.
   */
  withheldReason?: string
}

/** One tile in the Editorial Dashboard's score grid. Renders a real number
 * only when `score` is non-null — categories with no checker/reviewer yet
 * show "Not yet analysed" instead of a fabricated figure, per CLAUDE.md's
 * standard of honesty about what's real vs. designed-for-later. */
export function ScoreCard({ tile, score, findingCount, withheldReason }: ScoreCardProps) {
  const analysed = score !== null && !withheldReason

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-4',
        !analysed && 'opacity-70',
      )}
    >
      <p className="text-sm font-medium text-text-primary">{tile.label}</p>

      {analysed ? (
        <>
          <p className="text-h3 font-semibold tabular-nums text-text-primary">{score}</p>
          <Progress value={score} />
          <p className="text-xs text-text-secondary">
            {findingCount === 0 ? 'No issues found' : `${findingCount} issue${findingCount === 1 ? '' : 's'} found`}
          </p>
        </>
      ) : (
        <>
          <p className="text-h3 font-semibold text-text-muted">—</p>
          <p className="text-xs font-medium text-text-muted">{withheldReason ?? 'Not yet analysed'}</p>
        </>
      )}

      <p className="text-xs text-text-secondary">{tile.description}</p>
    </div>
  )
}
