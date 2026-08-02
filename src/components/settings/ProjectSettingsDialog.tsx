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
import { ThemeGallery } from '@/components/settings/ThemeGallery'
import type { BookForm, Project, TrimSize } from '@/types'
import { DEFAULT_STYLE_GUIDE } from '@/virtualEditor/types'
import type { StyleGuide } from '@/virtualEditor/types'

/** Sentinel for "Not sure yet" (`bookForm === undefined`) — Radix `Select`
 * requires non-empty string values, so `undefined` can't be a value
 * directly; this is translated back to `undefined` in the `onValueChange`
 * handler below. See `types/project.ts`'s `BookForm` doc comment. */
const BOOK_FORM_UNSET = 'unset'
const BOOK_FORM_OPTIONS: { id: BookForm | typeof BOOK_FORM_UNSET; label: string }[] = [
  { id: 'fiction', label: 'Fiction' },
  { id: 'nonfiction', label: 'Non-fiction' },
  { id: BOOK_FORM_UNSET, label: 'Not sure yet' },
]

const TRIM_SIZES: { id: TrimSize; label: string }[] = [
  { id: '5x8', label: '5 × 8 in — Mass market' },
  { id: '5.5x8.5', label: '5.5 × 8.5 in — Digest' },
  { id: '6x9', label: '6 × 9 in — Trade' },
  { id: '7x10', label: '7 × 10 in — Workbook' },
  { id: '8.5x11', label: '8.5 × 11 in — Letter' },
]

const ENGLISH_VARIANT_OPTIONS: { id: StyleGuide['englishVariant']; label: string }[] = [
  { id: 'british', label: 'British' },
  { id: 'american', label: 'American' },
]

const OXFORD_COMMA_OPTIONS: { id: StyleGuide['oxfordComma']; label: string }[] = [
  { id: 'require', label: 'Always use' },
  { id: 'forbid', label: 'Never use' },
  { id: 'no-preference', label: 'No preference' },
]

const QUOTE_STYLE_OPTIONS: { id: StyleGuide['quoteStyle']; label: string }[] = [
  { id: 'curly', label: 'Curly ("smart") quotes' },
  { id: 'straight', label: 'Straight quotes' },
  { id: 'no-preference', label: 'No preference' },
]

const HEADING_CAPITALISATION_OPTIONS: { id: StyleGuide['headingCapitalisation']; label: string }[] = [
  { id: 'title-case', label: 'Title Case' },
  { id: 'sentence-case', label: 'Sentence case' },
  { id: 'no-preference', label: 'No preference' },
]

const MEASUREMENT_UNITS_OPTIONS: { id: StyleGuide['measurementUnits']; label: string }[] = [
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
  { id: 'no-preference', label: 'No preference' },
]

const DATE_FORMAT_OPTIONS: { id: StyleGuide['dateFormat']; label: string }[] = [
  { id: 'day-month-year', label: 'Day–Month–Year (31 July 2026)' },
  { id: 'month-day-year', label: 'Month–Day–Year (July 31, 2026)' },
  { id: 'no-preference', label: 'No preference' },
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
  const setProjectBookForm = useProjectStore((s) => s.setProjectBookForm)
  const [name, setName] = useState(project.name)

  const { settings } = project
  // Absent for every project persisted before this field existed — never
  // migrated, always defaulted at the read site, same pattern as
  // `ImageBlock`'s optional fields in `src/types/content.ts`.
  const styleGuide = settings.styleGuide ?? DEFAULT_STYLE_GUIDE

  /** Merges one field into the current style guide (spreading it first,
   * exactly like the margin fields below spread `settings.margins`) since
   * `updateProjectSettings` only shallow-merges at the top level of
   * `ProjectSettings` — it can't merge one field deep into `styleGuide` on
   * its own. */
  function updateStyleGuideField<K extends keyof StyleGuide>(field: K, value: StyleGuide[K]) {
    updateProjectSettings(project.id, { styleGuide: { ...styleGuide, [field]: value } })
  }

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

          <div className="flex flex-col gap-1.5">
            <Label>Fiction or non-fiction?</Label>
            <Select
              value={project.bookForm ?? BOOK_FORM_UNSET}
              onValueChange={(value) =>
                setProjectBookForm(project.id, value === BOOK_FORM_UNSET ? undefined : (value as BookForm))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_FORM_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-secondary">Decides how Develop labels things and which templates it offers — never a data change.</p>
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

          <div className="flex flex-col gap-1.5">
            <Label>Colour profile</Label>
            <Select
              value={settings.colorProfile ?? 'rgb'}
              onValueChange={(value) =>
                updateProjectSettings(project.id, { colorProfile: value as 'rgb' | 'cmyk' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rgb">RGB — screen &amp; Amazon KDP</SelectItem>
                <SelectItem value="cmyk">CMYK — commercial offset &amp; IngramSpark</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-text-secondary">
              Colour space for PDF export. RGB is what KDP recommends and what most print-on-demand
              printers expect. Switch to CMYK for commercial offset printers or IngramSpark's
              print-ready spec — solid fills, text and rules convert to press separations; embedded
              photos stay RGB either way.
            </p>
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Theme</Label>
            <ThemeGallery
              value={settings.themeId}
              onChange={(themeId) => updateProjectSettings(project.id, { themeId })}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label className="text-sm font-medium text-text-primary">Style Guide</Label>
              <p className="text-xs text-text-secondary">
                Editorial preferences the Virtual Editor's checkers consult when reviewing this project. Leaving a
                field on "No preference" keeps that checker's existing behaviour unchanged.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>English variant</Label>
                <Select
                  value={styleGuide.englishVariant}
                  onValueChange={(value) => updateStyleGuideField('englishVariant', value as StyleGuide['englishVariant'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGLISH_VARIANT_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Oxford comma</Label>
                <Select
                  value={styleGuide.oxfordComma}
                  onValueChange={(value) => updateStyleGuideField('oxfordComma', value as StyleGuide['oxfordComma'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OXFORD_COMMA_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Quote style</Label>
                <Select
                  value={styleGuide.quoteStyle}
                  onValueChange={(value) => updateStyleGuideField('quoteStyle', value as StyleGuide['quoteStyle'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTE_STYLE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Heading capitalisation</Label>
                <Select
                  value={styleGuide.headingCapitalisation}
                  onValueChange={(value) =>
                    updateStyleGuideField('headingCapitalisation', value as StyleGuide['headingCapitalisation'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADING_CAPITALISATION_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Measurement units</Label>
                <Select
                  value={styleGuide.measurementUnits}
                  onValueChange={(value) =>
                    updateStyleGuideField('measurementUnits', value as StyleGuide['measurementUnits'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASUREMENT_UNITS_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Date format</Label>
                <Select
                  value={styleGuide.dateFormat}
                  onValueChange={(value) => updateStyleGuideField('dateFormat', value as StyleGuide['dateFormat'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
