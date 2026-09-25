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
  /**
   * No whitespace between this piece and the previous one: a style change
   * *inside* a word — `re<em>arrange</em>ment`. The pieces are one word, so
   * they are drawn touching and never broken apart. Before Phase 181 each
   * piece was its own word, and the PDF printed "re arrange ment".
   */
  joinsPrevious?: boolean
}

function tokenise(runs: TextRun[]): Word[] {
  const words: Word[] = []
  // Whether the text so far ends in whitespace — what decides if the first
  // word of the next run is a new word or the rest of the last one.
  let endsInSpace = true
  for (const run of runs) {
    const parts = run.text.split('\n')
    parts.forEach((part, i) => {
      for (const match of part.matchAll(/\S+/g)) {
        const joinsPrevious = i === 0 && match.index === 0 && !endsInSpace && words.length > 0
        words.push({ text: match[0], bold: run.bold, italic: run.italic, href: run.href, ...(joinsPrevious ? { joinsPrevious } : {}) })
      }
      if (i < parts.length - 1 && words.length > 0) {
        words[words.length - 1].forceBreakAfter = true
      }
      if (i < parts.length - 1) endsInSpace = true
    })
    if (run.text.length > 0) endsInSpace = /\s$/.test(run.text)
  }
  return words
}

/** Groups pieces joined without whitespace into the words a reader sees. */
function toUnits(words: Word[]): Word[][] {
  const units: Word[][] = []
  for (const word of words) {
    const last = units[units.length - 1]
    if (word.joinsPrevious && last && !last[last.length - 1].forceBreakAfter) last.push(word)
    else units.push([word])
  }
  return units
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
  /**
   * Width available to the **first** line only, when it differs from
   * `maxWidth` — a hanging indent, where the first line starts further left
   * than the ones that run over from it (`verse.tsx`, Phase 167). Without
   * this the exporter has to wrap everything at the narrower width, so a
   * line that fits on screen can wrap in print and a poem gains a line it
   * does not have.
   */
  firstLineWidth?: number
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
  const units = toUnits(tokenise(runs))
  const spaceWidth = regularFont.widthOfTextAtSize(' ', size)
  const lines: WrappedLine[] = []
  let current: LineFragment[] = []
  // Which word of the line each fragment belongs to — justification
  // stretches the gaps *between words*, and a word may be several pieces.
  let wordIndexOf: number[] = []
  let wordsInLine = 0
  let x = 0

  const widthForLine = () => (lines.length === 0 ? (options?.firstLineWidth ?? maxWidth) : maxWidth)

  const pushLine = (isParagraphEnd: boolean) => {
    if (options?.justify && !isParagraphEnd && wordsInLine > 1) {
      const extraSpace = Math.max(0, widthForLine() - x)
      const extraPerGap = extraSpace / (wordsInLine - 1)
      current.forEach((fragment, i) => {
        fragment.x += extraPerGap * wordIndexOf[i]
      })
    }
    lines.push({ fragments: current, width: x, isParagraphEnd })
    current = []
    wordIndexOf = []
    wordsInLine = 0
    x = 0
  }

  for (const unit of units) {
    const widths = unit.map((piece) => fontFor(piece, regularFont, boldFont, options).widthOfTextAtSize(piece.text, size))
    const unitWidth = widths.reduce((sum, w) => sum + w, 0)
    const needsSpace = current.length > 0
    const widthWithSpace = unitWidth + (needsSpace ? spaceWidth : 0)

    if (x + widthWithSpace > widthForLine() && current.length > 0) {
      pushLine(false)
    }
    let pieceX = x + (current.length > 0 ? spaceWidth : 0)
    unit.forEach((piece, i) => {
      current.push({ text: piece.text, bold: piece.bold, italic: piece.italic, href: piece.href, x: pieceX, width: widths[i] })
      wordIndexOf.push(wordsInLine)
      pieceX += widths[i]
    })
    wordsInLine++
    x = pieceX

    if (unit[unit.length - 1].forceBreakAfter) pushLine(true)
  }
  if (current.length > 0) pushLine(true)
  if (lines.length > 0) lines[lines.length - 1].isParagraphEnd = true

  return lines
}
