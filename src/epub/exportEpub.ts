import type { Manuscript } from '@/types/content'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import { resolveTheme } from '@/theme/presets'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { blockToXhtml } from '@/epub/blockToXhtml'
import { structuralPageToXhtml } from '@/epub/structuralPageToXhtml'
import { buildEpubStylesheet } from '@/epub/stylesheet'
import { escapeXmlText, escapeXmlAttr } from '@/epub/xhtmlEscape'
import { buildZip, type ZipEntry } from '@/epub/zipWriter'

/** A `urn:uuid:`-prefixed `dc:identifier` needs an actual RFC 4122 UUID —
 * unlike every other id in this codebase (`generateId`), which
 * deliberately isn't UUID-shaped (it's prefixed, e.g. `book_...`). Falls
 * back to a manually-assembled v4-shaped string on the rare runtime
 * without `crypto.randomUUID` (matching `generateId`'s own fallback
 * philosophy), so this never throws even if a book is exported in an
 * unusually old browser. */
function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const hex = () => Math.floor(Math.random() * 16).toString(16)
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return template.replace(/[xy]/g, (c) => (c === 'x' ? hex() : ((Math.random() * 4) | 8).toString(16)))
}

const XHTML_HEAD = (title: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<meta charset="utf-8" />
<title>${escapeXmlText(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
`

const XHTML_FOOT = `
</body>
</html>
`

function xhtmlDocument(title: string, bodyHtml: string): Uint8Array {
  return new TextEncoder().encode(XHTML_HEAD(title) + bodyHtml + XHTML_FOOT)
}

/** Collects every image asset id referenced anywhere in the book (chapter
 * blocks + front-/back-matter structural pages) so `exportEpub`/
 * `exportHtmlBook` can fetch and embed each one exactly once, before any
 * XHTML referencing it is generated. Exported so the single-file HTML
 * exporter can reuse it instead of duplicating this scan. */
export function collectImageAssetIds(manuscript: Manuscript, structuralPages: StructuralPage[]): string[] {
  const ids = new Set<string>()
  for (const chapter of manuscript.chapters) {
    for (const block of chapter.blocks) {
      if (block.type === 'image') ids.add(block.assetId)
      if (block.type === 'gallery') for (const id of block.assetIds) ids.add(id)
    }
  }
  for (const page of structuralPages) {
    const imageAssetId = (page.content as { imageAssetId?: string }).imageAssetId
    if (imageAssetId) ids.add(imageAssetId)
  }
  return Array.from(ids)
}

interface SpineItem {
  id: string
  fileName: string
  title: string
  /** Whether this entry appears in the EPUB3 nav / EPUB2 NCX table of
   * contents — front-/back-matter pages are in the spine (so a reader can
   * page through them) but only chapters get their own nav entry, matching
   * how `ThumbnailRail`/`Sidebar`'s own chapter navigation works on screen
   * (structural pages aren't chapter-nav targets there either). */
  inNav: boolean
}

/**
 * Renders the manuscript + front-/back-matter structural pages to a real
 * EPUB3 file: `mimetype`, `META-INF/container.xml`, an EPUB3 nav document
 * (plus a `toc.ncx` for older-reader compatibility), one XHTML file per
 * chapter and per non-empty structural page, a theme-derived stylesheet,
 * and every referenced image rasterised to PNG and embedded — all zipped
 * with `zipWriter.ts`'s dependency-free writer.
 *
 * Unlike `exportBookToPdf`, this never touches `useExportStore`'s
 * paginated `layout` at all — EPUB is reflowable, so there's no
 * pagination, manual text-wrapping, or font-embedding step to reuse from
 * the PDF path; it works directly from the raw `Manuscript` and can run
 * even if the manuscript workspace hasn't rendered this session yet.
 */
export async function exportBookToEpub(
  manuscript: Manuscript,
  structuralPages: StructuralPage[],
  project: Project,
  bookTitle: string,
): Promise<Blob> {
  const theme = resolveTheme(project.settings.themeId)
  const titlePage = structuralPages.find((p) => p.type === 'title-page')
  const coverPage = structuralPages.find((p) => p.type === 'cover')
  const author = titlePage?.content.author ?? coverPage?.content.author ?? ''
  const language = project.settings.language || 'en'
  const bookId = `urn:uuid:${randomUuid()}`
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  // 1. Fetch + rasterise every referenced image once, up front, so every
  // XHTML-generation step below is synchronous.
  const imageEntries: ZipEntry[] = []
  const availableImageIds = new Set<string>()
  for (const assetId of collectImageAssetIds(manuscript, structuralPages)) {
    const blob = await getAssetBlob(assetId)
    if (!blob) continue
    const { bytes } = await blobToPng(blob)
    imageEntries.push({ name: `OEBPS/images/${assetId}.png`, data: bytes })
    availableImageIds.add(assetId)
  }
  const imageSrc = (assetId: string) => `images/${assetId}.png`

  // 2. Front-matter structural pages (in their stored order), skipping any
  // that render to `null` (blank pages, or pages with no content entered).
  const frontMatter = structuralPages
    .filter((p) => p.category === 'front-matter')
    .sort((a, b) => a.order - b.order)
  const backMatter = structuralPages
    .filter((p) => p.category === 'back-matter')
    .sort((a, b) => a.order - b.order)

  const xhtmlEntries: ZipEntry[] = []
  const spine: SpineItem[] = []

  const addStructuralPages = (pages: StructuralPage[]) => {
    for (const page of pages) {
      const body = structuralPageToXhtml(page, imageSrc)
      if (body === null) continue
      const fileName = `page-${page.id.replace(/[^a-zA-Z0-9-]/g, '')}.xhtml`
      xhtmlEntries.push({ name: `OEBPS/${fileName}`, data: xhtmlDocument(bookTitle, body) })
      spine.push({ id: `page-${page.id.replace(/[^a-zA-Z0-9-]/g, '')}`, fileName, title: bookTitle, inNav: false })
    }
  }

  addStructuralPages(frontMatter)

  // 3. One XHTML file per chapter — its own title as `<h1>`, then every
  // block converted via `blockToXhtml`.
  manuscript.chapters.forEach((chapter, index) => {
    const bodyBlocks = chapter.blocks.map((block) => blockToXhtml(block, imageSrc)).join('\n')
    const body = `<h1>${escapeXmlText(chapter.title)}</h1>\n${bodyBlocks}`
    const fileName = `chapter-${index + 1}.xhtml`
    xhtmlEntries.push({ name: `OEBPS/${fileName}`, data: xhtmlDocument(chapter.title, body) })
    spine.push({ id: `chapter-${index + 1}`, fileName, title: chapter.title, inNav: true })
  })

  addStructuralPages(backMatter)

  // 4. Nav document (EPUB3, required) + NCX (EPUB2, compatibility only).
  const navItems = spine.filter((s) => s.inNav)
  const navListItems = navItems.map((s) => `<li><a href="${s.fileName}">${escapeXmlText(s.title)}</a></li>`).join('')
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8" /><title>${escapeXmlText(bookTitle)}</title><link rel="stylesheet" type="text/css" href="styles.css" /></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navListItems}</ol></nav>
</body>
</html>
`
  const ncxNavPoints = navItems
    .map(
      (s, i) =>
        `<navPoint id="navpoint-${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXmlText(s.title)}</text></navLabel><content src="${s.fileName}" /></navPoint>`,
    )
    .join('')
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXmlAttr(bookId)}" /></head>
<docTitle><text>${escapeXmlText(bookTitle)}</text></docTitle>
<navMap>${ncxNavPoints}</navMap>
</ncx>
`

  // 5. Package document (content.opf): metadata + manifest + spine.
  const manifestItems: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
    '<item id="css" href="styles.css" media-type="text/css" />',
  ]
  for (const s of spine) {
    const mediaType = 'application/xhtml+xml'
    manifestItems.push(`<item id="${s.id}" href="${s.fileName}" media-type="${mediaType}" />`)
  }
  // The cover image gets EPUB3's `properties="cover-image"` manifest flag
  // (and, below, an EPUB2-compatibility `<meta name="cover">` pointer) so
  // e-readers, Kindle Previewer, and library-grid views show the actual
  // artwork as the book's thumbnail instead of a generic placeholder —
  // previously missing entirely, meaning the exported EPUB likely never
  // displayed a real cover anywhere outside the book's own first page. See
  // docs/STATUS.md Phase 46.
  const coverImageAssetId = coverPage?.content.imageAssetId
  const coverIsAvailable = !!coverImageAssetId && availableImageIds.has(coverImageAssetId)
  for (const assetId of availableImageIds) {
    const isCover = coverIsAvailable && assetId === coverImageAssetId
    const properties = isCover ? ' properties="cover-image"' : ''
    manifestItems.push(`<item id="img-${assetId}" href="images/${assetId}.png" media-type="image/png"${properties} />`)
  }
  const spineItems = spine.map((s) => `<itemref idref="${s.id}" />`).join('')

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXmlText(bookId)}</dc:identifier>
<dc:title>${escapeXmlText(bookTitle)}</dc:title>
<dc:language>${escapeXmlText(language)}</dc:language>
${author ? `<dc:creator>${escapeXmlText(author)}</dc:creator>` : ''}
<meta property="dcterms:modified">${modified}</meta>
${coverIsAvailable ? `<meta name="cover" content="img-${coverImageAssetId}" />` : ''}
</metadata>
<manifest>
${manifestItems.join('\n')}
</manifest>
<spine toc="ncx">
${spineItems}
</spine>
</package>
`

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
</rootfiles>
</container>
`

  const encoder = new TextEncoder()
  const entries: ZipEntry[] = [
    // Per the EPUB spec, `mimetype` must be the first entry in the archive
    // and stored (uncompressed) — some readers use its fixed offset/size to
    // quickly sniff a valid EPUB before parsing anything else.
    { name: 'mimetype', data: encoder.encode('application/epub+zip'), store: true },
    { name: 'META-INF/container.xml', data: encoder.encode(containerXml) },
    { name: 'OEBPS/content.opf', data: encoder.encode(contentOpf) },
    { name: 'OEBPS/nav.xhtml', data: encoder.encode(navXhtml) },
    { name: 'OEBPS/toc.ncx', data: encoder.encode(tocNcx) },
    { name: 'OEBPS/styles.css', data: encoder.encode(buildEpubStylesheet(theme)) },
    ...xhtmlEntries,
    ...imageEntries,
  ]

  return buildZip(entries)
}
