import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProjectStore } from '@/store/projectStore'
import { CATEGORY_TEMPLATES, seedProjectTemplate } from '@/data/projectTemplates'
import { addIdeaWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import type { Idea } from '@/types/idea'
import type { ProjectCategory } from '@/types'

const CATEGORIES: { id: ProjectCategory; label: string }[] = [
  { id: 'novel', label: 'Novel' },
  { id: 'nonfiction', label: 'Non-fiction' },
  { id: 'childrens', label: "Children's Book" },
  { id: 'educational', label: 'Educational' },
  { id: 'coffee-table', label: 'Coffee Table' },
  { id: 'nature', label: 'Nature' },
  { id: 'scientific', label: 'Scientific' },
  { id: 'other', label: 'Other' },
]

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const navigate = useNavigate()
  const createProject = useProjectStore((s) => s.createProject)
  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings)
  const [idea, setIdea] = useState('')
  // `undefined` — not a pre-selected default — is what makes category
  // genuinely optional (Develop Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`):
  // the trim-size default and example-entry seeding below only run if the
  // author actually picked something, rather than silently applying
  // whatever category happened to be selected first.
  const [category, setCategory] = useState<ProjectCategory | undefined>(undefined)

  const reset = () => {
    setIdea('')
    setCategory(undefined)
  }

  const handleCreate = () => {
    const project = createProject(idea, category ?? 'other')
    if (category) {
      // Category-driven starting template — trim size default plus a few
      // clearly-marked example Develop entries, per `docs/ROADMAP.md`'s
      // "decides which Layer 0 entity subset a new project starts with."
      // See `data/projectTemplates.ts` for why this stops well short of
      // the full per-genre relabeling `docs/AI_WORKSPACE_VISION.md`
      // explicitly defers. Skipped entirely when no category was chosen —
      // `createProject`'s own `DEFAULT_PROJECT_SETTINGS` trim size applies
      // instead, and Develop starts with zero example entities rather than
      // presuming a genre the author never picked.
      updateProjectSettings(project.id, { trimSize: CATEGORY_TEMPLATES[category].trimSize })
      seedProjectTemplate(project.id, category)
    }
    // The words that created this project become its first captured Idea
    // — capture-first in practice, not just in principle: the very first
    // thing a new project has in Develop is the thought that started it,
    // with no extra step required to put it there.
    const now = new Date().toISOString()
    const firstIdea: Idea = { id: generateId('idea'), text: idea, createdAt: now, updatedAt: now, status: 'new' }
    addIdeaWithHistory(project.id, firstIdea, 'Capture idea')
    onOpenChange(false)
    reset()
    navigate(`/project/${project.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>What's the idea? You can change everything later.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-idea">What's the idea?</Label>
            <Input
              id="new-project-idea"
              autoFocus
              placeholder="e.g. A field guide to garden birds, or just a first line…"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && idea.trim()) handleCreate()
              }}
            />
            <p className="text-xs text-text-secondary">This becomes your project's title, and its first Idea in Develop.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category (optional)</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProjectCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Skip for now — decide later" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-secondary">
              {category
                ? "We'll set a matching trim size and add a few example Develop entries you can edit or delete — nothing is exported until you write it yourself."
                : 'Pick this now if you know it, or leave it and set it later from Project Settings.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!idea.trim()}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
