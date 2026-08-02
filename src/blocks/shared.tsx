import { useLayoutEffect, useRef, useState } from 'react'

import { sanitiseInline } from '@/parser/html'
import { splitElementAtCaret } from '@/blocks/splitAtCaret'
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

/** Enter commits (blurs to trigger the commit handler), Escape cancels
 * without committing. Shared by every inline-editable field across the
 * per-block-type render modules in `src/blocks/types/`.
 *
 * `onSplit`, when provided, changes what Enter does: instead of always
 * committing-and-exiting, it splits the field's content at the caret
 * (`splitElementAtCaret`) and hands both halves to the caller — which is
 * expected to replace this block with the "before" half and insert a new
 * block for the "after" half (see `paragraph.tsx` + `editorActions
 * .splitParagraphWithHistory`), the same "Enter starts a new paragraph"
 * behaviour every word processor has. Falls through to the ordinary
 * commit-and-blur if the split can't be computed (e.g. no active selection)
 * or if the caller doesn't pass `onSplit` at all — every other block type
 * (headings, quotes, list items, …) is completely unaffected. */
export function useEditableField(options: {
  mode: 'text' | 'html'
  initialValue: string
  onCommit: (value: string) => void
  onSplit?: (before: string, after: string) => void
}) {
  const { mode, initialValue, onCommit, onSplit } = options
  const [isEditing, setIsEditing] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  const skipCommitRef = useRef(false)
  const caretPositionRef = useRef<'start' | 'end'>('end')

  useLayoutEffect(() => {
    if (!isEditing || !ref.current) return
    if (mode === 'html') ref.current.innerHTML = initialValue
    else ref.current.textContent = initialValue
    ref.current.focus()
    if (caretPositionRef.current === 'start') placeCaretAtStart(ref.current)
    else placeCaretAtEnd(ref.current)
    // Only re-run when entering/leaving edit mode — re-syncing on every
    // keystroke would fight the user's in-progress, uncontrolled DOM edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const startEditing = (caretPosition: 'start' | 'end' = 'end') => {
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
      if (onSplit && ref.current && mode === 'html') {
        const split = splitElementAtCaret(ref.current)
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
}

/** One `<li>` — its own component so hooks stay unconditional regardless of
 * how many items a list has (see Rules of Hooks). Used by `list.tsx`. */
export function ListItemField({ text, editable, onCommit }: ListItemFieldProps) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit })
  return (
    <li
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? () => field.startEditing() : undefined}
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
