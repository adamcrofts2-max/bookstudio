import { useState } from 'react'
import { Target } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useWritingSessionStore, writingSessionTodayStr } from '@/store/writingSessionStore'

interface WritingGoalDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Last 7 calendar dates, oldest first, as `YYYY-MM-DD` — includes days with
 * no logged activity (shown as 0) so a gap in a writing streak is visible,
 * not just silently skipped. */
function lastSevenDates(): string[] {
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dates
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * "Word-count goals and writing-session tracking" (`docs/ROADMAP.md` Phase F)
 * — opened by clicking the live word count in `Toolbar.tsx`. Shows today's
 * net words written against an optional daily goal, plus the last 7 days so
 * a gap in a writing streak is visible at a glance. `writingSessionStore`
 * does the actual tracking (fed continuously by `useWritingSessionTracking`,
 * mounted once in `Toolbar.tsx`); this dialog only reads it and lets the
 * user set the goal.
 */
export function WritingGoalDialog({ projectId, open, onOpenChange }: WritingGoalDialogProps) {
  const session = useWritingSessionStore((s) => s.getState(projectId))
  const setDailyGoal = useWritingSessionStore((s) => s.setDailyGoal)
  const [goalDraft, setGoalDraft] = useState(String(session.dailyGoal || ''))

  const today = writingSessionTodayStr()
  const todayCount = session.log[today] ?? 0
  const hasGoal = session.dailyGoal > 0
  const progressPercent = hasGoal ? Math.min(100, Math.max(0, (todayCount / session.dailyGoal) * 100)) : 0
  const days = lastSevenDates()

  const commitGoal = () => {
    const parsed = Number.parseInt(goalDraft, 10)
    setDailyGoal(projectId, Number.isFinite(parsed) ? parsed : 0)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Writing goal</DialogTitle>
          <DialogDescription>
            Tracks net words written per day from the live total — deleting more than you add on a given day shows
            as a negative, not hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text-primary">Today</p>
              <p className="text-sm tabular-nums text-text-secondary">
                {todayCount >= 0 ? '+' : ''}
                {todayCount.toLocaleString()} words
                {hasGoal && <span className="text-text-muted"> / {session.dailyGoal.toLocaleString()} goal</span>}
              </p>
            </div>
            {hasGoal && <Progress value={progressPercent} />}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daily-goal-input">Daily word-count goal</Label>
            <div className="flex items-center gap-2">
              <Input
                id="daily-goal-input"
                type="number"
                min={0}
                placeholder="e.g. 500"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                onBlur={commitGoal}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              />
              <span className="shrink-0 text-xs text-text-muted">words / day</span>
            </div>
            <p className="text-xs text-text-muted">Set to 0, or leave blank, to track without a goal.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Target className="size-3.5 text-text-muted" />
              <Label>Last 7 days</Label>
            </div>
            <div className="flex flex-col gap-1">
              {days.map((dateStr) => {
                const value = session.log[dateStr] ?? 0
                return (
                  <div key={dateStr} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="text-text-secondary">{formatDayLabel(dateStr, today)}</span>
                    <span className={cn('tabular-nums font-medium', value < 0 ? 'text-danger' : 'text-text-primary')}>
                      {value >= 0 ? '+' : ''}
                      {value.toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
