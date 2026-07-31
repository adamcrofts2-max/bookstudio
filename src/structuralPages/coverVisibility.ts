import type { CoverTextFieldId, BackCoverTextFieldId } from '@/types/structuralPage'

/**
 * Shared helpers for a Cover/Back Cover's per-field "hide this for a
 * photo-only look" toggle (Phase 49) — one small array of hidden field
 * ids on the page's own content, rather than a boolean per field, so
 * `cover.tsx`/`backCover.tsx`/`StructuralPagePanel.tsx` all read/write the
 * same shape. Hiding a field never clears its text — the value stays
 * exactly as typed, so switching it back on restores it unchanged.
 */
type HideableFieldId = CoverTextFieldId | BackCoverTextFieldId

export function isFieldHidden<T extends HideableFieldId>(hiddenFields: T[] | undefined, field: T): boolean {
  return !!hiddenFields?.includes(field)
}

/** Returns the next `hiddenFields` array with `field`'s hidden state
 * flipped — pure, so callers pass the result straight to `onCommit`. */
export function toggleHiddenField<T extends HideableFieldId>(hiddenFields: T[] | undefined, field: T): T[] {
  const current = hiddenFields ?? []
  return current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
}
