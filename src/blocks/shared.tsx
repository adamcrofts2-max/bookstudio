import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { sanitiseInline } from '@/parser/html'
import { splitElementAtCaret, splitPlainTextAtCaret, isCaretAtElementStart } from '@/blocks/splitAtCaret'
import { cn } from '@/lib/utils'

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Counterpart to `placeCaretAtEnd` — used when a field starts editing with
 * content whose *beginning* is what the user should see the cursor at, not
 * its end (Phase 111: the second half of a just-split paragraph). */
function placeCaretAtStart(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Places the caret at a specific *text* offset (not raw HTML length)
 * within `el` — used when merging a block into its previous sibling
 * (Phase 112, `mergeParagraphWithPreviousHistory`) so the caret lands
 * exactly at the old seam between the two paragraphs' text, not at either
 * end. Walks `el`'s text nodes in document order, which is how a rendered
 * offset is actually counted regardless of intervening inline tags
 * (`<strong>`/`<em>`/links). Falls back to the very end if `offset`
 * exceeds the element's real text length (shouldn't happen — the caller
 * computes it from the same content — but a silent no-op caret would be a
 * worse failure mode than "lands at the end"). */
function placeCaretAtTextOffset(el: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.data.length
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode() as Text | null
  }
  placeCaretAtEnd(el)
}

/** Enter commits (blurs to trigger the commit handler), Escape cancels
 * without committing. Shared by every inline-editable field across the
 * per-block-type render modules in `src/blocks/types/`.
 *
 * `onSplit`, when provided, changes what Enter does: instead of always
 * committing-and-exiting, it splits the field's content at the caret
 * (`splitElementAtCaret` for `mode: 'html'` fields, `splitPlainTextAtCaret`
 * for `mode: 'text'` fields) and hands both halves to the caller — expected
 * to replace this field's own content with the "before" half and create
 * somewhere to put the "after" half (a new sibling *block* for a paragraph,
 * see `paragraph.tsx` + `editorActions.splitParagraphWithHistory`; a new
 * `<li>` *within the same list block* for a list item, see `list.tsx` +
 * `editorActions.splitListItemWithHistory`, Phase 115) — the same "Enter
 * starts a new paragraph/item" behaviour every word processor and every
 * bullet-list editor has. Falls through to the ordinary commit-and-blur if
 * the split can't be computed (e.g. no active selection) or if the caller
 * doesn't pass `onSplit` at all — every other block type (headings, quotes,
 * table cells, …) is completely unaffected.
 *
 * `onMergeWithPrevious` (Phase 112, extended to list items Phase 115) is
 * `onSplit`'s companion: pressing Backspace with the caret at the very start
 * of the field (`isCaretAtElementStart`) calls it instead of deleting
 * nothing, so the field's content can be merged into its previous sibling
 * (`editorActions.mergeParagraphWithPreviousHistory` for paragraphs,
 * `mergeListItemWithPreviousWithHistory` for list items) — the same
 * "Backspace at the start of a line joins it with the line above" behaviour
 * every word processor has. Same opt-in shape as `onSplit`: absent for every
 * block type except `paragraph` and (per-item, only when there's a previous
 * item to merge into) `list`. */
export function useEditableField(options: {
  mode: 'text' | 'html'
  initialValue: string
  onCommit: (value: string) => void
  onSplit?: (before: string, after: string) => void
  onMergeWithPrevious?: () => void
}) {
  const { mode, initialValue, onCommit, onSplit, onMergeWithPrevious } = options
  const [isEditing, setIsEditing] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  const skipCommitRef = useRef(false)
  const caretPositionRef = useRef<'start' | 'end' | number>('end')

  useLayoutEffect(() => {
    if (!isEditing || !ref.current) return
    if (mode === 'html') ref.current.innerHTML = initialValue
    else ref.current.textContent = initialValue
    ref.current.focus()
    const caretPosition = caretPositionRef.current
    if (caretPosition === 'start') placeCaretAtStart(ref.current)
    else if (typeof caretPosition === 'number') placeCaretAtTextOffset(ref.current, caretPosition)
    else placeCaretAtEnd(ref.current)
    // Only re-run when entering/leaving edit mode — re-syncing on every
    // keystroke would fight the user's in-progress, uncontrolled DOM edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const startEditing = (caretPosition: 'start' | 'end' | number = 'end') => {
    caretPositionRef.current = caretPosition
    setIsEditing(true)
  }

  const handleBlur = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setIsEditing(false)
      return
    }
    if (ref.current) {
      const value = mode === 'html' ? sanitiseInline(ref.current) : (ref.current.textContent ?? '')
      onCommit(value)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (onSplit && ref.current) {
        // `mode === 'html'` fields (paragraphs) need `splitElementAtCaret`'s
        // clone-and-sanitise handling to preserve inline formatting across
        // the split; `mode === 'text'` fields (list items, Phase 115) have
        // no formatting to preserve, so the plain-text `Range.toString()`
        // version is enough and skips the unnecessary HTML round-trip.
        const split = mode === 'html' ? splitElementAtCaret(ref.current) : splitPlainTextAtCaret(ref.current)
        if (split) {
          // The split itself (both halves persisted atomically as one undo
          // step, via `onSplit`) is the real commit here — the ordinary
          // blur-triggered `onCommit` above would otherwise fire with this
          // block's *un-split* full content and race it.
          skipCommitRef.current = true
          onSplit(split.before, split.after)
          ;(e.currentTarget as HTMLElement).blur()
          return
        }
      }
      ;(e.currentTarget as HTMLElement).blur()
    } else if (
      e.key === 'Backspace' &&
      onMergeWithPrevious &&
      ref.current &&
      isCaretAtElementStart(ref.current)
    ) {
      // Same "the real commit happens inside the callback" reasoning as
      // `onSplit` above — `onMergeWithPrevious` persists the merge as one
      // undo step, so the ordinary blur-triggered `onCommit` must not also
      // fire (it would race with a block that's about to be deleted).
      e.preventDefault()
      skipCommitRef.current = true
      onMergeWithPrevious()
      ;(e.currentTarget as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      skipCommitRef.current = true
      ;(e.currentTarget as HTMLElement).blur()
    }
  }

  return { ref, isEditing, startEditing, handleBlur, handleKeyDown }
}

/** Tailwind margin classes for `ImageBlock.align` — 'center' (the default
 * when the field is absent) reproduces the always-`mx-auto` behaviour that
 * existed before this field was introduced. */
export function imageAlignClass(align: 'left' | 'center' | 'right') {
  if (align === 'left') return 'ml-0 mr-auto'
  if (align === 'right') return 'ml-auto mr-0'
  return 'mx-auto'
}

export function outlineClass(selected: boolean, editing: boolean) {
  if (editing) return 'outline outline-2 outline-[var(--color-warning)] rounded-sm'
  if (selected) return 'outline outline-2 outline-[var(--color-accent)] rounded-sm'
  return 'outline outline-2 outline-transparent'
}

interface ListItemFieldProps {
  text: string
  editable?: boolean
  onCommit: (value: string) => void
  /** One-shot signal to enter edit mode immediately with the caret at this
   * item's start — the item-level counterpart to `BlockContentProps.autoEdit`
   * (Phase 115, 2026-08-03). `list.tsx` resolves which item this applies to
   * from `selectionStore.editRequestItemIndex` before passing it down, so
   * only ever one item at a time actually receives `autoEdit={true}`. */
  autoEdit?: boolean
  /** Called once `autoEdit` has been acted on (real DOM focus landed), so
   * the requester (`selectionStore`) can clear the pending request. Consumed
   * from `onFocus`, not the mount effect — same "retry across any number of
   * remounts until focus genuinely sticks" reasoning as `paragraph.tsx`'s
   * Phase 111 fix, needed here because splitting/merging a list item changes
   * the whole list block's height, which can still trigger a pagination-
   * driven remount before the new item's real position settles. */
  onAutoEditHandled?: () => void
  /** Enter-mid-item support (Phase 115) — splits this item's text at the
   * caret; `list.tsx` wires this to insert a new `<li>` right after this one
   * in the same list block, mirroring `paragraph.tsx`'s `onSplit`. */
  onSplit?: (before: string, after: string) => void
  /** Backspace-at-start-merges-with-the-previous-item (Phase 115),
   * `onSplit`'s companion — only ever passed for an item that isn't already
   * the list's first (nothing to merge into otherwise), mirroring
   * `onMergeWithPrevious`'s scoping for paragraph blocks. */
  onMergeWithPrevious?: () => void
}

/** One `<li>` — its own component so hooks stay unconditional regardless of
 * how many items a list has (see Rules of Hooks). Used by `list.tsx`. */
export function ListItemField({
  text,
  editable,
  onCommit,
  autoEdit,
  onAutoEditHandled,
  onSplit,
  onMergeWithPrevious,
}: ListItemFieldProps) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit, onSplit, onMergeWithPrevious })

  // See the `onAutoEditHandled` doc comment above — re-issues `startEditing`
  // every time `autoEdit` flips true, not just on first mount, so a
  // pagination-driven remount mid-split doesn't silently strand the focus
  // request (same pattern `paragraph.tsx` uses).
  useEffect(() => {
    if (autoEdit && editable) field.startEditing('start')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  return (
    <li
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? () => field.startEditing() : undefined}
      onFocus={autoEdit ? () => onAutoEditHandled?.() : undefined}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn('pb-1', field.isEditing && 'outline outline-2 outline-offset-2 outline-[var(--color-warning)] rounded-sm')}
    >
      {!field.isEditing ? text : null}
    </li>
  )
}

interface TableCellFieldProps {
  as: 'td' | 'th'
  text: string
  editable?: boolean
  onCommit: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

/** One `<td>`/`<th>` — its own component for the same reason as `ListItemField`.
 * Used by `table.tsx`. */
export function TableCellField({ as: Tag, text, editable, onCommit, className, style }: TableCellFieldProps) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit })
  return (
    <Tag
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? () => field.startEditing() : undefined}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn(className, field.isEditing && 'outline outline-2 outline-offset-2 outline-[var(--color-warning)] rounded-sm')}
      style={style}
    >
      {!field.isEditing ? text : null}
    </Tag>
  )
}
