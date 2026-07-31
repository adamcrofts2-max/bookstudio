import type { Manuscript } from '@/types/content'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import { resolveTheme } from '@/theme/presets'
import { getAssetBlob } from '@/store/assetDb'
import { blobToPng } from '@/pdf/imageForPdf'
import { blockToXhtml } from '@/epub/blockToXhtml'
import { structuralPageToXhtml } from '@/epub/structuralPageToXhtml'
import { buildEpubStylesheet } from '@/epub/stylesheet'
import { escapeXmlText } from '@/epub/xhtmlEscape'
import { collectImageAssetIds } from '@/epub/exportEpub'

/** Converts raw PNG bytes to a base64 `data:` URI, chunked to avoid
 * `String.fromCharCode(...bytes)` blowing the call stack on a large image
 * (`apply`/spread with tens of thousands of arguments can throw in some
 * engines) — 32KB chunks is comfortably under every browser's limit. */
function bytesToDataUri(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:image/png;base64,${btoa(binary)}`
}

/**
 * Renders the book to a single, self-contained `.html` file — the
 * "HTML / web-book export" item in `docs/ROADMAP.md` Phase D. Deliberately
 * reuses every EPUB-export building block (`blockToXhtml`,
 * `structuralPageToXhtml`, `buildEpubStylesheet`, the same
 * `collectImageAssetIds` scan) rather than re-implementing block-to-markup
 * conversion a third time (alongside the PDF exporter's per-block
 * `drawPdf` and the on-screen `Render`) — the only real difference from
 * `exportEpub.ts` is packaging: one flat HTML document instead of a zip,
 * with every image inlined as a base64 `data:` URI instead of a separate
 * file (so the result is a single file a user can email or drop on any
 * web host with zero other assets to keep track of), and chapters
 * addressed by in-page anchor links instead of separate spine documents,
 * since there's no navigation document format to speak of for a single
 * HTML file.
 */
export async function exportBookToHtml(
  manuscript: Manuscript,
  structuralPages: StructuralPage[],
  project: Project,
  bookTitle: string,
): Promise<Blob> {
  const theme = resolveTheme(project.settings.themeId)
  const language = project.settings.language || 'en'

  const imageDataUris = new Map<string, string>()
  for (const assetId of collectImageAssetIds(manuscript, structuralPages)) {
    const blob = await getAssetBlob(assetId)
    if (!blob) continue
    const { bytes } = await blobToPng(blob)
    imageDataUris.set(assetId, bytesToDataUri(bytes))
  }
  const imageSrc = (assetId: string) => imageDataUris.get(assetId) ?? ''

  const frontMatter = structuralPages.filter((p) => p.category === 'front-matter').sort((a, b) => a.order - b.order)
  const backMatter = structuralPages.filter((p) => p.category === 'back-matter').sort((a, b) => a.order - b.order)

  const sections: string[] = []
  for (const page of frontMatter) {
    const body = structuralPageToXhtml(page, imageSrc)
    if (body) sections.push(`<section class="bs-page">${body}</section>`)
  }
  for (const chapter of manuscript.chapters) {
    const bodyBlocks = chapter.blocks.map((block) => blockToXhtml(block, imageSrc)).join('\n')
    sections.push(`<section class="bs-chapter" id="${chapter.id}"><h1>${escapeXmlText(chapter.title)}</h1>${bodyBlocks}</section>`)
  }
  for (const page of backMatter) {
    const body = structuralPageToXhtml(page, imageSrc)
    if (body) sections.push(`<section class="bs-page">${body}</section>`)
  }

  const navItems = manuscript.chapters
    .map((chapter) => `<li><a href="#${chapter.id}">${escapeXmlText(chapter.title)}</a></li>`)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="${escapeXmlText(language)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXmlText(bookTitle)}</title>
<style>
${buildEpubStylesheet(theme)}
body { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem; }
nav.bs-web-toc { border-bottom: 1px solid ${theme.page.ruleColor}; margin-bottom: 2.5rem; padding-bottom: 1rem; }
nav.bs-web-toc ol { padding-left: 1.25rem; }
section.bs-chapter, section.bs-page { margin-bottom: 3rem; }
</style>
</head>
<body>
<nav class="bs-web-toc"><h2>Contents</h2><ol>${navItems}</ol></nav>
${sections.join('\n')}
</body>
</html>
`

  return new Blob([html], { type: 'text/html' })
}
