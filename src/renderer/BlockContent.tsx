import type { ContentBlock } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { getBlockTypeDefinition } from '@/blocks/registry'

export interface BlockContentProps {
  block: ContentBlock
  theme: ResolvedBookTheme
  dropCap?: boolean
  selected?: boolean
  onSelect?: () => void
  /**
   * Opt-in inline text editing. Only ever passed `true` from `Page.tsx`'s
   * real rendering path — `HeightMeasurer.tsx` never passes this prop, so
   * its off-screen measurement instances stay inert and pixel-identical to
   * how they render when nothing is being edited.
   */
  editable?: boolean
  /** Called with a `Partial<ContentBlock>` patch when an edit is committed.
   * `Page.tsx` wires this straight to `contentStore.updateBlock` — this
   * component never touches the store itself. */
  onCommit?: (updates: Partial<ContentBlock>) => void
  /** One-shot signal (e.g. from the Virtual Editor's "Edit" action) to enter
   * edit mode immediately once this block is selected, rather than waiting
   * for a double-click. */
  autoEdit?: boolean
  /** Called once autoEdit has been acted on, so the requester (selectionStore)
   * can clear the pending request and avoid re-triggering. */
  onAutoEditHandled?: () => void
}

/**
 * Renders a single manuscript block using the active theme's typography.
 * Used both for real page display and for off-screen height measurement —
 * the two must stay pixel-identical, so there is exactly one implementation
 * per block type, looked up here from the block-type registry
 * (`src/blocks/registry.ts`). This component is now a thin dispatcher; the
 * six per-type implementations (and their `drawPdf`/`blockSpacing` twins)
 * live in `src/blocks/types/*.tsx` — see docs/MODULAR_PAGE_SYSTEM_PLAN.md,
 * Milestone 1.
 *
 * Inline editing (`editable`/`onCommit`) is opt-in and only ever wired from
 * `Page.tsx`'s real rendering path. Paragraph HTML is sanitised back down to
 * the same allowed-tag set the import-time sanitiser enforces, via the
 * shared `sanitiseInline` from `src/parser/html.ts` — no second sanitiser
 * (see `src/blocks/shared.tsx`'s `useEditableField`).
 */
export function BlockContent(props: BlockContentProps) {
  const def = getBlockTypeDefinition(props.block.type)
  if (!def) return null
  return <def.Render {...props} />
}
