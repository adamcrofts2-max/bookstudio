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

/**
 * The text offset at which `node` begins inside `el` — the same plain-text
 * counting `getCaretTextOffset` uses, so the two are interchangeable.
 */
export function textOffsetOfNode(el: HTMLElement, node: Node): number {
  const probe = document.createRange()
  probe.selectNodeContents(el)
  probe.setEnd(node, 0)
  return probe.toString().length
}

/**
 * The current selection inside `el` as a plain-text offset pair, or `null`
 * if the selection is not inside `el` at all.
 *
 * The collapsed case is exactly `getCaretTextOffset` (`start === end`); the
 * non-collapsed case is what makes a *word* survivable across a DOM
 * rewrite. That matters because the spell-check underliner rebuilds this
 * element's nodes on every rescan: before this, restoring only ever put back
 * a caret, so selecting a misspelled word and waiting a moment silently
 * threw the selection away — and with it the toolbar offering to fix it.
 */
export function getSelectionTextRange(el: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  const startProbe = document.createRange()
  startProbe.selectNodeContents(el)
  startProbe.setEnd(range.startContainer, range.startOffset)
  const endProbe = document.createRange()
  endProbe.selectNodeContents(el)
  endProbe.setEnd(range.endContainer, range.endOffset)
  return { start: startProbe.toString().length, end: endProbe.toString().length }
}

/** Walks `el`'s text nodes to the container and offset holding plain-text
 * position `offset`, or `null` past the end. */
function locate(el: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  while (node) {
    if (remaining <= node.data.length) return { node, offset: remaining }
    remaining -= node.data.length
    node = walker.nextNode() as Text | null
  }
  return null
}

/**
 * Restores a selection spanning plain-text offsets `start`..`end` in `el` —
 * the inverse of `getSelectionTextRange`. A collapsed pair places a caret,
 * so this covers both cases and callers need only one restore path.
 */
export function selectTextRange(el: HTMLElement, start: number, end: number) {
  const from = locate(el, start)
  const to = locate(el, end)
  if (!from) {
    placeCaretAtElementEnd(el)
    return
  }
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  if (to) range.setEnd(to.node, to.offset)
  else range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Replaces the plain-text range `start`..`end` inside `el` with
 * `replacement`, touching only the text nodes that range actually covers.
 *
 * Deliberately not `el.textContent = corrected`. That is the obvious way to
 * do this and it silently destroys the paragraph: every `<strong>`, `<em>`
 * and link in it collapses to plain text, so correcting one misspelling
 * would strip the formatting from the whole paragraph around it. The
 * manuscript is not something a spelling fix gets to rewrite wholesale.
 *
 * Returns false if the range could not be located, so the caller can decline
 * to commit rather than commit something wrong.
 */
export function replaceTextRange(el: HTMLElement, start: number, end: number, replacement: string): boolean {
  const from = locate(el, start)
  const to = locate(el, end)
  if (!from || !to) return false
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  range.deleteContents()
  range.insertNode(document.createTextNode(replacement))
  el.normalize()
  return true
}
