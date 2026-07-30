import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { ScoreTile } from '@/virtualEditor/scoring'

interface ScoreCardProps {
  tile: ScoreTile
  score: number | null
  findingCount?: number
}

/** One tile in the Editorial Dashboard's score grid. Renders a real number
 * only when `score` is non-null — categories with no checker/reviewer yet
 * show "Not yet analysed" instead of a fabricated figure, per CLAUDE.md's
 * standard of honesty about what's real vs. designed-for-later. */
export function ScoreCard({ tile, score, findingCount }: ScoreCardProps) {
  const analysed = score !== null

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
          <p className="text-xs font-medium text-text-muted">Not yet analysed</p>
        </>
      )}

      <p className="text-xs text-text-secondary">{tile.description}</p>
    </div>
  )
}
