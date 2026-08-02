/**
 * Splits a contentEditable element's content into two sanitised HTML
 * strings at the current text-selection caret — the core mechanic behind
 * "pressing Enter mid-paragraph starts a new paragraph" (Phase 111,
 * 2026-08-02, user: "when writing a paragraph and pressing enter shouldn't
 * it by default start a new paragraph?"). Before this, `useEditableField`'s
 * Enter handling only ever committed the whole field and exited editing —
 * there was no way to create a second paragraph without leaving the flow of
 * typing to find the "+" inserter.
 *
 * Uses two `Range`s anchored to the element's own start/end and the
 * caret's start/end, then `Range.cloneContents()` — the standard DOM
 * technique for this (the same one block-based editors like Notion use):
 * cloning a Range that crosses into nested inline formatting (`<strong>`,
 * `<em>`, links) correctly duplicates just enough of the ancestor chain on
 * each side, so "Chapter <strong>one|two</strong> begins" (caret at `|`)
 * splits into "Chapter <strong>one</strong>" and "<strong>two</strong>
 * begins" rather than losing the bold formatting on one half. If the user
 * had text actually selected (not just a collapsed caret) when they pressed
 * Enter, the selected text is excluded from both halves — the same
 * "replace selection" behaviour any text editor gives Enter-over-a-
 * selection, without any special-casing needed here.
 */
import { sanitiseInline } from '@/parser/html'

export interface CaretSplit {
  before: string
  after: string
}

export function splitElementAtCaret(el: HTMLElement): CaretSplit | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null

  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(el)
  beforeRange.setEnd(range.startContainer, range.startOffset)

  const afterRange = document.createRange()
  afterRange.selectNodeContents(el)
  afterRange.setStart(range.endContainer, range.endOffset)

  const beforeContainer = document.createElement('div')
  beforeContainer.appendChild(beforeRange.cloneContents())
  const afterContainer = document.createElement('div')
  afterContainer.appendChild(afterRange.cloneContents())

  return {
    before: sanitiseInline(beforeContainer),
    after: sanitiseInline(afterContainer),
  }
}
