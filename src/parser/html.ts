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

/** Parses an HTML document body into chapters, splitting on <h1>. Shared by
 * the .html and .docx (via mammoth → HTML) importers. */
export function parseHtmlDocument(html: string, fallbackTitle: string, options: HtmlImportOptions = {}): Chapter[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }

  const push = (block: ContentBlock) => current.blocks.push(block)

  for (const el of Array.from(doc.body.children)) {
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
