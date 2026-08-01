import { ListTree, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useLayer0Store } from '@/store/layer0Store'
import { OUTLINE_TEMPLATES, applyOutlineTemplate, type OutlineTemplate } from '@/data/outlineTemplates'

interface OutlineTemplatesPanelProps {
  projectId: string
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
export function OutlineTemplatesPanel({ projectId }: OutlineTemplatesPanelProps) {
  const timelineEventCount = useLayer0Store((s) => s.getBible(projectId).timelineEvents.length)

  const handleApply = (template: OutlineTemplate) => {
    applyOutlineTemplate(projectId, template, timelineEventCount)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Outline templates</h2>
        <p className="text-sm text-text-secondary">
          Apply a story structure to seed your Timeline with ordered beats — each one lands as an editable Timeline
          Event you can rename, describe, and reorder from the Timeline category.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {OUTLINE_TEMPLATES.map((template) => (
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
              {timelineEventCount > 0 ? `Add ${template.beats.length} events to Timeline` : 'Apply to Timeline'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
