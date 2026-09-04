import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GRAPH_NODE_ICONS } from '@/layout/planning/graphIcons'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import { addIdeaWithHistory, addLayer0EntityWithHistory } from '@/store/editorActions'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_TO_COLLECTION, getLayer0KindLabel, type Layer0EntityKind } from '@/types/layer0'
import { generateId } from '@/utils'
import type { BookForm } from '@/types'

/** Every kind this dialog can create. Deliberately NOT `GraphNodeKind`:
 *
 * - `chapter` is Layer 2 (Content) data. `types/layer0.ts`'s own doc comment
 *   states the one-way boundary — Layer 0 is upstream of Content and nothing
 *   here is manuscript text — and `CLAUDE.md` forbids one layer mutating
 *   another's data. The Book Graph is a Layer 0 planning view, so it reads
 *   chapters and never writes them; chapters are added in Write mode, where
 *   the manuscript actually lives.
 * - `book` is the synthetic hub node, one per project. There is nothing to
 *   create.
 *
 * Everything else is a single-required-field create, which is what makes a
 * quick-add on a canvas honest rather than a half-filled record. */
export type AddableNodeKind = Layer0EntityKind | 'idea'

const ADDABLE_NODE_KINDS: AddableNodeKind[] = [...LAYER0_ENTITY_KINDS, 'idea']

/** The one kind whose type requires a second field (`GlossaryTerm.definition`
 * is not optional). Everything else is valid from its primary field alone, so
 * the quick-add form stays one input for seven kinds out of nine. */
const EXTRA_REQUIRED_KEY: Partial<Record<AddableNodeKind, string>> = { glossaryTerm: 'definition' }

interface AddGraphNodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  bookForm?: BookForm
  /** How many timeline events already exist — a new one is appended at the
   * end, matching `EntityListPanel`'s own `order: entities.length`. */
  timelineEventCount: number
  /** The currently selected node, if any. Offering to link the new node to it
   * is the whole reason to add from the graph rather than from a list: you
   * are already looking at what the new thing relates to. */
  connectTo?: { id: string; label: string } | null
  /** Called with the new node's id and the relationship label (empty for no
   * link) so the caller can pin its position and create the edge — placement
   * and edge creation both need graph state this dialog doesn't own. */
  onCreate: (nodeId: string, relationshipLabel: string) => void
}

export function AddGraphNodeDialog({
  open,
  onOpenChange,
  projectId,
  bookForm,
  timelineEventCount,
  connectTo,
  onCreate,
}: AddGraphNodeDialogProps) {
  const [kind, setKind] = useState<AddableNodeKind | null>(null)
  const [primary, setPrimary] = useState('')
  const [extra, setExtra] = useState('')
  const [relationship, setRelationship] = useState('')

  // Reset on every open so the dialog never reappears holding a previous
  // attempt's half-typed text.
  useEffect(() => {
    if (!open) return
    setKind(null)
    setPrimary('')
    setExtra('')
    setRelationship('')
  }, [open])

  function labelFor(k: AddableNodeKind): string {
    return k === 'idea' ? 'Idea' : getLayer0KindLabel(k, bookForm).singular
  }

  const extraKey = kind ? EXTRA_REQUIRED_KEY[kind] : undefined
  const canCreate = primary.trim().length > 0 && (!extraKey || extra.trim().length > 0)

  function create() {
    if (!kind || !canCreate) return
    const now = new Date().toISOString()
    const id = generateId(kind)
    const value = primary.trim()

    if (kind === 'idea') {
      addIdeaWithHistory(projectId, { id, text: value, createdAt: now, updatedAt: now, status: 'new' }, 'Add idea')
    } else {
      const config = LAYER0_FORM_CONFIG[kind]
      const entity = {
        id,
        createdAt: now,
        updatedAt: now,
        // Mirrors `EntityListPanel.save()` exactly — the canonical add path.
        ...(kind === 'timelineEvent' ? { order: timelineEventCount } : {}),
        [config.primaryKey]: value,
        ...(extraKey ? { [extraKey]: extra.trim() } : {}),
      }
      addLayer0EntityWithHistory(
        projectId,
        LAYER0_KIND_TO_COLLECTION[kind],
        entity as never,
        `Add ${labelFor(kind).toLowerCase()}`,
      )
    }

    onCreate(id, connectTo ? relationship.trim() : '')
    onOpenChange(false)
  }

  const primaryField = kind && kind !== 'idea' ? LAYER0_FORM_CONFIG[kind].fields.find((f) => f.key === LAYER0_FORM_CONFIG[kind].primaryKey) : undefined
  const extraField = kind && kind !== 'idea' && extraKey ? LAYER0_FORM_CONFIG[kind].fields.find((f) => f.key === extraKey) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind ? `New ${labelFor(kind).toLowerCase()}` : 'Add to the graph'}</DialogTitle>
          <DialogDescription>
            {kind
              ? connectTo
                ? `It will be placed next to “${connectTo.label}”.`
                : 'It will be placed in the middle of the view.'
              : 'Pick what you want to add. Chapters are added in Write mode, where the manuscript lives.'}
          </DialogDescription>
        </DialogHeader>

        {!kind ? (
          <div className="grid grid-cols-2 gap-2">
            {ADDABLE_NODE_KINDS.map((k) => {
              const Icon = GRAPH_NODE_ICONS[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-button)] border border-border bg-panel px-3 py-2.5 text-left text-sm',
                    'text-text-primary transition-colors hover:bg-hover',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-text-secondary" />
                  <span className="truncate">{labelFor(k)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-node-primary">{kind === 'idea' ? 'Idea' : (primaryField?.label ?? 'Name')}</Label>
              <Input
                id="add-node-primary"
                autoFocus
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                placeholder={kind === 'idea' ? 'What if…' : (primaryField?.placeholder ?? '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !extraKey && canCreate) create()
                }}
              />
            </div>

            {extraKey && (
              <div className="space-y-1.5">
                <Label htmlFor="add-node-extra">{extraField?.label ?? 'Definition'}</Label>
                <Textarea
                  id="add-node-extra"
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder={extraField?.placeholder ?? ''}
                  rows={3}
                />
              </div>
            )}

            {connectTo && (
              <div className="space-y-1.5">
                <Label htmlFor="add-node-relationship">Relationship to “{connectTo.label}”</Label>
                <Input
                  id="add-node-relationship"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g. lives in, mentor of — leave blank for no link"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canCreate) create()
                  }}
                />
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setKind(null)}>
                Back
              </Button>
              <Button onClick={create} disabled={!canCreate}>
                Add {labelFor(kind).toLowerCase()}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
