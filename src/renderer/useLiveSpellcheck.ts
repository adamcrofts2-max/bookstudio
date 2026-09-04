/**
 * Live, dictionary-backed spell-check underlining for the on-canvas
 * paragraph editor (Phase 116, 2026-08-03, user: "yes it should have live
 * spell check" — confirmed scope: only the paragraph currently being
 * edited gets underlines, updating as you type).
 *
 * Phase 143 widened that scope, because the original was the wrong call and
 * the user reported the result: scoping underlines to the focused paragraph
 * meant only ever ONE misspelling was visible, in the paragraph under the
 * cursor, and the moment you stopped writing there were none at all
 * (measured: 1 underline while editing, 0 after blur). A spell-checker you
 * can only see one word of at a time isn't one. Every editable paragraph
 * now decorates itself, so mistakes stay visible while you write past them,
 * exactly as they do in any other writing tool.
 *
 * Decoration never reaches stored content: `parser/html.ts`'s
 * `sanitiseInline` — which every commit path goes through — keeps only an
 * allow-list of inline tags and unwraps everything else, so a `<span
 * class="book-spell-error">` cannot be written into the manuscript even if
 * a commit happened to fire while one was present.
 *
 * Reuses the exact same nspell dictionary and false-positive rules
 * (`virtualEditor/spellcheckWords.ts`, `virtualEditor/spellcheckDictionary
 * .ts`) as the Virtual Editor's `spellingChecker` (Phase 109/110) — a word
 * that's fine there is fine here, and vice versa, by construction rather
 * than by keeping two implementations in sync by hand.
 *
 * On a debounce after every `input` event, walks the field's text nodes
 * (never its HTML string — this must never disturb `<strong>`/`<em>`/`<a>`
 * markup a paragraph might already contain) and wraps each misspelled
 * word's exact text range in a `<span class="book-spell-error">`
 * (styled in `src/index.css`). Because injecting a span mid-sentence would
 * otherwise visibly kick the cursor to the wrong position while the user
 * keeps typing — the same class of bug this session already hit twice
 * with focus (Phase 111/115's paragraph-split and list-item races) — the
 * caret's plain-text offset is saved immediately before the DOM mutation
 * and restored immediately after (`@/blocks/caretOffset`).
 */
import { useEffect, useRef } from 'react'

import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { useLayer0Store } from '@/store/layer0Store'
import { ensureSpellDictionaryLoading, getSpeller, isSpellDictionaryReady } from '@/virtualEditor/spellcheckDictionary'
import type { NSpell } from 'nspell'
import { WORD_PATTERN, looksLikeAcronym, collectLayer0Names } from '@/virtualEditor/spellcheckWords'
import { getCaretTextOffset, placeCaretAtTextOffset } from '@/blocks/caretOffset'

const SPELL_ERROR_CLASS = 'book-spell-error'
const SPELL_ERROR_SELECTOR = `span.${SPELL_ERROR_CLASS}`
const DEBOUNCE_MS = 350

/** Reverses any previous `wrapMisspelledWords` pass — merges every
 * `.book-spell-error` span's text back into its surrounding text, then
 * `Node.normalize()`s the element so adjacent text nodes recombine. Always
 * run immediately before re-scanning, so each pass starts from the same
 * "no decoration" baseline rather than trying to diff against the
 * previous one — simpler and, for text this short, cheap enough not to
 * matter. */
function unwrapMisspelledWords(el: HTMLElement) {
  const spans = el.querySelectorAll(SPELL_ERROR_SELECTOR)
  spans.forEach((span) => {
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
  })
  el.normalize()
}

/** Walks `el`'s text nodes and wraps every misspelled word's exact
 * substring in a `.book-spell-error` span, leaving every other character —
 * and every existing inline tag — untouched. Text nodes with zero
 * misspelled words are skipped entirely (no DOM churn at all), matching
 * `spellingChecker`'s own "one finding per distinct word" spirit, just at
 * the level of "don't touch what doesn't need touching" rather than
 * de-duplicating findings. */
function wrapMisspelledWords(el: HTMLElement, speller: NSpell, ignoreWords: Set<string>) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    textNodes.push(node)
  }

  for (const textNode of textNodes) {
    const text = textNode.data
    const misspelledRanges: { start: number; end: number }[] = []
    for (const match of text.matchAll(WORD_PATTERN)) {
      const word = match[0]
      const lower = word.toLowerCase()
      if (looksLikeAcronym(word)) continue
      if (ignoreWords.has(lower)) continue
      if (speller.correct(word)) continue
      misspelledRanges.push({ start: match.index ?? 0, end: (match.index ?? 0) + word.length })
    }
    if (misspelledRanges.length === 0) continue

    const fragment = document.createDocumentFragment()
    let cursor = 0
    for (const range of misspelledRanges) {
      if (range.start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, range.start)))
      const span = document.createElement('span')
      span.className = SPELL_ERROR_CLASS
      span.textContent = text.slice(range.start, range.end)
      fragment.appendChild(span)
      cursor = range.end
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)))

    textNode.parentNode?.replaceChild(fragment, textNode)
  }
}

/**
 * `elRef` should point at the same contentEditable element
 * `useEditableField` already manages; `active` should mirror that field's
 * own `isEditing` (this hook does nothing while `false`, and clears any
 * existing underlines when it flips false→true→false — leaving stale
 * underlines visible after a field is committed and re-rendered from its
 * plain `block.html` would look like a rendering bug). `projectId` is
 * needed to look up the project's `StyleGuide.englishVariant` (which
 * dictionary to load) and its Layer 0 bible (which invented names to
 * exclude) — both read fresh from the store on every rescan rather than
 * subscribed to reactively, since neither plausibly changes mid-keystroke
 * and re-reading a Zustand snapshot is cheap.
 */
export function useLiveSpellcheck(
  elRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  projectId: string | undefined,
  /** The field's current text. Passing it re-scans when the content changes
   * from outside this field — which is what a paragraph the user is *not*
   * editing needs, since it has no `input` events of its own to react to. */
  contentKey?: string,
) {
  const timerRef = useRef<number | undefined>(undefined)
  const decoratingRef = useRef(false)
  const enabled = useUiStore((s) => s.spellcheckWhileWriting)

  useEffect(() => {
    const el = elRef.current
    if (!active || !enabled || !el || !projectId) return

    const variant = useProjectStore.getState().getProject(projectId)?.settings.styleGuide?.englishVariant ?? 'british'

    let cancelled = false

    const rescan = () => {
      if (cancelled || !el.isConnected) return
      const speller = getSpeller(variant)
      if (!speller) return
      const ignoreWords = collectLayer0Names(useLayer0Store.getState().getBible(projectId))
      const caretOffset = getCaretTextOffset(el)
      decoratingRef.current = true
      try {
        unwrapMisspelledWords(el)
        wrapMisspelledWords(el, speller, ignoreWords)
      } finally {
        // Cleared after the observer has drained this task's records, so our
        // own wrap/unwrap never schedules another pass.
        queueMicrotask(() => {
          decoratingRef.current = false
        })
      }
      if (caretOffset !== null) placeCaretAtTextOffset(el, caretOffset)
    }

    const scheduleRescan = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(rescan, DEBOUNCE_MS)
    }

    if (isSpellDictionaryReady(variant)) {
      rescan()
    } else {
      // First edit of a session before this variant's dictionary has ever
      // been requested (e.g. a brand-new project, or the first paragraph
      // anyone's edited since the app loaded) — kick off the fetch and
      // scan once it lands, instead of silently doing nothing until the
      // next keystroke happens to schedule a rescan.
      void ensureSpellDictionaryLoading(variant).then(() => {
        if (!cancelled) rescan()
      })
    }

    // Clicking (or tapping) a flagged word selects exactly that word, which
    // is what makes the underline actionable: a single-word selection is
    // already what `FloatingFormatToolbar` shows its Fix-spelling list for.
    // Without this the red line was information with no next step — you had
    // to select the word by hand to do anything about it.
    const selectFlaggedWord = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const span = target.closest(SPELL_ERROR_SELECTOR)
      if (!span) return
      const range = document.createRange()
      range.selectNodeContents(span)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    // A MutationObserver rather than just an `input` listener.
    //
    // The underlines are DOM that React knows nothing about, and a field
    // that isn't being edited renders through `dangerouslySetInnerHTML` — so
    // any later render replaces the element's contents and silently strips
    // every underline. That is why widening the scope wasn't enough on its
    // own: decoration was applied correctly and then wiped by the next
    // render, leaving a paragraph the user had finished with looking clean
    // no matter how it was spelled (measured: 1 underline while editing, 0
    // immediately after blur).
    //
    // Observing the element instead makes the decoration self-healing — it
    // comes back whenever anything replaces the content, whoever did it —
    // and covers typing too, so no separate `input` listener is needed.
    const observer = new MutationObserver(() => {
      if (decoratingRef.current) return // our own wrap/unwrap, not a real change
      scheduleRescan()
    })
    observer.observe(el, { childList: true, subtree: true, characterData: true })

    el.addEventListener('click', selectFlaggedWord)
    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(timerRef.current)
      el.removeEventListener('click', selectFlaggedWord)
      // Clear any underlines left over from this editing session — the
      // field is either about to blur (commit reverts to plain
      // `dangerouslySetInnerHTML`, so stale spans would never be seen
      // again anyway) or `active` flipped false for some other reason;
      // either way, decorated markup should never linger past its own
      // editing session.
      if (el.isConnected) unwrapMisspelledWords(el)
    }
  }, [active, enabled, elRef, projectId, contentKey])
}
