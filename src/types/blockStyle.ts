/**
 * Layer 3 — Theme. A single block's typographic departure from the book's
 * theme: slightly smaller type to save a widow, slightly looser leading to
 * open up a dense passage. The two moves a typesetter actually makes to one
 * paragraph.
 *
 * **Not on `ContentBlock`.** `types/content.ts` opens with "No styling ever
 * lives here — presentation is entirely the responsibility of the Theme
 * (Layer 3) and Layout Engine (Layer 4)", and `CLAUDE.md` makes that a
 * non-negotiable. So an override is Theme-layer data keyed *by* a block id,
 * held in `store/blockStyleStore.ts`, exactly as `notesStore` keys notes by
 * block id without ever touching the manuscript. Deleting the override
 * leaves the block untouched; deleting the block leaves an orphan record
 * that nothing reads.
 *
 * Discrete steps, not free numbers. A book's typography is a system, and
 * "94.5% of the body size" is not a decision anyone can defend on the next
 * page; ±10% is. It also makes the desktop and mobile controls identical
 * without either shell needing a slider, and keeps every override
 * expressible in a PDF, an EPUB and the screen the same way.
 */
export interface BlockTypographyOverride {
  /** Multiplies the theme's `typography.bodySize`. */
  sizeScale?: number
  /** Multiplies the theme's `typography.lineHeight`. */
  leadingScale?: number
}

export const BLOCK_SIZE_STEPS = [
  { value: 0.9, label: 'Smaller' },
  { value: 1, label: 'Theme' },
  { value: 1.1, label: 'Larger' },
] as const

export const BLOCK_LEADING_STEPS = [
  { value: 0.92, label: 'Tighter' },
  { value: 1, label: 'Theme' },
  { value: 1.08, label: 'Looser' },
] as const

/** Whether an override says anything at all — an empty one is deleted
 * rather than stored, so "has an override" and "differs from the theme"
 * never drift apart. */
export function isDefaultOverride(override: BlockTypographyOverride | undefined): boolean {
  if (!override) return true
  const size = override.sizeScale ?? 1
  const leading = override.leadingScale ?? 1
  return size === 1 && leading === 1
}
