import { useMemo, useState } from 'react'
import { AlertTriangle, BookOpenCheck, Loader2, Settings2, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AiSettingsDialog } from '@/components/settings/AiSettingsDialog'
import { useAiSettingsStore } from '@/store/aiSettingsStore'
import { useVirtualEditorStore } from '@/store/virtualEditorStore'
import { buildAiReviewRequest, createAiReviewer } from '@/virtualEditor/aiReviewer'
import { claudeReviewTransport } from '@/ai/claudeReviewTransport'
import type { AiReviewCoverage, CheckerContext } from '@/virtualEditor/types'
import { formatTimestamp } from '@/utils/format'

const reviewer = createAiReviewer(claudeReviewTransport)

interface AiReviewPanelProps {
  projectId: string
  /** Built by the workspace, which already reads every store a review
   * needs — this panel never reaches into them itself. */
  buildContext: () => CheckerContext
  /** Below the dashboard's "enough to judge" threshold a read would be a
   * paid opinion on a paragraph, so the button explains instead. */
  enoughWritten: boolean
}

function describeCoverage(coverage: AiReviewCoverage): string {
  const chapters =
    coverage.chaptersRead === coverage.chaptersTotal
      ? `${coverage.chaptersTotal === 1 ? 'the whole chapter' : `all ${coverage.chaptersTotal} chapters`}`
      : `the first ${coverage.chaptersRead} of ${coverage.chaptersTotal} chapters`
  return `${chapters} (${coverage.wordsRead.toLocaleString()} words)`
}

/**
 * The editorial read (docs/STATUS.md Phase 179): the half of the Virtual
 * Editor only judgement can do — pacing, structure, clarity, whether an
 * opening earns its reader.
 *
 * It runs only when asked. The deterministic review is free and re-runs on
 * a click; this one spends the author's money on their own key, so the
 * panel says what will be sent and to whom *before* the button, and never
 * fires on its own.
 */
export function AiReviewPanel({ projectId, buildContext, enoughWritten }: AiReviewPanelProps) {
  const providerId = useAiSettingsStore((s) => s.providerId)
  const apiKey = useAiSettingsStore((s) => s.apiKey)
  const ai = useVirtualEditorStore((s) => s.aiByProject[projectId])
  const runAiReview = useVirtualEditorStore((s) => s.runAiReview)
  const cancelAiReview = useVirtualEditorStore((s) => s.cancelAiReview)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const connected = providerId === 'api-key' && apiKey.length > 0
  const running = ai?.status === 'running'
  const result = ai && ai.status !== 'running' ? ai.result : undefined

  // What a read *would* cover, stated before anyone pays for it. Only
  // computed when it can be acted on.
  const plannedCoverage = useMemo(
    () => (connected && enoughWritten && !running ? buildAiReviewRequest(buildContext()).coverage : null),
    [connected, enoughWritten, running, buildContext],
  )

  const start = () => void runAiReview(projectId, reviewer, buildContext())

  return (
    <section
      aria-labelledby="ai-review-heading"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 max-w-[60ch] flex-col gap-1">
          <h2 id="ai-review-heading" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <BookOpenCheck className="size-4 text-accent" />
            Editorial read by Claude
          </h2>
          {!connected ? (
            <p className="text-sm text-text-secondary">
              The checks here measure things. They can’t tell you that a chapter drags, a narrator slips, or an
              opening doesn’t make anyone turn the page. Claude can read the whole book and tell you — using your
              own Anthropic API key, billed to your account.
            </p>
          ) : running ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
              <Loader2 className="size-3.5 animate-spin" />
              {ai.progress.phase === 'thinking'
                ? 'Claude is reading the book. A whole-book read takes a few minutes.'
                : `Writing up findings… ${ai.progress.receivedChars.toLocaleString()} characters so far.`}
            </p>
          ) : result ? (
            <>
              {result.summary && <p className="text-sm text-text-primary">{result.summary}</p>}
              <p className="text-xs text-text-secondary">
                Read {describeCoverage(result.coverage)} · {formatTimestamp(result.generatedAt)} ·{' '}
                {result.findings.length} {result.findings.length === 1 ? 'finding' : 'findings'}, marked “Claude” below
                {result.discarded > 0 &&
                  ` · ${result.discarded} left out because they quoted words that aren’t in the book`}
              </p>
            </>
          ) : !enoughWritten ? (
            <p className="text-sm text-text-secondary">
              Write a little more first — Claude needs at least a page or two to say anything worth paying for.
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              Sends {plannedCoverage ? describeCoverage(plannedCoverage) : 'the manuscript'} to Anthropic with your
              key. Claude reports on structure, pacing, clarity, consistency and how the book will land with
              readers. Nothing is changed unless you accept a fix.
            </p>
          )}
          {ai?.status === 'error' && (
            <p className="flex items-start gap-1.5 text-sm text-danger-ink" role="alert">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {ai.message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!connected ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-3.5" />
              Connect Claude
            </Button>
          ) : running ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => cancelAiReview(projectId)}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              variant={result ? 'outline' : 'primary'}
              size="sm"
              className="gap-1.5"
              disabled={!enoughWritten}
              onClick={start}
            >
              <BookOpenCheck className="size-3.5" />
              {result || ai?.status === 'error' ? 'Read again' : 'Ask Claude to read it'}
            </Button>
          )}
        </div>
      </div>
      <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </section>
  )
}
