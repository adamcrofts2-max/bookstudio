export interface TextRun {
  text: string
  bold: boolean
}

/** Flattens a sanitised inline-HTML fragment (as produced by the parsers)
 * into plain runs with a bold flag. Italic/link styling is not
 * distinguished in the exported PDF yet — see docs/STATUS.md. */
export function parseInlineRuns(html: string): TextRun[] {
  const doc = new DOMParser().parseFromString(`<span>${html}</span>`, 'text/html')
  const runs: TextRun[] = []

  const walk = (node: Node, bold: boolean) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? ''
        if (text) runs.push({ text, bold })
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as Element
      if (el.tagName === 'BR') {
        runs.push({ text: '\n', bold })
        return
      }
      const isBold = bold || el.tagName === 'STRONG' || el.tagName === 'B'
      walk(el, isBold)
    })
  }

  walk(doc.body.firstElementChild ?? doc.body, false)
  return runs
}
