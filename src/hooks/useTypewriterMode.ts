import { useEffect, useRef } from 'react'

/**
 * Phase 111 (2026-08-02, user: "how about adding an option for typewriter
 * mode(sound)"). Two independent behaviours, gated by the same `enabled`
 * flag (only meaningful in Focus Mode's `write` view — see
 * `FocusModeLayout.tsx`):
 *
 * 1. Keeps the caret's current line vertically centred in its scroll
 *    container as the user types, so attention stays fixed near the middle
 *    of the screen instead of drifting toward the bottom and the page
 *    lurching in scroll-jump chunks — the single most-cited "feels good to
 *    write in" trait of dedicated writing apps (iA Writer, Typewriter apps,
 *    WriteRoom). Driven by `selectionchange`, which fires on every caret
 *    move (typing, arrow keys, click) — not by `Page.tsx`/`useEditableField`,
 *    since it only needs "where is the caret" and "what scrolls," both
 *    answerable generically for any contentEditable field without plumbing
 *    a new prop through every block type.
 * 2. Optionally plays a soft, synthesised (Web Audio, no external asset —
 *    nothing to license or fetch) key-click on every keystroke while a
 *    block is being edited, with a distinct lower "thunk" for Enter,
 *    mimicking a real typewriter's carriage return.
 */
export function useTypewriterMode(enabled: boolean, soundEnabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!enabled) return

    const centerCaret = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !active.isContentEditable) return

      const range = selection.getRangeAt(0)
      let rect = range.getBoundingClientRect()
      // A collapsed selection right at the start/end of a text node can
      // report an empty rect in some browsers — fall back to the focused
      // element's own rect so centring still works for an empty block.
      if (rect.width === 0 && rect.height === 0) rect = active.getBoundingClientRect()

      const scrollParent = closestScrollable(active)
      if (!scrollParent) return
      const parentRect = scrollParent.getBoundingClientRect()
      const caretMid = rect.top + rect.height / 2
      const parentMid = parentRect.top + parentRect.height / 2
      const delta = caretMid - parentMid
      if (Math.abs(delta) < 4) return
      scrollParent.scrollBy({ top: delta, behavior: 'smooth' })
    }

    document.addEventListener('selectionchange', centerCaret)
    return () => document.removeEventListener('selectionchange', centerCaret)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !soundEnabled) return

    const handleKeydown = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !active.isContentEditable) return
      // Ignore modifier combos (undo/redo, save, etc.) and navigation keys —
      // only actual typing should click.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const isPrintable = e.key.length === 1
      if (!isPrintable && e.key !== 'Enter' && e.key !== 'Backspace') return

      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      void ctx.resume()
      playKeyClick(ctx, e.key === 'Enter')
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [enabled, soundEnabled])

  // Tear down the AudioContext when the hook unmounts entirely (leaving
  // Focus Mode), not just when toggled off, so an open AudioContext never
  // lingers after the user exits distraction-free writing.
  useEffect(() => {
    return () => {
      void audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])
}

function closestScrollable(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** Short, decaying filtered-noise burst — a synthesised key click rather
 * than a sampled sound file, so it needs no external asset. `isReturn`
 * lengthens and lowers it slightly for a carriage-return-like "thunk". */
function playKeyClick(ctx: AudioContext, isReturn: boolean) {
  const durationSec = isReturn ? 0.09 : 0.045
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    const decay = (1 - i / bufferSize) ** 2
    data[i] = (Math.random() * 2 - 1) * decay
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = isReturn ? 900 : 2400
  filter.Q.value = 1.1

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(isReturn ? 0.28 : 0.22, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec)

  noise.connect(filter).connect(gain).connect(ctx.destination)
  noise.start()
  noise.stop(ctx.currentTime + durationSec)
}
