import type { ResolvedBookTheme } from '@/theme/presets'
import type { BlockTypographyOverride } from '@/types/blockStyle'
import { isDefaultOverride } from '@/types/blockStyle'

/**
 * The theme one block is drawn with — the book's theme, with that block's
 * override applied (Phase 171).
 *
 * A derived *theme* rather than extra props on every renderer is what keeps
 * this cheap: `Page.tsx`, `HeightMeasurer.tsx` and `exportPdf.ts` already
 * take a `ResolvedBookTheme` per block, so all three honour an override by
 * passing a different object, and nothing downstream — no block type, no
 * `drawPdf`, no wrap measurement — needs to know overrides exist at all.
 * That also means screen, measurement and print cannot disagree about what
 * an override means, which is the property the PDF fidelity suite exists to
 * protect.
 *
 * Returns the same object when there is nothing to apply, so React's
 * identity checks and `useMemo` dependencies see no change for the
 * overwhelmingly common case of a book with no overrides at all.
 */
export function themeForBlock(
  theme: ResolvedBookTheme,
  override: BlockTypographyOverride | undefined,
): ResolvedBookTheme {
  if (isDefaultOverride(override)) return theme
  return {
    ...theme,
    typography: {
      ...theme.typography,
      bodySize: theme.typography.bodySize * (override?.sizeScale ?? 1),
      lineHeight: theme.typography.lineHeight * (override?.leadingScale ?? 1),
    },
  }
}
