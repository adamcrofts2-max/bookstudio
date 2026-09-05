import type { StructuralPage } from '@/types/structuralPage'
import type { ResolvedBookTheme } from '@/theme/presets'
import { resolveCoverFontFamily } from '@/structuralPages/coverTypography'

/**
 * Every CSS font-family string a book will actually be drawn with.
 *
 * Feeds `loadThemeFonts`, which embeds only the families this returns —
 * see that function for why (19 fonts and 1.11 MB were being embedded into
 * every export regardless of use).
 *
 * The structural-page half is a **deep walk for any `fontChoice` key**
 * rather than a list of the places one is known to live. A cover font can
 * only ever enter a document through a stored `fontChoice`, but which
 * objects carry one is a detail of each page type's content shape, and that
 * shape changes whenever a page type gains an element. Enumerating known
 * paths would work today and silently start missing fonts the first time
 * someone nests a `typography` block somewhere new — and the failure mode
 * is a cover printing in Times New Roman, which nobody would notice until a
 * proof came back. Walking for the key cannot drift.
 *
 * The theme's own heading and body families are always included: a custom
 * theme is free to set either to one of the display faces.
 */
export function collectUsedFontFamilies(theme: ResolvedBookTheme, structuralPages: readonly StructuralPage[]): Set<string> {
  const families = new Set<string>([theme.fonts.heading, theme.fonts.body])

  const visit = (value: unknown, depth: number) => {
    // Structural-page content is a shallow, hand-authored tree; the bound is
    // a cheap guard against a cycle, not a real limit on nesting.
    if (depth > 12 || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'fontChoice' && typeof child === 'string') {
        // Resolved through the same helper the renderer and the PDF drawing
        // code use, so 'theme'/'serif'/'sans' and the Bebas-to-Anton
        // redirect are all handled in exactly one place.
        families.add(resolveCoverFontFamily({ fontChoice: child as never }, theme.fonts.heading))
      }
      visit(child, depth + 1)
    }
  }

  for (const page of structuralPages) visit(page.content, 0)
  return families
}
