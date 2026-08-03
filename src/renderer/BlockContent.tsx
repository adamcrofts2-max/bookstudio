import type { ContentBlock } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { getBlockTypeDefinition } from '@/blocks/registry'

export interface BlockContentProps {
  block: ContentBlock
  theme: ResolvedBookTheme
  dropCap?: boolean
  selected?: boolean
  onSelect?: () => void
  /** The owning project's id — only populated on `Page.tsx`'s real
   * rendering path (never `HeightMeasurer.tsx`'s off-screen instances,
   * same rule as `editable`/`onCommit` below). Needed by any block type
   * that has to call `assetStore` itself rather than go through a
   * `Page.tsx`-level callback — currently just the image-kind placeholder's
   * upload-to-convert flow (Phase 51). */
  projectId?: string
  /** Swaps this block for a wholly different one at the same position —
   * e.g. converting an image-kind placeholder into a real `ImageBlock`
   * once a photo is uploaded (Phase 51). Wired to
   * `editorActions.replaceBlockWithHistory`, same "this component never
   * touches the store itself" rule as `onCommit`. */
  onReplace?: (block: ContentBlock) => void
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
  /** Where the caret should land when `autoEdit` fires — `'end'` (the
   * long-standing default: the Virtual Editor's "Edit" action, a fresh
   * block from the "+" inserter), `'start'` (Phase 111: the second half of
   * a just-split paragraph, so the cursor lands at the very beginning of
   * its new content rather than past it), or a text-character offset
   * (Phase 112: `mergeParagraphWithPreviousHistory`'s merged block, so the
   * cursor lands exactly at the old seam between the two paragraphs' text).
   * Only meaningful alongside `autoEdit`. */
  autoEditCaretPosition?: 'start' | 'end' | number
  /** Called once autoEdit has been acted on, so the requester (selectionStore)
   * can clear the pending request and avoid re-triggering. */
  onAutoEditHandled?: () => void
  /**
   * Enter-mid-paragraph support (Phase 111, 2026-08-02, user: "when writing
   * a paragraph and pressing enter shouldn't it by default start a new
   * paragraph?"). Called with the sanitised HTML on either side of the
   * caret; `Page.tsx` wires this to `editorActions.splitParagraphWithHistory`
   * (replace this block with `before`, insert a new paragraph block holding
   * `after` immediately after it, one undo step) and then selects that new
   * block with `autoEditCaretPosition: 'start'`. Only the `paragraph` block
   * type wires this today — every other type keeps its existing "Enter
   * commits and exits" behaviour, since "split into two" doesn't make sense
   * for e.g. a heading or a list item the same way it does for prose.
   */
  onSplit?: (before: string, after: string) => void
  /**
   * Backspace-at-start-merges-with-previous-block (Phase 112, 2026-08-03,
   * the natural companion to `onSplit` above). Called with no arguments —
   * this block's own content isn't needed by the caller, since
   * `editorActions.mergeParagraphWithPreviousHistory` re-reads both blocks'
   * current content straight from `contentStore` rather than trusting
   * whatever this component last rendered. `Page.tsx` only ever wires this
   * when the immediately preceding sibling block is also a `paragraph`
   * (mirroring `onSplit`'s "only `paragraph` gets this" scope) — merging
   * text into a heading or list item isn't well-defined the same way.
   */
  onMergeWithPrevious?: () => void
  /**
   * Which list item (`items` array index) `autoEdit` applies to, or
   * `undefined`/`null` (Phase 115, 2026-08-03). Only meaningful for the
   * `list` block type — every other type ignores it. Set from
   * `selectionStore.editRequestItemIndex`, the item-granularity counterpart
   * to `autoEditCaretPosition` above: a `list` block's "block" is the whole
   * `<ul>`/`<ol>`, not one `<li>`, so the block-level `autoEdit` alone can't
   * say *which* item should receive focus.
   */
  autoEditItemIndex?: number | null
  /**
   * Enter-mid-list-item support (Phase 115) — `onSplit`'s list counterpart.
   * Splitting a list item doesn't create a new sibling *block* the way a
   * paragraph split does; it inserts a new `<li>` into this same list
   * block's `items` array, so the callback needs to know which item index
   * was split. Called with the item's index and the plain text on either
   * side of the caret; `Page.tsx` wires this to
   * `editorActions.splitListItemWithHistory` and then requests item
   * `itemIndex + 1` for immediate editing via `selectForEdit`'s `itemIndex`
   * parameter. Only wired for the `list` block type.
   */
  onSplitListItem?: (itemIndex: number, beforeText: string, afterText: string) => void
  /**
   * Backspace-at-start-of-a-list-item-merges-with-the-previous-item (Phase
   * 115), `onSplitListItem`'s companion — `onMergeWithPrevious`'s list
   * counterpart, scoped to items within the same list block. `Page.tsx`
   * only ever wires this for the `list` block type; `list.tsx` itself only
   * ever passes it down to an item that isn't already the list's first
   * (nothing to merge into otherwise), mirroring `onMergeWithPrevious`'s
   * "only pass the callback when it would do something" rule.
   */
  onMergeListItemWithPrevious?: (itemIndex: number) => void
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
