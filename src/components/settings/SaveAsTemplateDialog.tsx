import { useEffect, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useTemplateStore } from '@/store/templateStore'
import { useCustomThemeStore } from '@/store/customThemeStore'
import { EMPTY_STRUCTURAL_PAGES, useStructuralPageStore } from '@/store/structuralPageStore'
import { buildTemplate } from '@/templates/buildTemplate'
import type { Project } from '@/types'

interface SaveAsTemplateDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "Save as template" — captures this project's page setup, theme and full
 * structural-page set as a reusable series template (`docs/ROADMAP.md`
 * Phase E). Never captures the manuscript: a template is presentation and
 * structure, and chapters belong to one book only.
 */
export function SaveAsTemplateDialog({ project, open, onOpenChange }: SaveAsTemplateDialogProps) {
  const addTemplate = useTemplateStore((s) => s.addTemplate)
  const customThemes = useCustomThemeStore((s) => s.customThemes)
  const structuralPages = useStructuralPageStore((s) => s.byProject[project.id]) ?? EMPTY_STRUCTURAL_PAGES

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [includeContent, setIncludeContent] = useState(true)
  const [saved, setSaved] = useState(false)

  // Reset every time the dialog opens so a previous save never leaks into
  // the next one.
  useEffect(() => {
    if (open) {
      setName(`${project.name} template`)
      setDescription('')
      setIncludeContent(true)
      setSaved(false)
    }
  }, [open, project.name])

  const handleSave = () => {
    const customTheme = customThemes.find((t) => t.id === project.settings.themeId) ?? null
    addTemplate(
      buildTemplate({
        name: name.trim() || `${project.name} template`,
        description,
        settings: project.settings,
        category: project.category,
        bookForm: project.bookForm,
        customTheme,
        structuralPages,
        includeContent,
      }),
    )
    setSaved(true)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="size-4" />
            Save as template
          </DialogTitle>
          <DialogDescription>
            Reuse this book's page setup, theme and structural pages for the next volume in the series.
            The manuscript is never included.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Hidden Library — standard hardback"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for, and when to use it."
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/40 p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="template-include-content" className="cursor-pointer">
                Keep page text
              </Label>
              <p className="text-xs text-muted-foreground">
                {includeContent
                  ? 'Imprint boilerplate, copyright wording and back-cover copy come with the template.'
                  : 'Page types and design only — every page starts empty.'}
              </p>
            </div>
            <Switch id="template-include-content" checked={includeContent} onCheckedChange={setIncludeContent} />
          </div>

          <p className="text-xs text-muted-foreground">
            {structuralPages.length} structural page{structuralPages.length === 1 ? '' : 's'} will be saved.
            Cover images aren't included — artwork is per-title, and image assets belong to the project they
            were imported into.
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saved}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
