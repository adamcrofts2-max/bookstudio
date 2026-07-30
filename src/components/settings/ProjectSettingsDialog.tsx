import { useState } from 'react'

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
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProjectStore } from '@/store/projectStore'
import { BUILT_IN_THEMES } from '@/types/theme'
import type { Project, TrimSize } from '@/types'

const TRIM_SIZES: { id: TrimSize; label: string }[] = [
  { id: '5x8', label: '5 × 8 in — Mass market' },
  { id: '5.5x8.5', label: '5.5 × 8.5 in — Digest' },
  { id: '6x9', label: '6 × 9 in — Trade' },
  { id: '7x10', label: '7 × 10 in — Workbook' },
  { id: '8.5x11', label: '8.5 × 11 in — Letter' },
]

interface ProjectSettingsDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Project-level settings: identity, page geometry, theme. Never touches manuscript content. */
export function ProjectSettingsDialog({ project, open, onOpenChange }: ProjectSettingsDialogProps) {
  const renameProject = useProjectStore((s) => s.renameProject)
  const updateProjectSettings = useProjectStore((s) => s.updateProjectSettings)
  const [name, setName] = useState(project.name)

  const { settings } = project

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && name.trim() && name !== project.name) {
          renameProject(project.id, name)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            These control page geometry and presentation. Your manuscript and illustrations are
            never affected.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Trim size</Label>
            <Select
              value={settings.trimSize}
              onValueChange={(value) =>
                updateProjectSettings(project.id, { trimSize: value as TrimSize })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIM_SIZES.map((size) => (
                  <SelectItem key={size.id} value={size.id}>
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="margin-inner">Inner margin (mm)</Label>
              <Input
                id="margin-inner"
                type="number"
                min={0}
                value={settings.margins.inner}
                onChange={(e) =>
                  updateProjectSettings(project.id, {
                    margins: { ...settings.margins, inner: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="margin-outer">Outer margin (mm)</Label>
              <Input
                id="margin-outer"
                type="number"
                min={0}
                value={settings.margins.outer}
                onChange={(e) =>
                  updateProjectSettings(project.id, {
                    margins: { ...settings.margins, outer: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="margin-top">Top margin (mm)</Label>
              <Input
                id="margin-top"
                type="number"
                min={0}
                value={settings.margins.top}
                onChange={(e) =>
                  updateProjectSettings(project.id, {
                    margins: { ...settings.margins, top: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="margin-bottom">Bottom margin (mm)</Label>
              <Input
                id="margin-bottom"
                type="number"
                min={0}
                value={settings.margins.bottom}
                onChange={(e) =>
                  updateProjectSettings(project.id, {
                    margins: { ...settings.margins, bottom: Number(e.target.value) },
                  })
                }
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Theme</Label>
            <Select
              value={settings.themeId}
              onValueChange={(value) => updateProjectSettings(project.id, { themeId: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILT_IN_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
