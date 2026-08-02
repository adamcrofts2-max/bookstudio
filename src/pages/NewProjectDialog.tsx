import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpenText, HelpCircle, Notebook } from 'lucide-react'

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
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { CATEGORY_TEMPLATES, seedProjectTemplate } from '@/data/projectTemplates'
import { addIdeaWithHistory } from '@/store/editorActions'
import { generateId } from '@/utils'
import type { Idea } from '@/types/idea'
import type { BookForm, ProjectCategory } from '@/types'

const CATEGORIES: { id: ProjectCategory; label: string; form: BookForm | 'either' }[] = [
  { id: 'novel', label: 'Novel', form: 'fiction' },
  { id: 'childrens', label: "Children's Book", form: 'fiction' },
  { id: 'nonfiction', label: 'General Non-fiction', form: 'nonfiction' },
  { id: 'educational', label: 'Educational', form: 'nonfiction' },
  { id: 'coffee-table', label: 'Coffee Table', form: 'nonfiction' },
  { id: 'nature', label: 'Nature', form: 'nonfiction' },
  { id: 'scientific', label: 'Scientific', form: 'nonfiction' },
  { id: 'other', label: 'Other', form: 'either' },
]

/** The three-way choice (Phase 83, `docs/IDEA_SYSTEM_PLAN.md` Milestone
 * 1.1) that decides which Develop labels/templates a project sees —
 * `undefined` ("Not sure yet") is a real, equally-valid third option, not a
 * placeholder for the other two. See `types/project.ts`'s `BookForm` doc
 * comment for why this is separate from `category` and always editable
 * later from Project Settings, never a one-time gate. */
const BOOK_FORM_OPTIONS: { id: BookForm | undefined; label: string; hint: string; icon: typeof BookOpenText }[] = [
  { id: 'fiction', label: 'Fiction', hint: 'A story — novel, children’s book, memoir-as-narrative', icon: BookOpenText },
  { id: 'nonfiction', label: 'Non-fiction', hint: 'Informational, instructional, or reference', icon: Notebook },
  { id: undefined, label: 'Not sure yet', hint: 'Decide later from Project Settings', icon: HelpCircle },
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
  // Also genuinely three-valued — `undefined` is "Not sure yet", a real
  // choice, not "hasn't answered yet". See `BOOK_FORM_OPTIONS` above.
  const [bookForm, setBookForm] = useState<BookForm | undefined>(undefined)
  // `undefined` — not a pre-selected default — is what makes category
  // genuinely optional (Develop Milestone 1, `docs/IDEA_SYSTEM_PLAN.md`):
  // the trim-size default and example-entry seeding below only run if the
  // author actually picked something, rather than silently applying
  // whatever category happened to be selected first.
  const [category, setCategory] = useState<ProjectCategory | undefined>(undefined)

  // Narrows the category list to whichever form was picked, "Other" always
  // included since it's ambiguous by design. Picking a form after already
  // choosing a category that no longer fits (e.g. "Novel" then switching to
  // Non-fiction) clears it rather than leaving a mismatched selection sitting
  // in the dropdown silently.
  const visibleCategories = CATEGORIES.filter((c) => !bookForm || c.form === bookForm || c.form === 'either')

  const reset = () => {
    setIdea('')
    setBookForm(undefined)
    setCategory(undefined)
  }

  const handlePickBookForm = (next: BookForm | undefined) => {
    setBookForm(next)
    const stillFits = CATEGORIES.find((c) => c.id === category)
    if (category && next && stillFits && stillFits.form !== next && stillFits.form !== 'either') {
      setCategory(undefined)
    }
  }

  const handleCreate = () => {
    const project = createProject(idea, category ?? 'other', bookForm)
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
            <Label>Fiction or non-fiction?</Label>
            <div className="grid grid-cols-3 gap-2">
              {BOOK_FORM_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => handlePickBookForm(opt.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] border p-3 text-center transition-colors duration-150',
                    bookForm === opt.id
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-border hover:bg-hover',
                  )}
                >
                  <opt.icon className={cn('size-4', bookForm === opt.id ? 'text-[var(--color-accent)]' : 'text-text-secondary')} />
                  <span className={cn('text-xs font-medium', bookForm === opt.id ? 'text-[var(--color-accent)]' : 'text-text-primary')}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-secondary">
              Decides how Develop labels things and which templates it offers — never a data change, and always editable later from Project Settings.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category (optional)</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProjectCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Skip for now — decide later" />
              </SelectTrigger>
              <SelectContent>
                {visibleCategories.map((c) => (
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
