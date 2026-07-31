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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCustomThemeStore, type CustomTheme } from '@/store/customThemeStore'
import type { ResolvedBookTheme } from '@/theme/presets'

/** The only two font families this app self-hosts and embeds in exported
 * PDFs (`pdf/fonts.ts`'s `loadThemeFonts`). A custom theme is restricted to
 * choosing between these for heading/body — never a free-text field — so
 * the on-screen preview and the exported PDF always match exactly. See
 * `customThemeStore.ts`'s doc comment for the full reasoning. */
const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: '"Inter", sans-serif', label: 'Inter (sans-serif)' },
  { value: '"Source Serif 4", serif', label: 'Source Serif 4 (serif)' },
]

const NUMBER_LABEL_OPTIONS: { value: ResolvedBookTheme['chapterOpener']['numberLabel']; label: string }[] = [
  { value: 'word', label: 'Word ("Chapter One")' },
  { value: 'numeral', label: 'Numeral ("1")' },
  { value: 'none', label: 'None' },
]

const HEADING_WEIGHT_OPTIONS = [400, 500, 600, 700]

interface CustomThemeEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing an existing custom theme; absent when creating a
   * new one. */
  editingTheme?: CustomTheme
  /** Called with the saved theme's id once the user hits Save, so the
   * caller (`ThemeGallery.tsx`) can immediately apply it via `onChange` —
   * matches this app's "every action should feel immediate" principle. */
  onSaved: (themeId: string) => void
}

const DEFAULT_DRAFT: Omit<CustomTheme, 'id' | 'isCustom'> = {
  name: 'My Theme',
  description: 'Custom theme',
  page: { background: '#ffffff', ink: '#1a1a1a', mutedInk: '#666666', accent: '#2e6f8e', ruleColor: '#e3e3e3' },
  fonts: { heading: '"Inter", sans-serif', body: '"Inter", sans-serif' },
  typography: { bodySize: 16, lineHeight: 1.65, justify: false, dropCap: false, headingWeight: 600 },
  chapterOpener: { numberLabel: 'numeral', topSpacer: 110 },
}

/**
 * Create or edit a custom theme: colours, the two embeddable font families,
 * typography rhythm, and chapter-opener style. Margins are deliberately not
 * here — margins are Project settings (Layer 1), already fully customisable
 * per-project regardless of theme, per `docs/SYSTEM_ARCHITECTURE.md`'s layer
 * split; a "theme" only ever controls presentation (Layer 3).
 */
export function CustomThemeEditorDialog({ open, onOpenChange, editingTheme, onSaved }: CustomThemeEditorDialogProps) {
  const addCustomTheme = useCustomThemeStore((s) => s.addCustomTheme)
  const updateCustomTheme = useCustomThemeStore((s) => s.updateCustomTheme)

  const [draft, setDraft] = useState<Omit<CustomTheme, 'id' | 'isCustom'>>(
    editingTheme
      ? { name: editingTheme.name, description: editingTheme.description, page: editingTheme.page, fonts: editingTheme.fonts, typography: editingTheme.typography, chapterOpener: editingTheme.chapterOpener }
      : DEFAULT_DRAFT,
  )

  function reset(next: boolean) {
    if (next) {
      setDraft(
        editingTheme
          ? { name: editingTheme.name, description: editingTheme.description, page: editingTheme.page, fonts: editingTheme.fonts, typography: editingTheme.typography, chapterOpener: editingTheme.chapterOpener }
          : DEFAULT_DRAFT,
      )
    }
    onOpenChange(next)
  }

  function handleSave() {
    if (editingTheme) {
      updateCustomTheme(editingTheme.id, draft)
      onSaved(editingTheme.id)
    } else {
      const id = addCustomTheme(draft)
      onSaved(id)
    }
    onOpenChange(false)
  }

  function updatePage<K extends keyof ResolvedBookTheme['page']>(field: K, value: ResolvedBookTheme['page'][K]) {
    setDraft((d) => ({ ...d, page: { ...d.page, [field]: value } }))
  }

  function updateTypography<K extends keyof ResolvedBookTheme['typography']>(field: K, value: ResolvedBookTheme['typography'][K]) {
    setDraft((d) => ({ ...d, typography: { ...d.typography, [field]: value } }))
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTheme ? 'Edit custom theme' : 'Create custom theme'}</DialogTitle>
          <DialogDescription>
            Colours, fonts and rhythm only — margins stay in Project Settings and apply to every
            theme.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="theme-name">Theme name</Label>
            <Input
              id="theme-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Heading font</Label>
              <Select value={draft.fonts.heading} onValueChange={(value) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, heading: value } }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Body font</Label>
              <Select value={draft.fonts.body} onValueChange={(value) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, body: value } }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-bg">Background</Label>
              <input id="color-bg" type="color" className="h-9 w-full rounded-[var(--radius-control)] border border-border" value={draft.page.background} onChange={(e) => updatePage('background', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-ink">Text</Label>
              <input id="color-ink" type="color" className="h-9 w-full rounded-[var(--radius-control)] border border-border" value={draft.page.ink} onChange={(e) => updatePage('ink', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-muted">Muted text</Label>
              <input id="color-muted" type="color" className="h-9 w-full rounded-[var(--radius-control)] border border-border" value={draft.page.mutedInk} onChange={(e) => updatePage('mutedInk', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-accent">Accent</Label>
              <input id="color-accent" type="color" className="h-9 w-full rounded-[var(--radius-control)] border border-border" value={draft.page.accent} onChange={(e) => updatePage('accent', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-rule">Rule / dividers</Label>
              <input id="color-rule" type="color" className="h-9 w-full rounded-[var(--radius-control)] border border-border" value={draft.page.ruleColor} onChange={(e) => updatePage('ruleColor', e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body-size">Body size (pt)</Label>
              <Input
                id="body-size"
                type="number"
                min={8}
                max={24}
                step={0.5}
                value={draft.typography.bodySize}
                onChange={(e) => updateTypography('bodySize', Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-height">Line height</Label>
              <Input
                id="line-height"
                type="number"
                min={1}
                max={2.5}
                step={0.05}
                value={draft.typography.lineHeight}
                onChange={(e) => updateTypography('lineHeight', Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Heading weight</Label>
              <Select value={String(draft.typography.headingWeight)} onValueChange={(value) => updateTypography('headingWeight', Number(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEADING_WEIGHT_OPTIONS.map((weight) => (
                    <SelectItem key={weight} value={String(weight)}>
                      {weight}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Chapter opener label</Label>
              <Select
                value={draft.chapterOpener.numberLabel}
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, chapterOpener: { ...d.chapterOpener, numberLabel: value as ResolvedBookTheme['chapterOpener']['numberLabel'] } }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_LABEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="justify-switch">Justify body text</Label>
              <p className="text-xs text-text-secondary">Even left and right margins, like a printed novel.</p>
            </div>
            <Switch id="justify-switch" checked={draft.typography.justify} onCheckedChange={(checked) => updateTypography('justify', checked)} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="dropcap-switch">Drop cap</Label>
              <p className="text-xs text-text-secondary">Large decorative first letter on each chapter's opening paragraph.</p>
            </div>
            <Switch id="dropcap-switch" checked={draft.typography.dropCap} onCheckedChange={(checked) => updateTypography('dropCap', checked)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!draft.name.trim()}>
            {editingTheme ? 'Save changes' : 'Create theme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
