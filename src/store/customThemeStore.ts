import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ResolvedBookTheme } from '@/theme/presets'
import { generateId } from '@/utils/id'

/**
 * Layer 3 (Theme) — user-created custom themes, stored separately from
 * `theme/presets.ts`'s hardcoded `PRESETS` but read by the exact same
 * `resolveTheme()` function (see that file's own doc comment) so every
 * existing call site — PDF export, on-screen rendering, `HeightMeasurer`,
 * the Virtual Editor's `dropCapFirstCharacterChecker` — picks up a custom
 * theme with zero changes, the same way they already handle any built-in
 * theme id. Global (not per-project): a theme a user designs is meant to
 * be reusable across every project, exactly like the 7 built-in presets
 * are.
 *
 * Deliberately restricted to the two font families this app actually
 * embeds in exported PDFs (`Inter`, `Source Serif 4` — see
 * `pdf/fonts.ts`'s `loadThemeFonts`) rather than letting a user type an
 * arbitrary CSS `font-family` string: an arbitrary family would render
 * using *some* system font on screen but silently fall back to Inter in
 * the exported PDF (`pickFont`'s `isSerif` regex wouldn't recognise it),
 * breaking this app's true-WYSIWYG non-negotiable. `CustomThemeEditorDialog.tsx`
 * only ever offers those two choices for exactly this reason.
 */
export interface CustomTheme extends ResolvedBookTheme {
  /** `true` marks this as user-created — lets `ThemeGallery.tsx` show an
   * edit/delete affordance only for these, never for the 7 built-in
   * presets. */
  isCustom: true
  description: string
}

interface CustomThemeStoreState {
  customThemes: CustomTheme[]
}

interface CustomThemeStoreActions {
  getCustomThemes: () => CustomTheme[]
  /** Creates a new custom theme with a fresh id, returning that id so the
   * caller (`CustomThemeEditorDialog.tsx`) can immediately apply it to the
   * current project via `onChange`. */
  addCustomTheme: (theme: Omit<CustomTheme, 'id' | 'isCustom'>) => string
  updateCustomTheme: (id: string, patch: Partial<Omit<CustomTheme, 'id' | 'isCustom'>>) => void
  /** Removes a custom theme from the library. Any project currently set to
   * this theme id falls back to the first built-in preset the next time
   * `resolveTheme` runs — no explicit migration needed, same "optional
   * field, default in code" pattern this codebase uses everywhere else
   * (see `theme/presets.ts`'s own fallback in `resolveTheme`). No
   * confirmation dialog, consistent with every other delete action in this
   * app (see docs/STATUS.md Phase 34's reasoning for chapter delete). */
  deleteCustomTheme: (id: string) => void
  /**
   * Upserts a custom theme under its own exact `id` rather than generating
   * a fresh one — the project-file import counterpart to
   * `assetStore.restoreAsset`'s "restore under the original id" contract
   * (Phase 51). A project's `settings.themeId` is captured at export time,
   * so the imported project's theme reference only keeps resolving if the
   * theme comes back under that same id; `addCustomTheme` can't be reused
   * here for exactly the reason its own doc comment gives for minting a
   * fresh id on every call.
   */
  importCustomTheme: (theme: CustomTheme) => void
}

export const EMPTY_CUSTOM_THEMES: readonly CustomTheme[] = []

export const useCustomThemeStore = create<CustomThemeStoreState & CustomThemeStoreActions>()(
  persist(
    (set, get) => ({
      customThemes: [],

      getCustomThemes: () => get().customThemes,

      addCustomTheme: (theme) => {
        const id = `custom-${generateId()}`
        const newTheme: CustomTheme = { ...theme, id, isCustom: true }
        set((state) => ({ customThemes: [...state.customThemes, newTheme] }))
        return id
      },

      updateCustomTheme: (id, patch) => {
        set((state) => ({
          customThemes: state.customThemes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }))
      },

      deleteCustomTheme: (id) => {
        set((state) => ({ customThemes: state.customThemes.filter((t) => t.id !== id) }))
      },

      importCustomTheme: (theme) => {
        set((state) => ({
          customThemes: state.customThemes.some((t) => t.id === theme.id)
            ? state.customThemes.map((t) => (t.id === theme.id ? theme : t))
            : [...state.customThemes, theme],
        }))
      },
    }),
    {
      name: 'book-studio.customThemes',
      version: 1,
    },
  ),
)
