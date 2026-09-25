import { useState } from 'react'
import { Check, LayoutTemplate, Pencil, Trash2, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { useTemplateStore } from '@/store/templateStore'
import type { BookTemplate } from '@/types/bookTemplate'

interface ManageTemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function summarise(template: BookTemplate): string {
  const pages = `${template.structuralPages.length} page${template.structuralPages.length === 1 ? '' : 's'}`
  const text = template.includesContent ? 'with their text' : 'without text'
  const saved = new Date(template.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${pages}, ${text} · saved ${saved}`
}

/**
 * The curation half of book templates.
 *
 * `templateStore` has had `renameTemplate` and `deleteTemplate` since the
 * feature shipped, but nothing in the UI reached them: a template could be
 * created from the toolbar and picked in the New Project dialog, and then
 * lived forever under whatever name it was given on the day. A typo in a
 * series template is a typo you see every time you start a volume.
 *
 * Deliberately a plain list rather than a preview grid like `ThemeGallery`.
 * A theme's whole identity is visual, so a card that renders it is the point;
 * a template is page setup plus a structural-page set, and its identity is
 * what it *contains* — which is a sentence, not a picture.
 */
export function ManageTemplatesDialog({ open, onOpenChange }: ManageTemplatesDialogProps) {
  const templates = useTemplateStore((s) => s.templates)
  const renameTemplate = useTemplateStore((s) => s.renameTemplate)
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [pendingDelete, setPendingDelete] = useState<BookTemplate | null>(null)

  const startEditing = (template: BookTemplate) => {
    setEditingId(template.id)
    setDraftName(template.name)
    setDraftDescription(template.description)
  }

  const commitEditing = () => {
    if (!editingId) return
    const name = draftName.trim()
    // An empty name would leave a row you cannot tell apart from any other,
    // so a blank is treated as "no change" rather than as a rename.
    if (name) renameTemplate(editingId, name, draftDescription.trim())
    setEditingId(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="size-4" />
              Saved templates
            </DialogTitle>
            <DialogDescription>
              Rename or remove the series templates available when you start a new book.
              Deleting one never touches a project that was created from it.
            </DialogDescription>
          </DialogHeader>

          {templates.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No saved templates"
              description="Save a book's page setup, theme and structural pages as a template and it will appear here, ready for the next volume."
              className="py-10"
            />
          ) : (
            <ul className="flex max-h-[min(24rem,55vh)] flex-col gap-2 overflow-y-auto">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-3"
                >
                  {editingId === template.id ? (
                    <div className="flex flex-col gap-2">
                      <Input
                        autoFocus
                        aria-label="Template name"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEditing()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                      <Textarea
                        rows={2}
                        aria-label="Template description"
                        placeholder="What this template is for, and when to use it."
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditingId(null)}>
                          <X className="size-3.5" />
                          Cancel
                        </Button>
                        <Button variant="primary" size="sm" className="gap-1.5" onClick={commitEditing}>
                          <Check className="size-3.5" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{template.name}</p>
                        {template.description && (
                          <p className="mt-0.5 text-xs text-text-secondary">{template.description}</p>
                        )}
                        <p className="mt-1 text-xs text-text-muted">{summarise(template)}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${template.name}`}
                          onClick={() => startEditing(template)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${template.name}`}
                          className="hover:text-danger"
                          onClick={() => setPendingDelete(template)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        title={`Delete ${pendingDelete?.name ?? 'this template'}?`}
        description="The template is removed from every project on this device. Books already created from it keep their pages and design."
        confirmLabel="Delete template"
        onConfirm={() => {
          if (pendingDelete) deleteTemplate(pendingDelete.id)
        }}
      />
    </>
  )
}
