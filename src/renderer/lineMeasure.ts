/**
 * Per-line measurement — milestone 1 of line-level flow
 * (docs/LINE_LEVEL_FLOW_PLAN.md, docs/STATUS.md Phase 181).
 *
 * `HeightMeasurer` has always known how tall each block is. Splitting a
 * paragraph across a page boundary needs one more fact: where each of its
 * lines starts. The browser will say, through `Range.getClientRects()`, which
 * returns one box per line fragment of a text node.
 */

export interface LineRect {
  top: number
  height: number
  width: number
}

/**
 * Collapses line fragments into line tops, relative to the block's own top.
 *
 * One visual line can produce several fragments — a bold run, a link, each
 * text node — and they share a top. A drop cap produces a fragment three
 * lines tall whose top sits a few pixels *above* the line it starts, which
 * grouping by top alone would count as a line of its own; so a fragment much
 * taller than the typical one is left out — it decorates lines, it does not
 * make one. (`pdfFidelity.e2e.mjs` reads lines by the same rule.)
 */
export function groupLineTops(rects: LineRect[], blockTop: number, tolerancePx = 2): number[] {
  const visible = rects.filter((r) => r.width > 0 && r.height > 0)
  const heights = visible.map((r) => r.height).sort((a, b) => a - b)
  // The lower middle value, so a one-line paragraph with a drop cap (two
  // fragments: the cap and the text) takes the text as typical.
  const typical = heights[Math.floor((heights.length - 1) / 2)] ?? 0
  const tops = visible
    .filter((r) => r.height <= typical * 1.6)
    .map((r) => r.top - blockTop)
    .sort((a, b) => a - b)
  const lines: number[] = []
  for (const top of tops) {
    const last = lines[lines.length - 1]
    if (last === undefined || top - last > tolerancePx) lines.push(top)
  }
  return lines.map((top) => Math.round(top * 100) / 100)
}

/** The top of every line of text inside `el`, in CSS px from `el`'s top. */
export function measureLineTops(el: HTMLElement): number[] {
  const rects: LineRect[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue
    range.selectNodeContents(node)
    for (const r of Array.from(range.getClientRects())) rects.push({ top: r.top, height: r.height, width: r.width })
  }
  range.detach?.()
  return groupLineTops(rects, el.getBoundingClientRect().top)
}
