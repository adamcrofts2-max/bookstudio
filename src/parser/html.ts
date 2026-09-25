import type { Chapter, ContentBlock } from '@/types/content'
import { generateId } from '@/utils'

const ALLOWED_INLINE_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'A', 'BR'])

/** Rebuilds an element's inner HTML keeping only a safe inline subset
 * (bold, italic, links, line breaks) — never trusts imported markup as-is.
 * Exported so the Virtual Editor's inline text-editing commit path
 * (`BlockContent.tsx`) can sanitise whatever the browser's `contentEditable`
 * produces back down to the exact same allowed-tag set import-time HTML
 * goes through, instead of maintaining a second sanitiser. */
export function sanitiseInline(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as Element
    if (!ALLOWED_INLINE_TAGS.has(el.tagName)) {
      out += sanitiseInline(el)
      return
    }
    if (el.tagName === 'BR') {
      out += '<br/>'
      return
    }
    const tag = el.tagName === 'B' ? 'strong' : el.tagName === 'I' ? 'em' : el.tagName.toLowerCase()
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '#'
      out += `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${sanitiseInline(el)}</a>`
    } else {
      out += `<${tag}>${sanitiseInline(el)}</${tag}>`
    }
  })
  return out
}

export interface HtmlImportOptions {
  /** Resolves an <img> element to an already-imported asset id, if any. */
  resolveImage?: (img: HTMLImageElement) => string | undefined
}

/**
 * Recognises verse markup and pulls the author's lines out of it, or returns
 * `null` if this element isn't verse.
 *
 * Poetry has no single markup in the wild. Real EPUBs use at least four
 * shapes, and this handles all of them because a book that loses its line
 * breaks has lost the poem:
 *
 * - `epub:type="z3998:verse"` (or `z3998:poem`) — the EPUB structural
 *   semantic, and what this app's own EPUB export writes.
 * - `class="poem"` / `"verse"` / `"stanza"` / `"linegroup"` / `"lg"` —
 *   the conventions publishers actually ship, including the `<lg>` naming
 *   inherited from TEI.
 * - `<pre>` — the plain-HTML author's way of saying "these breaks matter".
 * - Nested line groups: a poem whose stanzas are their own containers.
 *   Each nested group is separated by an empty entry, which is how
 *   `VerseBlock` records a stanza break.
 *
 * Lines are plain text (`textContent`), matching `ListBlock.items` and
 * `VerseBlock.lines`. Deliberately conservative: an element with no verse
 * marker is never guessed at, because promoting ordinary prose to verse
 * would strip its justification and indent it for no reason the author asked
 * for.
 */
const VERSE_CLASS = /(^|[\s-])(verse|poem|stanza|linegroup|lg)([\s-]|$)/i

function isVerseMarked(el: Element): boolean {
  if (el.tagName === 'PRE') return true
  const epubType = el.getAttribute('epub:type') ?? el.getAttribute('data-epub-type') ?? ''
  if (/z3998:(verse|poem)/i.test(epubType)) return true
  return VERSE_CLASS.test(el.getAttribute('class') ?? '')
}

/** The text of an element, split wherever a `<br>` breaks it. */
function splitOnBreaks(el: Element): string[] {
  const lines: string[] = []
  let current = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === 'BR') {
      lines.push(current)
      current = ''
      continue
    }
    current += node.textContent ?? ''
  }
  lines.push(current)
  return lines
}

function collectVerseLines(el: Element, lines: string[]): void {
  // A `<br>`-separated run is a leaf however many inline elements it holds.
  if (el.querySelector(':scope > br')) {
    lines.push(...splitOnBreaks(el))
    return
  }
  const children = Array.from(el.children)
  if (children.length === 0) {
    lines.push(el.textContent ?? '')
    return
  }
  for (const child of children) {
    if (child.tagName === 'BR') continue
    // A nested line group is a stanza: separate it from what came before.
    if (isVerseMarked(child) && child.children.length > 0) {
      if (lines.length > 0) lines.push('')
      collectVerseLines(child, lines)
      continue
    }
    collectVerseLines(child, lines)
  }
}

export function verseLinesFrom(el: Element): string[] | null {
  if (!isVerseMarked(el)) return null
  const raw = el.tagName === 'PRE' ? (el.textContent ?? '').split('\n') : []
  if (raw.length === 0) collectVerseLines(el, raw)
  const lines = raw.map((line) => line.replace(/\s+/g, ' ').trim())
  // Trim blank lines off both ends and collapse runs of them, so one stanza
  // break is one stanza break however the source spaced its markup.
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const collapsed = lines.filter((line, i) => line !== '' || lines[i - 1] !== '')
  return collapsed.some((line) => line !== '') ? collapsed : null
}

/** Parses an HTML document body into chapters, splitting on <h1>. Shared by
 * the .html and .docx (via mammoth → HTML) importers. */
export function parseHtmlDocument(html: string, fallbackTitle: string, options: HtmlImportOptions = {}): Chapter[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }

  const push = (block: ContentBlock) => current.blocks.push(block)

  for (const el of Array.from(doc.body.children)) {
    // Verse is checked before the tag switch because its container is often
    // a tag the switch already claims — `<blockquote class="poem">` is the
    // commonest single shape in real books, and reading it as a quote loses
    // every line break in the poem.
    const verseLines = verseLinesFrom(el)
    if (verseLines) {
      push({ id: generateId('blk'), type: 'verse', lines: verseLines })
      continue
    }
    switch (el.tagName) {
      case 'H1': {
        if (current.blocks.length > 0 || chapters.length > 0) chapters.push(current)
        current = { id: generateId('ch'), title: el.textContent?.trim() || fallbackTitle, order: chapters.length, blocks: [] }
        break
      }
      case 'H2':
      case 'H3':
        push({ id: generateId('blk'), type: 'heading', level: el.tagName === 'H2' ? 2 : 3, text: el.textContent?.trim() ?? '' })
        break
      case 'P': {
        const img = el.querySelector('img')
        if (img && options.resolveImage) {
          const assetId = options.resolveImage(img)
          if (assetId) {
            push({ id: generateId('blk'), type: 'image', assetId, rotation: 0, caption: img.getAttribute('alt') ?? undefined })
            break
          }
        }
        const text = sanitiseInline(el).trim()
        if (text) push({ id: generateId('blk'), type: 'paragraph', html: text })
        break
      }
      case 'IMG': {
        if (options.resolveImage) {
          const assetId = options.resolveImage(el as unknown as HTMLImageElement)
          if (assetId) push({ id: generateId('blk'), type: 'image', assetId, rotation: 0, caption: el.getAttribute('alt') ?? undefined })
        }
        break
      }
      case 'BLOCKQUOTE':
        push({ id: generateId('blk'), type: 'quote', text: el.textContent?.trim() ?? '' })
        break
      case 'UL':
      case 'OL':
        push({
          id: generateId('blk'),
          type: 'list',
          ordered: el.tagName === 'OL',
          items: Array.from(el.querySelectorAll(':scope > li')).map((li) => li.textContent?.trim() ?? ''),
        })
        break
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('td,th')).map((cell) => cell.textContent?.trim() ?? ''),
        )
        const [header, ...rest] = rows
        if (header) push({ id: generateId('blk'), type: 'table', header, rows: rest })
        break
      }
      default:
        break
    }
  }

  chapters.push(current)
  return chapters.filter((c) => c.blocks.length > 0).map((c, i) => ({ ...c, order: i }))
}
