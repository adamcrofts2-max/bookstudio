import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLayer0Store } from '@/store/layer0Store'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useContentStore } from '@/store/contentStore'
import { addLayer0EntityWithHistory, deleteLayer0EntityWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_TO_COLLECTION, getLayer0KindLabel } from '@/types/layer0'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import { GRAPH_NODE_ICONS, type GraphNodeKind } from '@/layout/planning/graphIcons'
import type { BookForm } from '@/types'

interface EntityRef {
  id: string
  kind: GraphNodeKind
  label: string
}

/** Every Layer 0 entity, every Idea, and every chapter, flattened into one
 * pickable list — the same cross-kind sweep `BookGraphView.tsx`'s
 * `allNodes` builder already does, reused here for the relationship
 * picker's dropdown rather than re-deriving a second, narrower "just
 * Characters" list. A relationship between a Character and a Location ("The
 * Lighthouse is Callan's childhood home") is just as real as one between
 * two Characters — see `Layer0Relationship`'s own doc comment in
 * `types/layer0.ts`. Chapters were missing from this list until Phase 103
 * (user, 2026-08-02: "connect chapters to nodes") — `BookGraphView.tsx`'s
 * own click-to-connect flow never had this restriction (it only excludes
 * the synthetic Book node), so leaving chapters out here meant the two
 * entry points for the same underlying data could do different things;
 * this closes that gap rather than leaving one path more capable than the
 * other. */
function useAllEntityRefs(projectId: string): EntityRef[] {
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const chapters = useContentStore((s) => s.getManuscript(projectId))?.chapters ?? []

  return useMemo(() => {
    const refs: EntityRef[] = []
    for (const chapter of chapters) {
      refs.push({ id: chapter.id, kind: 'chapter', label: chapter.title || 'Untitled chapter' })
    }
    for (const kind of LAYER0_ENTITY_KINDS) {
      const collection = LAYER0_KIND_TO_COLLECTION[kind]
      const primaryKey = LAYER0_FORM_CONFIG[kind].primaryKey
      const entities = bible[collection] as unknown as (Record<string, unknown> & { id: string })[]
      for (const entity of entities) {
        refs.push({ id: entity.id, kind, label: (entity[primaryKey] as string | undefined)?.trim() || 'Untitled' })
      }
    }
    for (const idea of ideas) {
      refs.push({ id: idea.id, kind: 'idea', label: idea.text.trim() || '(empty idea)' })
    }
    return refs
  }, [chapters, bible, ideas])
}

interface Layer0RelationshipsSectionProps {
  projectId: string
  entityId: string
  bookForm?: BookForm
}

/**
 * "Relationships" section inside an entity's edit dialog (`EntityListPanel
 * .tsx`) — lists every `Layer0Relationship` touching this entity, with a
 * remove button, and a small add control (pick another entity across any
 * kind + a free-text label) beneath it. Built at the user's explicit request
 * (2026-08-02: "if the characters are related it could show what that is
 * with the line connection eg daughter/mother") — this is the write side;
 * `BookGraphView.tsx` is the read side that draws the labeled edge.
 *
 * Deliberately its own small component, not folded into `Layer0FieldsForm`
 * — that form is a generic "one text input per config field" renderer with
 * no concept of cross-entity references; relationships need their own
 * picker + list UI that doesn't fit that shape without forcing a ninth,
 * very different `Layer0FieldConfig.type`.
 */
export function Layer0RelationshipsSection({ projectId, entityId, bookForm }: Layer0RelationshipsSectionProps) {
  const relationships = useLayer0Store((s) => s.getBible(projectId).relationships)
  const allRefs = useAllEntityRefs(projectId)
  const refById = useMemo(() => new Map(allRefs.map((r) => [r.id, r])), [allRefs])
  const pickable = useMemo(() => allRefs.filter((r) => r.id !== entityId), [allRefs, entityId])

  const mine = useMemo(() => relationships.filter((r) => r.aId === entityId || r.bId === entityId), [relationships, entityId])

  const [otherId, setOtherId] = useState<string>('')
  const [label, setLabel] = useState('')

  function kindLabel(kind: GraphNodeKind): string {
    if (kind === 'chapter') return 'Chapter'
    if (kind === 'idea') return 'Idea'
    if (kind === 'book') return 'Book'
    return getLayer0KindLabel(kind, bookForm).singular
  }

  function handleAdd() {
    if (!otherId || !label.trim()) return
    const now = new Date().toISOString()
    addLayer0EntityWithHistory(
      projectId,
      'relationships',
      { id: generateId('rel'), aId: entityId, bId: otherId, label: label.trim(), createdAt: now, updatedAt: now } as never,
      'Add relationship',
    )
    setOtherId('')
    setLabel('')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Label>Relationships</Label>
      <p className="text-xs text-text-secondary">
        Connect this to any other character, place, or idea — shows as a labeled line in the Book Graph.
      </p>

      {mine.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {mine.map((rel) => {
            const otherEntityId = rel.aId === entityId ? rel.bId : rel.aId
            const other = refById.get(otherEntityId)
            const OtherIcon = other ? GRAPH_NODE_ICONS[other.kind] : undefined
            return (
              <div key={rel.id} className="flex items-center gap-2 rounded-[var(--radius-button)] border border-border bg-background-secondary px-2.5 py-1.5">
                {OtherIcon && <OtherIcon className="size-3.5 shrink-0 text-text-secondary" />}
                <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                  <span className="font-medium">{other?.label ?? 'Deleted item'}</span>
                  <span className="text-text-secondary"> — {rel.label}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label="Remove relationship"
                  onClick={() => deleteLayer0EntityWithHistory(projectId, 'relationships', rel.id, 'Delete relationship')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {pickable.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <Select value={otherId} onValueChange={setOtherId}>
            <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
              <SelectValue placeholder="Connect to…" />
            </SelectTrigger>
            <SelectContent>
              {pickable.map((ref) => (
                <SelectItem key={ref.id} value={ref.id}>
                  {kindLabel(ref.kind)}: {ref.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. mother / daughter"
            className="h-8 w-40 shrink-0 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          <Button variant="secondary" size="icon" className="size-8 shrink-0" aria-label="Add relationship" disabled={!otherId || !label.trim()} onClick={handleAdd}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Add another character, place, or idea first to connect this to it.</p>
      )}
    </div>
  )
}
