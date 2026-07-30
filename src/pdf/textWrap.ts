import type { TextRun } from '@/pdf/htmlRuns'

export interface FontLike {
  widthOfTextAtSize(text: string, size: number): number
}

export interface LineFragment {
  text: string
  bold: boolean
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
  forceBreakAfter?: boolean
}

function tokenise(runs: TextRun[]): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    const parts = run.text.split('\n')
    parts.forEach((part, i) => {
      for (const word of part.split(/\s+/).filter(Boolean)) {
        words.push({ text: word, bold: run.bold })
      }
      if (i < parts.length - 1 && words.length > 0) {
        words[words.length - 1].forceBreakAfter = true
      }
    })
  }
  return words
}

/**
 * Greedy word-wraps styled runs to a fixed width, resolving each word's
 * pixel width against the correct (regular/bold) embedded font. Used by
 * the PDF exporter — the browser preview wraps via native CSS, so this is
 * the one place PDF export has to reimplement line-breaking itself.
 */
export function wrapRuns(runs: TextRun[], regularFont: FontLike, boldFont: FontLike, size: number, maxWidth: number): WrappedLine[] {
  const words = tokenise(runs)
  const spaceWidth = regularFont.widthOfTextAtSize(' ', size)
  const lines: WrappedLine[] = []
  let current: LineFragment[] = []
  let x = 0

  const pushLine = (isParagraphEnd: boolean) => {
    lines.push({ fragments: current, width: x, isParagraphEnd })
    current = []
    x = 0
  }

  for (const word of words) {
    const font = word.bold ? boldFont : regularFont
    const wordWidth = font.widthOfTextAtSize(word.text, size)
    const needsSpace = current.length > 0
    const widthWithSpace = wordWidth + (needsSpace ? spaceWidth : 0)

    if (x + widthWithSpace > maxWidth && current.length > 0) {
      pushLine(false)
    }
    const startX = x + (current.length > 0 ? spaceWidth : 0)
    current.push({ text: word.text, bold: word.bold, x: startX, width: wordWidth })
    x = startX + wordWidth

    if (word.forceBreakAfter) pushLine(true)
  }
  if (current.length > 0) pushLine(true)
  if (lines.length > 0) lines[lines.length - 1].isParagraphEnd = true

  return lines
}
