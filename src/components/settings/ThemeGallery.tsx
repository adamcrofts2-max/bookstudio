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
  /**
   * Inspector-width rendering: two columns, no description lines. The
   * dialog keeps the roomier three-column layout it was designed for.
   */
  compact?: boolean
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
  compact,
}: {
  theme: BookTheme
  selected: boolean
  onSelect: () => void
  onEdit?: () => void
  onDelete?: () => void
  /** Inspector-width: two fixed columns and no description line. */
  compact?: boolean
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
        {/* The mock-up's type is sized in `cqw` — percentages of this card's
            own width — so the same markup reads correctly at the dialog's
            200px cards and at the Inspector's 130px ones. Fixed `rem` sizes
            worked at one width and only one: in the 300px Inspector panel
            they clipped the heading at the top of the card and cut the
            sample paragraph off mid-word (Phase 176). */}
        <div
          // A rendering of the book's own page, not a piece of UI — the
          // accessibility audit exempts these by this attribute, because the
          // contrast of a theme's muted ink on its paper is a decision about
          // a printed book and not a screen (see `a11yChecks.mjs`).
          data-book-surface
          aria-hidden
          className="@container aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-image)]"
          style={{ background: resolved.page.background }}
        >
          <div className="flex h-full flex-col justify-center gap-[2cqw] px-[7cqw]">
            {opener && (
              <p
                className="uppercase tracking-widest"
                style={{ fontFamily: resolved.fonts.heading, color: resolved.page.accent, fontSize: '4.4cqw' }}
              >
                {opener}
              </p>
            )}
            <p
              className="leading-tight"
              style={{ fontFamily: resolved.fonts.heading, fontWeight: resolved.typography.headingWeight, color: resolved.page.ink, fontSize: '8.4cqw' }}
            >
              The Title
            </p>
            <div className="h-[0.8cqw] w-[12cqw] rounded-full" style={{ background: resolved.page.accent }} />
            <p
              style={{
                fontFamily: resolved.fonts.body,
                color: resolved.page.mutedInk,
                fontSize: '4.8cqw',
                lineHeight: resolved.typography.lineHeight,
                textAlign: resolved.typography.justify ? 'justify' : 'left',
              }}
            >
              {resolved.typography.dropCap && (
                <span
                  className="mr-[1cqw] float-left leading-[0.8]"
                  style={{ color: resolved.page.ink, fontWeight: resolved.typography.headingWeight, fontSize: '14cqw' }}
                >
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
        {!compact && <p className="text-xs leading-snug text-text-secondary">{theme.description}</p>}
      </button>
    </div>
  )
}

/** The gallery's "+ Create custom theme" card — same aspect-ratio slot as a
 * real theme card so it sits naturally in the grid. */
function CreateThemeCard({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-border text-text-secondary transition-colors hover:border-accent hover:text-accent"
    >
      <Plus className={compact ? 'size-5' : 'size-6'} />
      <span className={cn('font-medium', compact ? 'px-2 text-center text-xs leading-tight' : 'text-sm')}>
        {compact ? 'Custom theme' : 'Create custom theme'}
      </span>
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
export function ThemeGallery({ value, onChange, compact }: ThemeGalleryProps) {
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
      {/* `sm:grid-cols-3` is a *viewport* breakpoint, so inside the
          Inspector's 300px panel it would have produced 85px-wide previews
          of a book page — the one thing this gallery exists to show
          properly. `compact` pins it to two columns instead (Phase 176). */}
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {BUILT_IN_THEMES.map((theme) => (
          <ThemePreviewCard key={theme.id} theme={theme} selected={theme.id === value} onSelect={() => onChange(theme.id)} compact={compact} />
        ))}
        {customThemes.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            selected={theme.id === value}
            onSelect={() => onChange(theme.id)}
            onEdit={() => openEdit(theme)}
            onDelete={() => handleDelete(theme)}
            compact={compact}
          />
        ))}
        <CreateThemeCard onClick={openCreate} compact={compact} />
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
