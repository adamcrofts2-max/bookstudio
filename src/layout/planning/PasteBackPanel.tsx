import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardPaste, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/EmptyState'
import { cn } from '@/lib/utils'
import { useLayer0Store } from '@/store/layer0Store'
import { updateLayer0EntityWithHistory } from '@/store/editorActions'
import { LAYER0_KIND_LABELS } from '@/types/layer0'
import { appendToNotes, extractBibleSuggestions, type BibleSuggestion } from '@/layout/planning/pasteBackSuggestions'

interface PasteBackPanelProps {
  projectId: string
}

type SuggestionStatus = 'new' | 'accepted' | 'rejected'

/**
 * The "bible sync must be a reviewable diff, never automatic" flow
 * (`docs/AI_WORKSPACE_VISION.md`) — the other half of the round trip
 * `PromptGeneratorPanel.tsx` starts. Paste the AI's reply back in; Book
 * Studio proposes append-to-notes suggestions for any existing Character/
 * Location it mentions (see `pasteBackSuggestions.ts` for why the scope
 * stops there). Nothing writes to the bible until the user accepts a
 * specific card — mirrors the Virtual Editor's Accept/Reject `FindingRow`
 * pattern (Phase C) rather than inventing a new review interaction, per the
 * vision doc's explicit decision.
 */
export function PasteBackPanel({ projectId }: PasteBackPanelProps) {
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const [pastedText, setPastedText] = useState('')
  const [statuses, setStatuses] = useState<Record<string, SuggestionStatus>>({})
  // Drafts the user has edited before accepting — keyed by suggestion id,
  // falling back to the original detected excerpt when untouched.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const suggestions = useMemo(() => extractBibleSuggestions(bible, pastedText), [bible, pastedText])

  // A fresh paste can change which suggestions exist entirely — stale
  // accepted/rejected statuses and drafts from a previous paste shouldn't
  // silently apply to a new, unrelated batch of ids that happen to collide
  // (ids are only stable within one `extractBibleSuggestions` call).
  const currentIds = useMemo(() => new Set(suggestions.map((s) => s.id)), [suggestions])

  const handleAccept = (suggestion: BibleSuggestion) => {
    const collection = suggestion.kind === 'character' ? 'characters' : 'locations'
    const entity = bible[collection].find((e) => e.id === suggestion.entityId)
    if (!entity) return
    const excerpt = drafts[suggestion.id] ?? suggestion.excerpt
    updateLayer0EntityWithHistory(
      projectId,
      collection,
      suggestion.entityId,
      { notes: appendToNotes(entity.notes, excerpt) },
      `Add note to ${suggestion.entityLabel}`,
    )
    setStatuses((prev) => ({ ...prev, [suggestion.id]: 'accepted' }))
  }

  const handleReject = (suggestion: BibleSuggestion) => {
    setStatuses((prev) => ({ ...prev, [suggestion.id]: 'rejected' }))
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Paste an AI response</h2>
        <p className="text-sm text-text-secondary">
          Paste what your Claude or ChatGPT wrote back. Book Studio looks for existing characters and locations it
          mentions and proposes adding the relevant sentence to their notes — nothing is written to your story bible
          until you accept a suggestion below.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paste-back-text">Pasted response</Label>
        <Textarea
          id="paste-back-text"
          rows={10}
          placeholder="Paste the AI's reply here…"
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
        />
      </div>

      {pastedText.trim() && suggestions.length === 0 && (
        <EmptyState
          icon={ClipboardPaste}
          title="No mentions found"
          description="Nothing in the pasted text matched an existing character or location by name. You can still update the bible directly from the categories on the left."
          className="py-10"
        />
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Suggested additions</Label>
          {suggestions.map((suggestion) => {
            const status = currentIds.has(suggestion.id) ? (statuses[suggestion.id] ?? 'new') : 'new'
            const resolved = status !== 'new'
            const draft = drafts[suggestion.id] ?? suggestion.excerpt

            return (
              <div
                key={suggestion.id}
                className={cn('flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-4', resolved && 'opacity-60')}
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-background-secondary px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {LAYER0_KIND_LABELS[suggestion.kind].singular}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{suggestion.entityLabel}</span>
                </div>

                {status === 'new' ? (
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [suggestion.id]: e.target.value }))}
                    className="text-sm"
                  />
                ) : (
                  <p className="text-sm text-text-secondary">{draft}</p>
                )}

                {status === 'new' ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button variant="primary" size="sm" className="gap-1.5" onClick={() => handleAccept(suggestion)}>
                      <CheckCircle2 className="size-3.5" />
                      Add to notes
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleReject(suggestion)}>
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="pt-1 text-xs font-medium capitalize text-text-muted">{status}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
