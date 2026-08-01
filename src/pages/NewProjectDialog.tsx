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
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ProjectCategory>('novel')

  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings)

  const handleCreate = () => {
    const project = createProject(name, category)
    // Category-driven starting template — trim size default plus a few
    // clearly-marked example Planning entries, per `docs/ROADMAP.md`'s
    // "decides which Layer 0 entity subset a new project starts with." See
    // `data/projectTemplates.ts` for why this stops well short of the full
    // per-genre relabeling `docs/AI_WORKSPACE_VISION.md` explicitly defers.
    updateProjectSettings(project.id, { trimSize: CATEGORY_TEMPLATES[category].trimSize })
    seedProjectTemplate(project.id, category)
    onOpenChange(false)
    setName('')
    setCategory('novel')
    navigate(`/project/${project.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Give your book a name. You can change everything later.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-name">Book title</Label>
            <Input
              id="new-project-name"
              autoFocus
              placeholder="e.g. The Wildflower Field Guide"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) handleCreate()
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProjectCategory)}>
              <SelectTrigger>
                <SelectValue />
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
              We'll set a matching trim size and add a few example Planning entries you can edit or delete — nothing
              is exported until you write it yourself.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={!name.trim()}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
