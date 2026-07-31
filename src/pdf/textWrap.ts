import type { TextRun } from '@/pdf/htmlRuns'

export interface FontLike {
  widthOfTextAtSize(text: string, size: number): number
}

export interface LineFragment {
  text: string
  bold: boolean
  italic?: boolean
  href?: string
  x: number
  width: number
}

export interface WrappedLine {
  fragments: LineFragment[]
  width: number
  isParagraphEnd: boolean
}

interface Word {
  text: string
  bold: boolean
  italic?: boolean
  href?: string
  forceBreakAfter?: boolean
}

function tokenise(runs: TextRun[]): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    const parts = run.text.split('\n')
    parts.forEach((part, i) => {
      for (const word of part.split(/\s+/).filter(Boolean)) {
        words.push({ text: word, bold: run.bold, italic: run.italic, href: run.href })
      }
      if (i < parts.length - 1 && words.length > 0) {
        words[words.length - 1].forceBreakAfter = true
      }
    })
  }
  return words
}

/** Optional extras for `wrapRuns` — every existing call site (there are
 * ~20 across `src/blocks/types/` and `src/structuralPages/types/`, none of
 * which use italic/link runs or justification) keeps compiling unchanged
 * since this whole parameter is optional and additive. Only
 * `paragraph.tsx`'s `drawParagraphPdf` — the sole block type with real
 * inline HTML — passes one. */
export interface WrapRunsOptions {
  /** Used to measure/render italic-only runs; falls back to `regularFont`
   * (no italic slant, but still correctly wrapped) if omitted. */
  italicFont?: FontLike
  /** Used to measure/render bold+italic runs; falls back to `italicFont`,
   * then `boldFont`, if omitted. */
  boldItalicFont?: FontLike
  /**
   * When `true`, every line except a paragraph's last line (`isParagraphEnd`)
   * has its inter-word spacing stretched so the line's rightmost word ends
   * exactly at `maxWidth` — real justified text, not the CSS-only,
   * left-aligned-in-PDF approximation this replaced (see docs/ROADMAP.md
   * Phase D and docs/STATUS.md Phase 39). Only redistributes *space
   * between words* (each word's own rendered width is untouched) — the
   * same mechanism a typeset book's justified text actually uses.
   */
  justify?: boolean
}

function fontFor(word: Word, regularFont: FontLike, boldFont: FontLike, options?: WrapRunsOptions): FontLike {
  if (word.italic && word.bold) return options?.boldItalicFont ?? options?.italicFont ?? boldFont
  if (word.italic) return options?.italicFont ?? regularFont
  if (word.bold) return boldFont
  return regularFont
}

/**
 * Greedy word-wraps styled runs to a fixed width, resolving each word's
 * pixel width against the correct (regular/bold/italic/bold-italic)
 * embedded font. Used by the PDF exporter — the browser preview wraps via
 * native CSS, so this is the one place PDF export has to reimplement
 * line-breaking itself.
 */
export function wrapRuns(
  runs: TextRun[],
  regularFont: FontLike,
  boldFont: FontLike,
  size: number,
  maxWidth: number,
  options?: WrapRunsOptions,
): WrappedLine[] {
  const words = tokenise(runs)
  const spaceWidth = regularFont.widthOfTextAtSize(' ', size)
  const lines: WrappedLine[] = []
  let current: LineFragment[] = []
  let x = 0

  const pushLine = (isParagraphEnd: boolean) => {
    if (options?.justify && !isParagraphEnd && current.length > 1) {
      const extraSpace = Math.max(0, maxWidth - x)
      const gaps = current.length - 1
      const extraPerGap = extraSpace / gaps
      current.forEach((fragment, i) => {
        fragment.x += extraPerGap * i
      })
    }
    lines.push({ fragments: current, width: x, isParagraphEnd })
    current = []
    x = 0
  }

  for (const word of words) {
    const font = fontFor(word, regularFont, boldFont, options)
    const wordWidth = font.widthOfTextAtSize(word.text, size)
    const needsSpace = current.length > 0
    const widthWithSpace = wordWidth + (needsSpace ? spaceWidth : 0)

    if (x + widthWithSpace > maxWidth && current.length > 0) {
      pushLine(false)
    }
    const startX = x + (current.length > 0 ? spaceWidth : 0)
    current.push({ text: word.text, bold: word.bold, italic: word.italic, href: word.href, x: startX, width: wordWidth })
    x = startX + wordWidth

    if (word.forceBreakAfter) pushLine(true)
  }
  if (current.length > 0) pushLine(true)
  if (lines.length > 0) lines[lines.length - 1].isParagraphEnd = true

  return lines
}
