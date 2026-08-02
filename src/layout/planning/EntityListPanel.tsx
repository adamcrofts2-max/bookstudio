import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { useLayer0Store } from '@/store/layer0Store'
import { useContentStore } from '@/store/contentStore'
import {
  addLayer0EntityWithHistory,
  deleteLayer0EntityWithHistory,
  moveTimelineEventWithHistory,
  updateLayer0EntityWithHistory,
} from '@/store/editorActions'
import { generateId } from '@/utils'
import { getLayer0KindLabel, LAYER0_KIND_TO_COLLECTION, type BaseLayer0Entity, type Layer0EntityKind } from '@/types/layer0'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import { Layer0FieldsForm } from '@/layout/planning/Layer0FieldsForm'
import type { BookForm } from '@/types'

interface EntityListPanelProps {
  projectId: string
  kind: Layer0EntityKind
  bookForm?: BookForm
}

/** Sentinel for "no chapter assigned" in the Timeline Event chapter
 * `Select` below — same reasoning as `ProjectSettingsDialog`'s
 * `BOOK_FORM_UNSET`: Radix `Select` needs a non-empty string value. */
const NO_CHAPTER_SENTINEL = 'none'

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
export function EntityListPanel({ projectId, kind, bookForm }: EntityListPanelProps) {
  const collection = LAYER0_KIND_TO_COLLECTION[kind]
  const config = LAYER0_FORM_CONFIG[kind]
  const labels = getLayer0KindLabel(kind, bookForm)
  const singularLower = labels.singular.toLowerCase()
  // Only fetched for the Timeline Event chapter-select below — reading
  // Content (Layer 2) from a Layer 0 UI is display-only, the exact same
  // read-only cross-layer reference `IdeaDetailDialog.tsx`'s "Jump to
  // chapter" already relies on, never a write.
  const chapters = useContentStore((s) => s.getManuscript(projectId))?.chapters ?? []

  // See `EntityRecord`'s doc comment for why this cast is the one
  // deliberately loosely-typed read in an otherwise fully-typed store.
  const rawEntities = useLayer0Store((s) => s.getBible(projectId)[collection]) as unknown as EntityRecord[]
  // Timeline Events are the one kind with a manual `order` field — the raw
  // array itself isn't guaranteed sorted (`addEntity` always appends), so
  // this is what makes the on-screen list, and the up/down buttons' notion
  // of "adjacent," match `layer0Store.moveTimelineEvent`'s own by-`order`
  // swap. Every other kind displays in the store's natural (insertion)
  // order, unchanged.
  const entities = kind === 'timelineEvent' ? [...rawEntities].sort((a, b) => (a.order as number) - (b.order as number)) : rawEntities

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
          {entities.map((entity, i) => (
            <div
              key={entity.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-3"
            >
              <div className="min-w-0 flex-1">
                <button type="button" className="w-full text-left" onClick={() => openEdit(entity)}>
                  <p className="truncate text-sm font-medium text-text-primary">
                    {(entity[config.primaryKey] as string | undefined)?.trim() || 'Untitled'}
                  </p>
                  {config.secondaryKey && !!entity[config.secondaryKey] && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{entity[config.secondaryKey] as string}</p>
                  )}
                </button>
                {kind === 'timelineEvent' && (
                  <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={(entity.linkedChapterId as string | undefined) ?? NO_CHAPTER_SENTINEL}
                      onValueChange={(value) =>
                        updateLayer0EntityWithHistory(
                          projectId,
                          collection,
                          entity.id,
                          { linkedChapterId: value === NO_CHAPTER_SENTINEL ? undefined : value } as never,
                          'Link beat to chapter',
                        )
                      }
                    >
                      <SelectTrigger className="h-7 w-full max-w-56 text-xs">
                        <SelectValue placeholder="Not linked to a chapter yet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CHAPTER_SENTINEL}>Not linked to a chapter yet</SelectItem>
                        {chapters.map((chapter) => (
                          <SelectItem key={chapter.id} value={chapter.id}>
                            {chapter.title || 'Untitled chapter'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {kind === 'timelineEvent' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move earlier"
                      disabled={i === 0}
                      onClick={() => moveTimelineEventWithHistory(projectId, entity.id, 'up')}
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Move later"
                      disabled={i === entities.length - 1}
                      onClick={() => moveTimelineEventWithHistory(projectId, entity.id, 'down')}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </>
                )}
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
          <Layer0FieldsForm
            fields={config.fields}
            draft={draft}
            onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            idPrefix="layer0-field"
          />
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
