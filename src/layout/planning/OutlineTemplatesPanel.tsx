import { ListTree, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useLayer0Store } from '@/store/layer0Store'
import { deleteLayer0EntityWithHistory } from '@/store/editorActions'
import { getOutlineTemplatesForForm, applyOutlineTemplate, type OutlineTemplate } from '@/data/outlineTemplates'
import { getLayer0KindLabel } from '@/types/layer0'
import type { BookForm } from '@/types/project'

interface OutlineTemplatesPanelProps {
  projectId: string
  bookForm?: BookForm
}

/**
 * "Outlining / story-structure templates" (`docs/ROADMAP.md` Phase F) —
 * pick a well-known structure and apply it to seed the project's Timeline
 * with ordered beats, ready to fill in. Purely additive: applying a
 * template always appends after whatever's already on the timeline (never
 * reorders or overwrites existing events), and every seeded event goes
 * through the same history-wrapped action a manual add does, so the whole
 * thing undoes cleanly if it wasn't what the user wanted. See
 * `data/outlineTemplates.ts` for the template data itself.
 */
export function OutlineTemplatesPanel({ projectId, bookForm }: OutlineTemplatesPanelProps) {
  const timelineEvents = useLayer0Store((s) => s.getBible(projectId).timelineEvents)
  const timelineEventCount = timelineEvents.length
  const timelineLabel = getLayer0KindLabel('timelineEvent', bookForm).plural
  const templates = getOutlineTemplatesForForm(bookForm)

  const handleApply = (template: OutlineTemplate) => {
    applyOutlineTemplate(projectId, template, timelineEventCount)
  }

  const handleRemove = (eventId: string) => {
    deleteLayer0EntityWithHistory(projectId, 'timelineEvents', eventId, 'Remove timeline event')
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Outline templates</h2>
        <p className="text-sm text-text-secondary">
          Apply a structure to seed your {timelineLabel} with ordered beats — each one lands as an editable event you
          can rename, describe, link to a chapter, and reorder from the {timelineLabel} category.
          {!bookForm && ' Showing every shape, fiction and non-fiction — set Fiction or Non-fiction in Project Settings to narrow this list.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.map((template) => {
          // Beats already applied from this exact template — sorted by
          // `order` so "already added" reads top-to-bottom the same way the
          // Chronology category itself does, not insertion order.
          const applied = timelineEvents
            .filter((e) => e.sourceTemplateId === template.id)
            .sort((a, b) => a.order - b.order)

          return (
            <div key={template.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-4">
              <div className="flex items-start gap-2.5">
                <ListTree className="mt-0.5 size-4 shrink-0 text-text-muted" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{template.label}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{template.description}</p>
                </div>
              </div>
              <p className="text-xs text-text-muted">{template.beats.length} beats</p>
              <Button variant="secondary" size="sm" className="w-full gap-1.5" onClick={() => handleApply(template)}>
                <Plus className="size-3.5" />
                {timelineEventCount > 0 ? `Add ${template.beats.length} events to ${timelineLabel}` : `Apply to ${timelineLabel}`}
              </Button>

              {applied.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <p className="text-xs font-medium text-text-secondary">Already added ({applied.length})</p>
                  {applied.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-button)] bg-background-secondary px-2 py-1">
                      <span className="truncate text-xs text-text-primary">{event.title}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${event.title}`}
                        onClick={() => handleRemove(event.id)}
                        className="shrink-0 text-text-muted transition-colors duration-150 hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
