import { useState } from 'react'

import { Check, Pencil, Plus, Trash2 } from 'lucide-react'

import { BUILT_IN_THEMES, type BookTheme } from '@/types/theme'
import { resolveTheme } from '@/theme/presets'
import { cn } from '@/lib/utils'
import { useCustomThemeStore, EMPTY_CUSTOM_THEMES, type CustomTheme } from '@/store/customThemeStore'
import { CustomThemeEditorDialog } from '@/components/settings/CustomThemeEditorDialog'

interface ThemeGalleryProps {
  value: string
  onChange: (themeId: string) => void
}

/** One theme's real, resolved page/font/typography values rendered as a
 * miniature mock-up (background colour, accent rule, a heading sample in
 * the theme's actual heading font/weight, a body sample in its actual body
 * font, and a drop-cap-styled leading letter when the theme uses one) —
 * not just a name in a dropdown. This is what actually distinguishes one
 * theme from another, so seeing it before applying (rather than reading a
 * one-line description) is the whole point of a gallery over a `<Select>`.
 */
function ThemePreviewCard({
  theme,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  theme: BookTheme
  selected: boolean
  onSelect: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const resolved = resolveTheme(theme.id)
  const opener =
    resolved.chapterOpener.numberLabel === 'word' ? 'Chapter One'
    : resolved.chapterOpener.numberLabel === 'numeral' ? '1'
    : null

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 rounded-[var(--radius-card)] border-2 p-2.5 text-left transition-colors',
        selected ? 'border-accent' : 'border-border hover:border-text-secondary',
      )}
    >
      {(onEdit || onDelete) && (
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1 transition-opacity can-hover:opacity-0 can-hover:group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              aria-label="Edit theme"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="flex size-6 items-center justify-center rounded-full bg-background/90 text-text-secondary shadow-[var(--shadow-sm)] hover:text-text-primary"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Delete theme"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="flex size-6 items-center justify-center rounded-full bg-background/90 text-text-secondary shadow-[var(--shadow-sm)] hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex flex-col gap-2 text-left">
        <div className="aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-image)]" style={{ background: resolved.page.background }}>
          <div className="flex h-full flex-col justify-center gap-2 px-4">
            {opener && (
              <p className="text-[0.55rem] uppercase tracking-widest" style={{ fontFamily: resolved.fonts.heading, color: resolved.page.accent }}>
                {opener}
              </p>
            )}
            <p
              className="leading-tight"
              style={{ fontFamily: resolved.fonts.heading, fontWeight: resolved.typography.headingWeight, color: resolved.page.ink, fontSize: '1.05rem' }}
            >
              The Title
            </p>
            <div className="h-0.5 w-6 rounded-full" style={{ background: resolved.page.accent }} />
            <p
              style={{
                fontFamily: resolved.fonts.body,
                color: resolved.page.mutedInk,
                fontSize: '0.6rem',
                lineHeight: resolved.typography.lineHeight,
                textAlign: resolved.typography.justify ? 'justify' : 'left',
              }}
            >
              {resolved.typography.dropCap && (
                <span className="mr-0.5 float-left text-2xl leading-[0.8]" style={{ color: resolved.page.ink, fontWeight: resolved.typography.headingWeight }}>
                  T
                </span>
              )}
              his is a sample paragraph showing the theme&apos;s real typography — font, size, colour and rhythm.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium text-text-primary">{theme.name}</p>
          {selected && <Check className="size-4 shrink-0 text-accent" />}
        </div>
        <p className="text-xs leading-snug text-text-secondary">{theme.description}</p>
      </button>
    </div>
  )
}

/** The gallery's "+ Create custom theme" card — same aspect-ratio slot as a
 * real theme card so it sits naturally in the grid. */
function CreateThemeCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-border text-text-secondary transition-colors hover:border-accent hover:text-accent"
    >
      <Plus className="size-6" />
      <span className="text-sm font-medium">Create custom theme</span>
    </button>
  )
}

/**
 * Visual theme gallery — replaces a plain `<Select>` of theme names with a
 * grid of real, resolved-theme previews, per `CLAUDE.md`'s "the interface
 * should be visual rather than settings-based wherever possible." Applying
 * a theme still just calls `onChange`, which `ProjectSettingsDialog.tsx`
 * wires straight into `updateProjectSettings({ themeId })` exactly as the
 * old dropdown did — switching instantly re-renders the whole book with no
 * re-import, satisfying the same non-negotiable the dropdown already did.
 *
 * Also lists any user-created themes from `customThemeStore.ts` alongside
 * the built-ins, with edit/delete affordances only custom themes get, plus
 * a trailing "+ Create custom theme" card that opens
 * `CustomThemeEditorDialog.tsx`.
 */
export function ThemeGallery({ value, onChange }: ThemeGalleryProps) {
  const customThemes = useCustomThemeStore((s) => s.customThemes) ?? EMPTY_CUSTOM_THEMES
  const deleteCustomTheme = useCustomThemeStore((s) => s.deleteCustomTheme)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>(undefined)

  function openCreate() {
    setEditingTheme(undefined)
    setEditorOpen(true)
  }

  function openEdit(theme: CustomTheme) {
    setEditingTheme(theme)
    setEditorOpen(true)
  }

  function handleDelete(theme: CustomTheme) {
    deleteCustomTheme(theme.id)
    // If the deleted theme was the active selection, fall back to the first
    // built-in theme immediately rather than leaving `value` pointing at a
    // now-nonexistent id until the next `resolveTheme` call papers over it.
    if (theme.id === value) {
      onChange(BUILT_IN_THEMES[0].id)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BUILT_IN_THEMES.map((theme) => (
          <ThemePreviewCard key={theme.id} theme={theme} selected={theme.id === value} onSelect={() => onChange(theme.id)} />
        ))}
        {customThemes.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            selected={theme.id === value}
            onSelect={() => onChange(theme.id)}
            onEdit={() => openEdit(theme)}
            onDelete={() => handleDelete(theme)}
          />
        ))}
        <CreateThemeCard onClick={openCreate} />
      </div>

      <CustomThemeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingTheme={editingTheme}
        onSaved={(themeId) => onChange(themeId)}
      />
    </>
  )
}
