import type { Chapter } from '@/types/content'
import type { ImageAsset } from '@/types/asset'
import { generateId } from '@/utils'
import { putAsset } from '@/store/assetDb'
import { readZip } from '@/epub/zipReader'
import { parseHtmlDocument } from '@/parser/html'
import { ManuscriptImportError } from '@/parser/errors'

/**
 * EPUB manuscript import.
 *
 * Book Studio already exported EPUB but could not read one, so a book could
 * not be reopened from its own output. This closes that, and reuses two
 * subsystems already in the codebase rather than adding anything new:
 * `epub/zipReader.ts` (a generic ZIP reader, not EPUB-specific — see its own
 * doc comment) and `parser/html.ts`'s `parseHtmlDocument`, the same block
 * converter the `.html` and `.docx` importers go through. No new dependency.
 *
 * An EPUB is a ZIP of XHTML documents listed in reading order by the package
 * document's spine. The work here is therefore: find the package document,
 * read the spine, and hand each document to the existing HTML parser in the
 * right shape.
 *
 * Two shaping steps are needed before that hand-off, both because real EPUBs
 * do not look like the flat HTML the existing parser expects:
 *
 *  - **Flattening.** `parseHtmlDocument` walks `document.body.children` —
 *    direct children only. Real EPUBs wrap content in section/div containers,
 *    so without flattening almost every paragraph of a real book would be
 *    silently skipped. Block elements are hoisted to the top level in document
 *    order first.
 *  - **Heading promotion.** `parseHtmlDocument` starts a new chapter at an
 *    `<h1>`. EPUB documents commonly title their chapter with an `<h2>`, so
 *    the first heading in each document is promoted to `<h1>`, making the
 *    existing chapter-splitting behave identically to an `.html` import.
 */

const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'IMG'])

/** Tags that style text without breaking it into a new block. An element
 * whose children are all inline is the innermost text-bearing element — the
 * thing that should become one paragraph. */
const INLINE_TAGS = new Set([
  'A', 'ABBR', 'B', 'BR', 'CITE', 'CODE', 'EM', 'I', 'Q', 'S', 'SMALL',
  'SPAN', 'STRONG', 'SUB', 'SUP', 'U', 'VAR', 'WBR',
])

/** True when every element child is inline, so this element holds one run of
 * text rather than a structure of further blocks. */
function isTextLeaf(el: Element): boolean {
  return Array.from(el.children).every((child) => INLINE_TAGS.has(child.tagName))
}

export class EpubImportError extends ManuscriptImportError {
  constructor(message: string) {
    super(message)
    this.name = 'EpubImportError'
  }
}

/** Resolves an href against the package document's directory, collapsing
 * `../` segments — spine and image hrefs are relative to the OPF, which is
 * usually one directory down from the archive root. */
function resolvePath(baseDir: string, href: string): string {
  const stripped = href.split('#')[0] ?? href
  const segments = (baseDir + stripped).split('/')
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

/**
 * Hoists every block-level element to the top level in document order, and
 * promotes the first heading to `<h1>`. Returns a body-only HTML string ready
 * for `parseHtmlDocument`.
 */
function flattenForImport(xhtml: string, doc: Document): string {
  const body = doc.body
  if (!body) return xhtml

  const blocks: Element[] = []
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (BLOCK_TAGS.has(child.tagName)) {
        // A container that also holds block children (a <p> wrapping an
        // <img>, say) is kept whole — the existing parser already handles
        // that case, and splitting it would lose the association.
        blocks.push(child)
        continue
      }
      // A non-block element whose children are all inline is a line of text
      // in a container the spec doesn't name — most importantly a verse line
      // (`<div class="line">`), which is how poetry is marked up throughout
      // real EPUBs. Walking past these silently drops every line of verse in
      // the book, so they are emitted as their own paragraph each, one per
      // line, which is what preserves the shape of the poetry.
      if (isTextLeaf(child)) {
        if ((child.textContent ?? '').trim() !== '') blocks.push(child)
        continue
      }
      walk(child)
    }
  }
  walk(body)

  const out = doc.implementation.createHTMLDocument('')
  let promoted = false
  for (const block of blocks) {
    const clone = block.cloneNode(true) as Element
    if (!promoted && /^H[1-6]$/.test(clone.tagName)) {
      const heading = out.createElement('h1')
      heading.textContent = clone.textContent
      out.body.appendChild(heading)
      promoted = true
      continue
    }
    // Anything below h3 has no representation in the Content layer; demote to
    // h3 rather than dropping the text entirely.
    if (/^H[4-6]$/.test(clone.tagName)) {
      const heading = out.createElement('h3')
      heading.textContent = clone.textContent
      out.body.appendChild(heading)
      continue
    }
    // A text-leaf that isn't already a recognised block (a verse line) is
    // re-tagged as a paragraph, keeping its inline markup so emphasis and
    // links survive `sanitiseInline`.
    if (!BLOCK_TAGS.has(clone.tagName)) {
      const paragraph = out.createElement('p')
      paragraph.innerHTML = clone.innerHTML
      out.body.appendChild(paragraph)
      continue
    }
    out.body.appendChild(out.importNode(clone, true))
  }
  return out.body.innerHTML
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  // Mirrors `parser/docx.ts`. Guarded because `Image`/`createObjectURL` do not
  // exist in the jsdom test harness, where dimensions simply aren't needed.
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return { width: 0, height: 0 }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const el = new Image()
    el.onload = () => {
      resolve({ width: el.naturalWidth, height: el.naturalHeight })
      URL.revokeObjectURL(url)
    }
    el.onerror = () => resolve({ width: 0, height: 0 })
    el.src = url
  })
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

export async function parseEpub(file: File, fallbackTitle: string, projectId: string): Promise<Chapter[]> {
  // An EPUB is a ZIP, so anything that isn't one fails here first. The ZIP
  // reader raises its own low-level error ("no end-of-central-directory
  // record"), which is accurate but meaningless to an author who picked the
  // wrong file — so it's translated rather than shown.
  let entries
  try {
    entries = await readZip(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new EpubImportError('This file isn’t a readable EPUB. It may be corrupt, or renamed from another format.')
  }
  const byName = new Map(entries.map((e) => [e.name, e.data]))
  const decoder = new TextDecoder()

  const container = byName.get('META-INF/container.xml')
  if (!container) throw new EpubImportError('This file isn’t a valid EPUB — its container is missing.')
  const opfPath = /full-path="([^"]+)"/.exec(decoder.decode(container))?.[1]
  if (!opfPath) throw new EpubImportError('This EPUB doesn’t say where its contents are.')
  const opfBytes = byName.get(opfPath)
  if (!opfBytes) throw new EpubImportError('This EPUB’s contents are missing.')

  const opf = decoder.decode(opfBytes)
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  // manifest: id -> { href, properties }
  const manifest = new Map<string, { href: string; properties: string }>()
  for (const match of opf.matchAll(/<item\b[^>]*>/g)) {
    const tag = match[0]
    const id = /\bid="([^"]+)"/.exec(tag)?.[1]
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1]
    if (id && href) manifest.set(id, { href, properties: /\bproperties="([^"]*)"/.exec(tag)?.[1] ?? '' })
  }

  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)].map((m) => m[1]!)
  if (spine.length === 0) throw new EpubImportError('This EPUB has no readable contents.')

  const bookTitle = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1]?.replace(/\s+/g, ' ').trim()

  // Import every referenced image once, up front, so a picture used by two
  // documents doesn't land in the asset library twice.
  const assetIdByPath = new Map<string, string>()
  for (const entry of entries) {
    const extension = entry.name.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = MIME_BY_EXTENSION[extension]
    if (!mimeType) continue
    const blob = new Blob([entry.data as BlobPart], { type: mimeType })
    const assetId = generateId('asset')
    const dims = await imageDimensions(blob)
    const asset: ImageAsset = {
      id: assetId,
      projectId,
      name: entry.name.split('/').pop() ?? entry.name,
      mimeType,
      size: blob.size,
      width: dims.width,
      height: dims.height,
      createdAt: new Date().toISOString(),
    }
    await putAsset(asset, blob)
    assetIdByPath.set(entry.name, assetId)
  }

  const parser = new DOMParser()
  const chapters: Chapter[] = []

  for (const idref of spine) {
    const item = manifest.get(idref)
    if (!item) continue
    // The navigation document is a machine-generated table of contents.
    // Book Studio builds its own TOC from real page numbers, so importing
    // this one would add a chapter of dead links.
    if (item.properties.split(/\s+/).includes('nav')) continue

    const path = resolvePath(opfDir, item.href)
    const data = byName.get(path)
    if (!data) continue

    const xhtml = decoder.decode(data)
    const doc = parser.parseFromString(xhtml, 'text/html')
    const docDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const flattened = flattenForImport(xhtml, doc)

    const parsed = parseHtmlDocument(flattened, bookTitle || fallbackTitle, {
      resolveImage: (img) => {
        const src = img.getAttribute('src')
        if (!src) return undefined
        return assetIdByPath.get(resolvePath(docDir, src))
      },
    })

    // A spine entry with no text and no images contributes nothing — a cover
    // wrapper or a spacer page. Dropping it avoids a run of empty chapters,
    // and drops no content, because there is none.
    for (const chapter of parsed) {
      if (chapter.blocks.length === 0) continue
      chapters.push({ ...chapter, order: chapters.length })
    }
  }

  if (chapters.length === 0) throw new EpubImportError('No readable text was found in this EPUB.')
  return chapters
}
