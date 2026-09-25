import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * "Word-count goals and writing-session tracking" (`docs/ROADMAP.md` Phase F)
 * — the daily-goal layer on top of the live word-count total already shown
 * in `Toolbar.tsx` (Phase B). Deliberately app-preference-shaped (like
 * `uiStore.ts`) rather than a Layer 2 Content concern: this never reads or
 * writes manuscript data itself, only observes the total `useManuscript
 * WordCount` already computes elsewhere and keeps its own tiny per-day log.
 *
 * `log` stores the *net* words written per calendar date (can be negative
 * on a day where more was deleted than added — shown as-is rather than
 * clamped to zero, since hiding a real net loss would make the log
 * inaccurate, not encouraging). `lastKnownTotal`/`lastKnownDate` are the
 * running baseline `recordWordCount` diffs against; see that method's own
 * comment for the day-boundary handling that keeps a fresh day from ever
 * attributing the whole existing manuscript to "today."
 */

export interface WritingSessionState {
  /** 0 means "no goal set" — the UI shows today's count without a progress
   * bar in that case, never a 0/0 bar. */
  dailyGoal: number
  log: Record<string, number>
  lastKnownTotal: number | null
  lastKnownDate: string | null
}

const EMPTY_WRITING_SESSION_STATE: WritingSessionState = {
  dailyGoal: 0,
  log: {},
  lastKnownTotal: null,
  lastKnownDate: null,
}

interface WritingSessionStoreState {
  byProject: Record<string, WritingSessionState>
}

interface WritingSessionStoreActions {
  /** Drops everything this store holds for a project. Called only from
   * `useDeleteProject` — see that hook for why the coordination lives
   * outside the stores. */
  clearProject: (projectId: string) => void
  getState: (projectId: string) => WritingSessionState
  setDailyGoal: (projectId: string, goal: number) => void
  /** Feeds the current live manuscript total in — called from
   * `useWritingSessionTracking` every time `useManuscriptWordCount`
   * recomputes. Not itself a Layer 2 read; the caller already did that. */
  recordWordCount: (projectId: string, currentTotal: number) => void
}

/** Local calendar date (`YYYY-MM-DD`), not UTC — "today" should mean the
 * user's actual today, not whatever date UTC happens to be at the moment. */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useWritingSessionStore = create<WritingSessionStoreState & WritingSessionStoreActions>()(
  persist(
    (set, get) => ({
      byProject: {},

      clearProject: (projectId) =>
        set((state) => {
          const nextByProject = { ...state.byProject }
          delete nextByProject[projectId]
          return { byProject: nextByProject }
        }),

      getState: (projectId) => get().byProject[projectId] ?? EMPTY_WRITING_SESSION_STATE,

      setDailyGoal: (projectId, goal) => {
        set((state) => {
          const existing = state.byProject[projectId] ?? EMPTY_WRITING_SESSION_STATE
          return { byProject: { ...state.byProject, [projectId]: { ...existing, dailyGoal: Math.max(0, Math.round(goal)) } } }
        })
      },

      recordWordCount: (projectId, currentTotal) => {
        set((state) => {
          const existing = state.byProject[projectId] ?? EMPTY_WRITING_SESSION_STATE
          const today = todayStr()

          // First observation ever for this project, or the first
          // observation on a new calendar day — (re)establish the baseline
          // without attributing anything to "today." Without this, opening
          // a 50,000-word manuscript for the first time would instantly
          // read as "50,000 words written today," and every new day would
          // silently carry yesterday's already-counted total forward as a
          // fresh "gain."
          if (existing.lastKnownDate === null || existing.lastKnownTotal === null || existing.lastKnownDate !== today) {
            return { byProject: { ...state.byProject, [projectId]: { ...existing, lastKnownTotal: currentTotal, lastKnownDate: today } } }
          }

          const delta = currentTotal - existing.lastKnownTotal
          if (delta === 0) return state // no-op — avoid a pointless persist on every unrelated render

          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...existing,
                lastKnownTotal: currentTotal,
                log: { ...existing.log, [today]: (existing.log[today] ?? 0) + delta },
              },
            },
          }
        })
      },
    }),
    {
      name: 'book-studio.writingSessions',
      version: 1,
    },
  ),
)

export { todayStr as writingSessionTodayStr }
