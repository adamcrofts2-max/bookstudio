import { useEffect } from 'react'

import { cn } from '@/lib/utils'
import { useEditableField } from '@/blocks/shared'
import { useLiveSpellcheck } from '@/renderer/useLiveSpellcheck'
import { useSelectionStore } from '@/store/selectionStore'

/**
 * A single editable text field, shared by every block type with one plain
 * string field (heading/quote/pull-quote/callout body/case-study title+text).
 * Reuses `useEditableField` (`src/blocks/shared.tsx`) — the exact same
 * commit-on-blur/Enter, cancel-on-Escape hook the desktop page canvas uses —
 * so the underlying edit semantics are identical, just without desktop's
 * double-click-to-enter-edit gesture (unreliable on touch): mobile fields
 * start editing on a single tap instead, since there's no separate
 * select-vs-edit state to preserve here (no toolbar/badge overlays in this
 * simplified view).
 *
 * `handleTap` calls `el.focus()` directly, synchronously, inside the tap's
 * own click handler — BEFORE flipping React state. This is deliberate, not
 * redundant with `useEditableField`'s own `ref.current.focus()` (which runs
 * in a `useLayoutEffect` after `isEditing` flips): iOS Safari (and some
 * Android browsers) only summon the on-screen keyboard for a programmatic
 * `.focus()` call if it happens synchronously within the original trusted
 * touch/click event — a `.focus()` reached via a subsequent React render
 * pass, even in the same tick, can be treated as untrusted and silently
 * ignored, so typing appears to do nothing on a real phone even though the
 * identical pattern works fine with a mouse (confirmed via automated click
 * testing, which doesn't reproduce this — mouse-driven `click` events don't
 * carry the same restriction). Desktop's block types don't hit this because
 * they've only ever been driven by a mouse/trackpad. Focusing here is a safe
 * no-op if `useEditableField`'s own effect-driven focus also fires — same
 * element, same result, just guaranteed to happen at least once inside the
 * gesture that must trigger it.
 */
export function MobileTextField({
  mode,
  value,
  onCommit,
  onSplit,
  onMergeWithPrevious,
  blockId,
  placeholder,
  className,
  style,
  projectId,
  as: Tag = 'div',
}: {
  mode: 'text' | 'html'
  value: string
  onCommit: (value: string) => void
  /** Paragraphs only — Enter splits here instead of ending the paragraph. */
  onSplit?: (before: string, after: string) => void
  onMergeWithPrevious?: () => void
  /** Used to claim a pending edit request aimed at this exact block, and to
   * scope spell-check to this field's project. */
  blockId?: string
  /** Enables spell-check underlining for this field. Prose only — a heading
   * or a quote attribution is not worth decorating. */
  projectId?: string
  placeholder: string
  className?: string
  /** Inline typography/colour, so Focus mode can paint this field with the
   * book's own theme instead of the app's UI styling. */
  style?: React.CSSProperties
  as?: 'div' | 'h2' | 'h3'
}) {
  const field = useEditableField({ mode, initialValue: value, onCommit, onSplit, onMergeWithPrevious })
  const isEmpty = value.trim().length === 0

  // Mobile had NO spell-check at all: this component never called the hook,
  // so the on/off control added for it in Phase 141 governed nothing on a
  // phone. Same hook, same dictionary and same exclusion rules as the
  // desktop canvas — one behaviour, not a second implementation.
  useLiveSpellcheck(field.ref, !!projectId, projectId, value)

  // Mobile has no paginated canvas and no Inspector, but it shares the
  // selection store, so the "put the caret in the block that was just
  // created" handshake is the same one the desktop page uses: whoever
  // splits calls `selectForEdit`, and the new block's field claims it on
  // mount. Without this the split worked but the caret was left nowhere,
  // and everything typed next went into the void.
  const selectedBlockId = useSelectionStore((s) => s.selectedBlockId)
  const editRequestId = useSelectionStore((s) => s.editRequestId)
  const editRequestCaretPosition = useSelectionStore((s) => s.editRequestCaretPosition)
  const consumeEditRequest = useSelectionStore((s) => s.consumeEditRequest)
  const wantsEdit = !!blockId && editRequestId !== null && selectedBlockId === blockId

  useEffect(() => {
    if (!wantsEdit) return
    const el = field.ref.current
    if (el) {
      el.contentEditable = 'true'
      // Focus directly as well as letting `useEditableField`'s layout effect
      // do it — same reasoning as `handleTap` below (mobile browsers only
      // summon the keyboard for a focus call inside the originating task).
      el.focus()
    }
    field.startEditing(editRequestCaretPosition)
    consumeEditRequest()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsEdit])

  const handleTap = () => {
    if (field.isEditing) return
    const el = field.ref.current
    if (el) {
      el.contentEditable = 'true'
      el.focus()
    }
    field.startEditing()
  }

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        field.ref.current = el
      }}
      onClick={!field.isEditing ? handleTap : undefined}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      style={style}
      className={cn(
        'rounded-[var(--radius-card)] outline-offset-4 transition-[outline-color] duration-150',
        field.isEditing ? 'outline outline-2 outline-[var(--color-warning)]' : 'outline outline-2 outline-transparent',
        isEmpty && !field.isEditing && 'text-text-muted',
        className,
      )}
      {...(mode === 'html' && !field.isEditing ? { dangerouslySetInnerHTML: { __html: value || placeholder } } : {})}
    >
      {mode === 'text' && !field.isEditing ? value.trim() || placeholder : null}
    </Tag>
  )
}

