/**
 * Caret-position-as-a-plain-text-offset helpers, shared by any
 * contentEditable field that needs to save/restore the caret across a DOM
 * mutation it makes itself (not one typed in by the user) — e.g.
 * `useEditableField` placing the caret at a specific offset after a merge
 * (Phase 112), or the live spell-check underliner
 * (`renderer/useLiveSpellcheck.ts`, Phase 116) re-wrapping misspelled words
 * mid-typing without visibly moving the cursor. Kept in their own module,
 * not `shared.tsx` (which uses `placeCaretAtTextOffset` below), to avoid an
 * import cycle: `shared.tsx` already imports from `splitAtCaret.ts`, and a
 * third file both of them could plausibly import from is safer than
 * threading a new dependency back into either.
 */

function placeCaretAtElementEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Places the caret at a specific *text* offset (not raw HTML length)
 * within `el`, walking its text nodes in document order — the exact
 * technique `getCaretTextOffset` below uses in reverse, so a round trip
 * through both always lands back where it started. Falls back to the very
 * end if `offset` exceeds `el`'s real text length (shouldn't happen when
 * paired with `getCaretTextOffset`, but a silent no-op caret would be a
 * worse failure mode than "lands at the end"). */
export function placeCaretAtTextOffset(el: HTMLElement, offset: number) {
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
  placeCaretAtElementEnd(el)
}

/** Returns the current collapsed-caret position within `el`, counted in
 * plain-text characters from `el`'s start (matching how
 * `placeCaretAtTextOffset` above counts) — or `null` if there's no
 * collapsed selection inside `el` at all (nothing focused, a real
 * multi-character selection, or focus has moved elsewhere). Same
 * probe-`Range` technique `splitAtCaret.ts`'s `isCaretAtElementStart`
 * already uses. Used to save a caret position immediately before a DOM
 * mutation that would otherwise silently reset it, so it can be restored
 * afterward with `placeCaretAtTextOffset`. */
export function getCaretTextOffset(el: HTMLElement): number | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null
  const probe = document.createRange()
  probe.selectNodeContents(el)
  probe.setEnd(range.startContainer, range.startOffset)
  return probe.toString().length
}
