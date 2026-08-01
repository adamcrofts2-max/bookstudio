import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/EmptyState'
import { useLayer0Store } from '@/store/layer0Store'
import { addLayer0EntityWithHistory, deleteLayer0EntityWithHistory, updateLayer0EntityWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import { LAYER0_KIND_LABELS, LAYER0_KIND_TO_COLLECTION, type BaseLayer0Entity, type Layer0EntityKind } from '@/types/layer0'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'

interface EntityListPanelProps {
  projectId: string
  kind: Layer0EntityKind
}

/** A loosely-typed view of any one entity, for the generic list/form below
 * — see `layer0FormConfig.ts`'s doc comment for why this component is
 * generic over all eight kinds rather than eight near-duplicate
 * components. The cast at the read site below is the one place that
 * genericness costs real type safety; every store call this component
 * makes is still fully typed on the `layer0Store.ts`/`editorActions.ts`
 * side. */
type EntityRecord = BaseLayer0Entity & Record<string, unknown>

/** Sentinel used for `editingId` while composing a brand-new entity (not
 * yet saved, so it has no real id yet) — distinct from any real id since
 * `generateId` always includes an underscore-joined prefix and never
 * produces the bare string `"new"`. */
const NEW_ENTITY_SENTINEL = 'new'

/**
 * One category's list + add/edit form — the right-hand pane of
 * `PlanningShell.tsx`. Lists every entity of `kind` for `projectId`, with
 * an "Add" button and a per-row edit/delete pair, all going through
 * `editorActions.ts`'s history-wrapped Layer 0 actions so every change is
 * undoable exactly like every other kind of edit in this app.
 */
export function EntityListPanel({ projectId, kind }: EntityListPanelProps) {
  const collection = LAYER0_KIND_TO_COLLECTION[kind]
  const config = LAYER0_FORM_CONFIG[kind]
  const labels = LAYER0_KIND_LABELS[kind]
  const singularLower = labels.singular.toLowerCase()

  // See `EntityRecord`'s doc comment for why this cast is the one
  // deliberately loosely-typed read in an otherwise fully-typed store.
  const entities = useLayer0Store((s) => s.getBible(projectId)[collection]) as unknown as EntityRecord[]

  // `null` = dialog closed; `NEW_ENTITY_SENTINEL` = composing a new entity;
  // any other string = editing that entity's id. `draft` holds the form's
  // in-progress values regardless of which case is active.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  function openNew() {
    const blank: Record<string, string> = {}
    for (const field of config.fields) blank[field.key] = ''
    setDraft(blank)
    setEditingId(NEW_ENTITY_SENTINEL)
  }

  function openEdit(entity: EntityRecord) {
    const values: Record<string, string> = {}
    for (const field of config.fields) values[field.key] = (entity[field.key] as string | undefined) ?? ''
    setDraft(values)
    setEditingId(entity.id)
  }

  function close() {
    setEditingId(null)
    setDraft({})
  }

  function save() {
    if (!editingId) return
    if (!draft[config.primaryKey]?.trim()) return

    const cleaned: Record<string, string | undefined> = {}
    for (const field of config.fields) {
      const value = draft[field.key]?.trim()
      cleaned[field.key] = value ? value : undefined
    }

    if (editingId === NEW_ENTITY_SENTINEL) {
      const now = new Date().toISOString()
      const entity: EntityRecord = {
        id: generateId(kind),
        createdAt: now,
        updatedAt: now,
        // `TimelineEvent`'s one non-text field — appended at the end by
        // default; manual reordering is future work (see
        // `docs/AI_WORKSPACE_VISION.md`, this is the schema+store
        // foundation pass, not the full timeline UI).
        ...(kind === 'timelineEvent' ? { order: entities.length } : {}),
        ...cleaned,
      }
      // Cast justified by `EntityRecord`'s doc comment — `collection` and
      // `entity` are each individually well-typed at their own layer, but
      // TS can't unify a generic-over-`kind` UI component with
      // `layer0Store`'s per-collection generic without this boundary.
      addLayer0EntityWithHistory(projectId, collection, entity as never, `Add ${singularLower}`)
    } else {
      updateLayer0EntityWithHistory(projectId, collection, editingId, cleaned as never, `Edit ${singularLower}`)
    }
    close()
  }

  function remove(id: string) {
    deleteLayer0EntityWithHistory(projectId, collection, id, `Delete ${singularLower}`)
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{labels.plural}</h2>
          <p className="text-sm text-text-secondary">{labels.description}</p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openNew}>
          <Plus className="size-4" />
          Add {singularLower}
        </Button>
      </div>

      {entities.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={`No ${labels.plural.toLowerCase()} yet`}
          description={`Add your first ${singularLower} to start building this book's planning bible.`}
          action={
            <Button type="button" size="sm" onClick={openNew}>
              Add {singularLower}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {entities.map((entity) => (
            <div
              key={entity.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-3"
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(entity)}>
                <p className="truncate text-sm font-medium text-text-primary">
                  {(entity[config.primaryKey] as string | undefined)?.trim() || 'Untitled'}
                </p>
                {config.secondaryKey && !!entity[config.secondaryKey] && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{entity[config.secondaryKey] as string}</p>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" aria-label={`Edit ${singularLower}`} onClick={() => openEdit(entity)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete ${singularLower}`} onClick={() => remove(entity.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId === NEW_ENTITY_SENTINEL ? `Add ${singularLower}` : `Edit ${singularLower}`}</DialogTitle>
            <DialogDescription>{labels.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {config.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`layer0-field-${field.key}`}>{field.label}</Label>
                {field.type === 'textarea' ? (
                  <Textarea
                    id={`layer0-field-${field.key}`}
                    rows={3}
                    placeholder={field.placeholder}
                    value={draft[field.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`layer0-field-${field.key}`}
                    placeholder={field.placeholder}
                    value={draft[field.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!draft[config.primaryKey]?.trim()}>
              {editingId === NEW_ENTITY_SENTINEL ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
