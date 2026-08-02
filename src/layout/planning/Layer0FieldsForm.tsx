import type { FocusEvent } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EXAMPLE_SUFFIX } from '@/data/projectTemplates'
import type { Layer0FieldConfig } from '@/layout/planning/layer0FormConfig'

/**
 * Selects a field's entire value the first time it's focused, but only
 * while that value still ends in the seeded-example marker — see
 * `EntityListPanel.tsx`'s original doc comment (Phase 78) for the full
 * first-time-author reasoning this fixes. Exported here (not duplicated)
 * so both `EntityListPanel.tsx` and `IdeaDetailDialog.tsx`'s "Turn into…"
 * form share the exact same behaviour.
 */
export function selectIfUneditedExample(e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (e.currentTarget.value.trim().endsWith(EXAMPLE_SUFFIX)) e.currentTarget.select()
}

interface Layer0FieldsFormProps {
  fields: Layer0FieldConfig[]
  draft: Record<string, string>
  onChange: (key: string, value: string) => void
  /** Namespaces each field's `id`/`htmlFor` pair so two instances of this
   * form (e.g. `EntityListPanel`'s add dialog and `IdeaDetailDialog`'s
   * "Turn into…" step) can both be mounted without colliding ids. */
  idPrefix: string
}

/**
 * The generic "one text field per `Layer0FieldConfig` entry" form body —
 * factored out of `EntityListPanel.tsx` so the Idea System's "Turn into…"
 * promotion step (`IdeaDetailDialog.tsx`) can render the exact same add
 * form every Layer 0 kind already uses, instead of a second hand-built
 * copy. See `layer0FormConfig.ts`'s own doc comment for why one generic
 * `{ key, label, type }` shape covers all eight entity kinds.
 */
export function Layer0FieldsForm({ fields, draft, onChange, idPrefix }: Layer0FieldsFormProps) {
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</Label>
          {field.type === 'textarea' ? (
            <Textarea
              id={`${idPrefix}-${field.key}`}
              rows={3}
              placeholder={field.placeholder}
              value={draft[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              onFocus={selectIfUneditedExample}
            />
          ) : (
            <Input
              id={`${idPrefix}-${field.key}`}
              placeholder={field.placeholder}
              value={draft[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              onFocus={selectIfUneditedExample}
            />
          )}
        </div>
      ))}
    </div>
  )
}
