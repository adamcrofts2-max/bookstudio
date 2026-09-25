import { create } from 'zustand'

/**
 * Whether a selection popover — the Fix-spelling list, the synonyms list —
 * is open right now.
 *
 * One selection, one floating surface. `FloatingFormatToolbar` sits in the
 * band directly above a selection and drops its lists *below* it;
 * `SelectionDevelopMenu`'s "+" sits beside the selection. At a full-size
 * canvas those three bands rarely met. Once the canvas started fitting the
 * window (Phase 174) selections became narrower and shorter, and the "+"
 * landed squarely on top of the suggestion list: the user could see
 * "sentence" and could not click it, because a round green button was in
 * the way.
 *
 * Rather than a positioning arms race between two components that cannot
 * see each other — they are mounted at different levels, one per paragraph
 * and one per page — the rule is stated once: while the format toolbar has
 * a list open, it owns the area around the selection and the Develop button
 * steps back. A tiny transient store rather than `uiStore`, which is
 * persisted and has no business remembering that a dropdown was open.
 */
interface SelectionPopoverState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useSelectionPopoverStore = create<SelectionPopoverState>((set) => ({
  open: false,
  setOpen: (open) => set((state) => (state.open === open ? state : { open })),
}))
