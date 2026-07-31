export interface TextRun {
  text: string
  bold: boolean
  /** `true` inside `<em>`/`<i>`. Optional — every existing call site that
   * builds a `TextRun` literal by hand (e.g. `{ text, bold: false }` in the
   * many non-paragraph block types) simply omits it, which is equivalent
   * to `false`. */
  italic?: boolean
  /** The `href` of the nearest enclosing `<a>`, if any. Only ever set by
   * `parseInlineRuns` below (paragraph blocks are the only block type with
   * real inline HTML) — every hand-built `TextRun` literal elsewhere omits
   * it. */
  href?: string
}

/** Flattens a sanitised inline-HTML fragment (as produced by the parsers)
 * into plain runs carrying bold/italic/link state. Bold and italic are
 * distinguished in the exported PDF (see `pdf/fonts.ts`'s `pickItalicFont`
 * and `pdf/drawBlockHelpers.ts`'s `drawWrappedLines`); link runs are drawn
 * underlined in the theme's accent colour with a real clickable PDF link
 * annotation — see docs/STATUS.md Phase 39. */
export function parseInlineRuns(html: string): TextRun[] {
  const doc = new DOMParser().parseFromString(`<span>${html}</span>`, 'text/html')
  const runs: TextRun[] = []

  const walk = (node: Node, bold: boolean, italic: boolean, href: string | undefined) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (text) runs.push({ text, bold, italic, href })
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as Element
      if (el.tagName === 'BR') {
        runs.push({ text: '\n', bold, italic, href })
        return
      }
      const isBold = bold || el.tagName === 'STRONG' || el.tagName === 'B'
      const isItalic = italic || el.tagName === 'EM' || el.tagName === 'I'
      const linkHref = el.tagName === 'A' ? (el.getAttribute('href') ?? href) : href
      walk(el, isBold, isItalic, linkHref)
    })
  }

  walk(doc.body.firstElementChild ?? doc.body, false, false, undefined)
  return runs
}
