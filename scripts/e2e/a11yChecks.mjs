/**
 * The accessibility checks `a11y.e2e.mjs` runs on every surface, as one
 * function evaluated inside the page.
 *
 * Hand-written rather than axe-core: this project has no npm registry
 * access (see `graphLayout.worker.ts`'s doc comment for the same
 * constraint), and Playwright itself is already resolved from wherever it
 * happens to be installed rather than depended on. What that costs is
 * breadth — this is a dozen rules, not ninety. What it buys is that every
 * rule here is one someone chose, with a stated reason for its exclusions,
 * which matters more for a suite that has to stay at zero findings to be
 * worth running at all.
 *
 * Exported as source text and injected with `page.evaluate`, so it can use
 * `getComputedStyle` and real geometry.
 */

/** WCAG 2.x relative luminance, then the contrast ratio between two colours. */
export const CONTRAST_SOURCE = `
function parseColor(value) {
  const m = value.match(/rgba?\\(([^)]+)\\)/)
  if (!m) return null
  const parts = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(fg, bg) {
  const a = luminance(fg) + 0.05
  const b = luminance(bg) + 0.05
  return a > b ? a / b : b / a
}

/** Composites a translucent colour over what is behind it. */
function over(front, back) {
  if (front.a >= 1) return front
  return {
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  }
}

/**
 * The colour actually behind an element: the first ancestor with a
 * non-transparent background, compositing any translucent layers on the way.
 * Returns null when an ancestor paints an image or a gradient, because the
 * contrast against a photograph is not a number this can honestly produce.
 */
function effectiveBackground(el) {
  let node = el
  let stack = []
  while (node && node !== document.documentElement.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
    const c = parseColor(cs.backgroundColor)
    if (c && c.a > 0) {
      stack.push(c)
      if (c.a >= 1) break
    }
    node = node.parentElement
  }
  if (stack.length === 0) return { r: 255, g: 255, b: 255, a: 1 }
  let result = stack[stack.length - 1]
  for (let i = stack.length - 2; i >= 0; i--) result = over(stack[i], result)
  return result
}
`

export const CHECKS_SOURCE = `
${CONTRAST_SOURCE}

const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="link"]'

function isVisible(el) {
  if (el.closest('[aria-hidden="true"]')) return false
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/**
 * The book canvas: the author's own typography, rendered at print size.
 * Its contrast is a design decision about a printed page, not a UI
 * accessibility failure, and its "controls" are the manuscript itself.
 *
 * The data-book-surface attribute extends that to the miniature pages the theme
 * gallery draws (Phase 176). They are pictures of a book page — the same
 * ink on the same paper — and the only thing anyone needs to *read* there
 * is the theme's name underneath, which is ordinary UI text and is checked
 * like any other. Darkening a theme's muted ink to satisfy a screen rule
 * would change the printed book to fix a thumbnail.
 */
function inBookCanvas(el) {
  return !!el.closest('[id^="page-"], [data-block-id], [data-graph-node], [data-book-surface]')
}

function accessibleName(el) {
  const aria = el.getAttribute('aria-label')
  if (aria && aria.trim()) return aria.trim()
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
    if (text) return text
  }
  const title = el.getAttribute('title')
  if (title && title.trim()) return title.trim()
  if (el.id) {
    const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
    if (label?.textContent?.trim()) return label.textContent.trim()
  }
  if (el.closest('label')?.textContent?.trim()) return el.closest('label').textContent.trim()
  const text = (el.textContent ?? '').trim()
  if (text) return text
  const img = el.querySelector('img[alt]')
  if (img?.getAttribute('alt')?.trim()) return img.getAttribute('alt').trim()
  if (el.tagName === 'INPUT' && (el.getAttribute('placeholder') ?? '').trim()) return el.getAttribute('placeholder').trim()
  return ''
}

function describe(el) {
  const cls = (el.className?.toString?.() ?? '').split(/\\s+/).slice(0, 3).join('.')
  return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '')
}

const findings = []
const add = (rule, detail) => findings.push({ rule, detail: detail.slice(0, 160) })

// --- 3.1.1 Language of Page / 2.4.2 Page Titled ---
if (!document.documentElement.getAttribute('lang')) add('3.1.1 language of page', '<html> has no lang attribute')
if (!(document.title ?? '').trim()) add('2.4.2 page titled', 'the document has no title')

// --- 4.1.1 duplicate ids (a real defect, whatever WCAG 2.2 says about it) ---
const seenIds = new Map()
for (const el of document.querySelectorAll('[id]')) {
  const id = el.getAttribute('id')
  seenIds.set(id, (seenIds.get(id) ?? 0) + 1)
}
for (const [id, count] of seenIds) if (count > 1) add('4.1.1 unique ids', 'id "' + id + '" appears ' + count + ' times')

// --- ARIA references that point at nothing ---
for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
  for (const el of document.querySelectorAll('[' + attr + ']')) {
    if (!isVisible(el)) continue
    for (const id of (el.getAttribute(attr) ?? '').split(/\\s+/).filter(Boolean)) {
      if (!document.getElementById(id)) add('4.1.2 aria reference', describe(el) + ' ' + attr + ' -> missing #' + id)
    }
  }
}

// --- 1.1.1 Non-text Content ---
for (const img of document.querySelectorAll('img')) {
  if (!isVisible(img)) continue
  if (img.getAttribute('alt') === null) add('1.1.1 non-text content', describe(img) + ' has no alt attribute')
}

// --- 4.1.2 Name, Role, Value ---
for (const el of document.querySelectorAll(INTERACTIVE)) {
  if (!isVisible(el) || inBookCanvas(el)) continue
  if (el.tagName === 'INPUT' && ['hidden', 'file'].includes(el.getAttribute('type') ?? '')) continue
  if (!accessibleName(el)) add('4.1.2 name, role, value', describe(el) + ' has no accessible name')
}

// --- 1.4.3 Contrast (minimum) ---
// Only elements whose own text node is their first child, so a paragraph is
// measured once rather than once per wrapper.
for (const el of document.querySelectorAll('body *')) {
  if (!isVisible(el) || inBookCanvas(el)) continue
  const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  if (!ownText) continue
  const cs = getComputedStyle(el)
  const fg = parseColor(cs.color)
  const bg = effectiveBackground(el)
  if (!fg || !bg) continue
  const size = parseFloat(cs.fontSize)
  const weight = Number(cs.fontWeight) || 400
  const large = size >= 24 || (size >= 18.66 && weight >= 700)
  const required = large ? 3 : 4.5
  const ratio = contrastRatio(over(fg, bg), bg)
  if (ratio + 0.005 < required) {
    add(
      '1.4.3 contrast',
      describe(el) + ' ' + ratio.toFixed(2) + ':1 (needs ' + required + ':1) — "' + (el.textContent ?? '').trim().slice(0, 40) + '"',
    )
  }
}

// --- 2.5.8 Target Size (Minimum), WCAG 2.2 AA ---
if (window.__A11Y_TOUCH) {
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!isVisible(el) || inBookCanvas(el)) continue
    if (el.closest('p, li')) continue // an inline link in a sentence is exempt
    const r = el.getBoundingClientRect()
    if (r.width < 24 || r.height < 24) {
      add('2.5.8 target size', describe(el) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' (needs 24x24) — "' + accessibleName(el).slice(0, 30) + '"')
    }
  }
}

// --- 1.3.1 Info and Relationships: heading order ---
let previousLevel = 0
for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
  if (!isVisible(h) || inBookCanvas(h)) continue
  const level = Number(h.tagName[1])
  if (previousLevel && level > previousLevel + 1) {
    add('1.3.1 heading order', 'h' + previousLevel + ' is followed by h' + level + ' — "' + (h.textContent ?? '').trim().slice(0, 40) + '"')
  }
  previousLevel = level
}

return findings
`
