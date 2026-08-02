import { useEffect, useState } from 'react'
import { ArrowRight, ImagePlus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Layer0FieldsForm } from '@/layout/planning/Layer0FieldsForm'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useContentStore } from '@/store/contentStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useAssetStore } from '@/store/assetStore'
import { useImageUpload } from '@/hooks/useImageUpload'
import { updateIdeaWithHistory, deleteIdeaWithHistory, promoteIdeaWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type IdeaStatus } from '@/types/idea'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_LABELS, LAYER0_KIND_TO_COLLECTION, type Layer0EntityKind } from '@/types/layer0'

interface IdeaDetailDialogProps {
  projectId: string
  ideaId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Which field of a promoted entity gets pre-filled with the Idea's own
 * text — the description/body field, never the name/title field (a raw
 * captured thought reads as body text, not as a tidy name). Every kind not
 * listed falls back to its form's `primaryKey`, which only matters for
 * `styleRule` (one field, doubling as both). */
const PREFILL_FIELD: Partial<Record<Layer0EntityKind, string>> = {
  character: 'description',
  location: 'description',
  timelineEvent: 'description',
  glossaryTerm: 'definition',
  reference: 'notes',
  illustrationBrief: 'description',
  researchNote: 'body',
}

/**
 * An Idea's detail view (Develop Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`)
 * — edit the text, set a status, add tags, link related Ideas, jump back to
 * where it was captured, and manually promote it into a real Layer 0
 * entity. A Dialog rather than a separate route/panel, matching
 * `EntityListPanel.tsx`'s own add/edit interaction so Develop has one
 * consistent "click a row, a dialog opens" pattern throughout.
 */
export function IdeaDetailDialog({ projectId, ideaId, open, onOpenChange }: IdeaDetailDialogProps) {
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const idea = ideas.find((i) => i.id === ideaId)
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const setAppMode = useUiStore((s) => s.setAppMode)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const loadAssets = useAssetStore((s) => s.loadAssets)

  const [textDraft, setTextDraft] = useState(idea?.text ?? '')
  const [tagsDraft, setTagsDraft] = useState((idea?.tags ?? []).join(', '))
  const [relatedPickerValue, setRelatedPickerValue] = useState('')
  const [promotingKind, setPromotingKind] = useState<Layer0EntityKind | null>(null)
  const [promoteDraft, setPromoteDraft] = useState<Record<string, string>>({})

  // Develop mode has its own top-level shell (`PlanningShell.tsx`), separate
  // from the editor's `Sidebar.tsx` — which is what normally triggers
  // `loadAssets` on mount. A project opened straight into Develop (e.g. a
  // restored session) might never have mounted that sidebar this session,
  // so reference images picked here wouldn't resolve to a real object URL
  // yet. Idempotent — reloading assets that are already loaded is harmless.
  useEffect(() => {
    loadAssets(projectId)
  }, [projectId, loadAssets])

  const { openPicker: openImagePicker, inputProps: imageInputProps } = useImageUpload(projectId, (assetId) => {
    if (!idea) return
    updateIdeaWithHistory(projectId, ideaId, { imageAssetIds: [...(idea.imageAssetIds ?? []), assetId] }, 'Add reference image')
  })

  if (!idea) return null

  const removeImage = (assetId: string) => {
    updateIdeaWithHistory(projectId, ideaId, { imageAssetIds: (idea.imageAssetIds ?? []).filter((id) => id !== assetId) }, 'Remove reference image')
  }

  const commitText = () => {
    if (textDraft.trim() !== idea.text) updateIdeaWithHistory(projectId, ideaId, { text: textDraft }, 'Edit idea')
  }

  const commitTags = () => {
    const tags = tagsDraft
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    updateIdeaWithHistory(projectId, ideaId, { tags: tags.length > 0 ? tags : undefined }, 'Edit idea tags')
  }

  const setStatus = (status: IdeaStatus) => updateIdeaWithHistory(projectId, ideaId, { status }, 'Change idea status')

  const relatedIdeas = (idea.relatedIdeaIds ?? []).map((id) => ideas.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i)
  const candidateIdeas = ideas.filter((i) => i.id !== ideaId && !(idea.relatedIdeaIds ?? []).includes(i.id))

  const addRelated = (otherId: string) => {
    const other = ideas.find((i) => i.id === otherId)
    if (!other) return
    updateIdeaWithHistory(projectId, ideaId, { relatedIdeaIds: [...(idea.relatedIdeaIds ?? []), otherId] }, 'Link related idea')
    updateIdeaWithHistory(projectId, otherId, { relatedIdeaIds: [...(other.relatedIdeaIds ?? []), ideaId] }, 'Link related idea')
    setRelatedPickerValue('')
  }

  const removeRelated = (otherId: string) => {
    const other = ideas.find((i) => i.id === otherId)
    updateIdeaWithHistory(projectId, ideaId, { relatedIdeaIds: (idea.relatedIdeaIds ?? []).filter((id) => id !== otherId) }, 'Unlink related idea')
    if (other) {
      updateIdeaWithHistory(projectId, otherId, { relatedIdeaIds: (other.relatedIdeaIds ?? []).filter((id) => id !== ideaId) }, 'Unlink related idea')
    }
  }

  const linkedChapter = idea.linkedChapterId ? manuscript?.chapters.find((c) => c.id === idea.linkedChapterId) : undefined

  const jumpToChapter = () => {
    if (!idea.linkedChapterId) return
    onOpenChange(false)
    setAppMode('editor')
    requestScrollToChapter(idea.linkedChapterId)
  }

  const startPromoting = (kind: Layer0EntityKind) => {
    const config = LAYER0_FORM_CONFIG[kind]
    const blank: Record<string, string> = {}
    for (const field of config.fields) blank[field.key] = ''
    const bodyField = PREFILL_FIELD[kind] ?? config.primaryKey
    blank[bodyField] = idea.text
    if (bodyField !== config.primaryKey) {
      // A short working title so the required primaryKey field isn't left
      // empty — the raw captured text is rarely a tidy name on its own.
      blank[config.primaryKey] = idea.text.length > 48 ? `${idea.text.slice(0, 45)}…` : idea.text
    }
    setPromoteDraft(blank)
    setPromotingKind(kind)
  }

  const confirmPromote = () => {
    if (!promotingKind) return
    const config = LAYER0_FORM_CONFIG[promotingKind]
    if (!promoteDraft[config.primaryKey]?.trim()) return
    const collection = LAYER0_KIND_TO_COLLECTION[promotingKind]
    const now = new Date().toISOString()
    const cleaned: Record<string, string | undefined> = {}
    for (const field of config.fields) {
      const value = promoteDraft[field.key]?.trim()
      cleaned[field.key] = value ? value : undefined
    }
    const entity = {
      id: generateId(promotingKind),
      createdAt: now,
      updatedAt: now,
      ...(promotingKind === 'timelineEvent' ? { order: 0 } : {}),
      ...cleaned,
    }
    promoteIdeaWithHistory(projectId, ideaId, promotingKind, collection, entity as never, `Turn idea into ${LAYER0_KIND_LABELS[promotingKind].singular.toLowerCase()}`)
    setPromotingKind(null)
  }

  const handleDelete = () => {
    deleteIdeaWithHistory(projectId, ideaId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Idea</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idea-text">Thought</Label>
            <Textarea id="idea-text" rows={3} value={textDraft} onChange={(e) => setTextDraft(e.target.value)} onBlur={commitText} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={idea.status} onValueChange={(v) => setStatus(v as IdeaStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {IDEA_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idea-tags">Tags</Label>
            <Input id="idea-tags" placeholder="comma, separated, tags" value={tagsDraft} onChange={(e) => setTagsDraft(e.target.value)} onBlur={commitTags} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reference images</Label>
            {(idea.imageAssetIds ?? []).length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {(idea.imageAssetIds ?? []).map((assetId) => {
                  const url = getObjectUrl(assetId)
                  return (
                    <div
                      key={assetId}
                      className="group/thumb relative aspect-square overflow-hidden rounded-[var(--radius-button)] border border-border bg-background-secondary"
                    >
                      {url && <img src={url} alt="" className="size-full object-cover" />}
                      <button
                        type="button"
                        onClick={() => removeImage(assetId)}
                        aria-label="Remove reference image"
                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-text-secondary opacity-0 transition-opacity duration-150 hover:text-danger group-hover/thumb:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={openImagePicker}>
              <ImagePlus className="size-3.5" />
              Add reference image
            </Button>
            <input {...imageInputProps} />
          </div>

          {linkedChapter && (
            <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={jumpToChapter}>
              <ArrowRight className="size-3.5" />
              Jump to {linkedChapter.title}
            </Button>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Related ideas</Label>
            {relatedIdeas.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {relatedIdeas.map((related) => (
                  <div key={related.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-button)] border border-border bg-background-secondary px-2.5 py-1.5">
                    <span className="line-clamp-1 text-xs text-text-secondary">{related.text || '(empty)'}</span>
                    <button type="button" onClick={() => removeRelated(related.id)} aria-label="Unlink" className="shrink-0 text-text-muted hover:text-text-primary">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {candidateIdeas.length > 0 && (
              <Select value={relatedPickerValue} onValueChange={addRelated}>
                <SelectTrigger>
                  <SelectValue placeholder="Link another idea…" />
                </SelectTrigger>
                <SelectContent>
                  {candidateIdeas.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {(candidate.text || '(empty)').slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            {idea.promotedTo ? (
              <p className="text-sm text-text-secondary">
                Promoted to a <span className="font-medium text-text-primary">{LAYER0_KIND_LABELS[idea.promotedTo.kind].singular}</span>.
              </p>
            ) : promotingKind ? (
              <div className="flex flex-col gap-3">
                <Label>New {LAYER0_KIND_LABELS[promotingKind].singular.toLowerCase()}</Label>
                <Layer0FieldsForm
                  fields={LAYER0_FORM_CONFIG[promotingKind].fields}
                  draft={promoteDraft}
                  onChange={(key, value) => setPromoteDraft((d) => ({ ...d, [key]: value }))}
                  idPrefix="idea-promote"
                />
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPromotingKind(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={confirmPromote}
                    disabled={!promoteDraft[LAYER0_FORM_CONFIG[promotingKind].primaryKey]?.trim()}
                  >
                    Add {LAYER0_KIND_LABELS[promotingKind].singular.toLowerCase()}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Label>Turn into…</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LAYER0_ENTITY_KINDS.map((kind) => (
                    <Button key={kind} type="button" variant="outline" size="sm" onClick={() => startPromoting(kind)}>
                      {LAYER0_KIND_LABELS[kind].singular}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-danger hover:text-danger" onClick={handleDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
