import type { ContentBlock } from '@/types/content'
import { escapeXmlText, escapeXmlAttr } from '@/epub/xhtmlEscape'

/**
 * Converts one manuscript block to an XHTML fragment for EPUB export.
 * Deliberately much simpler than `src/blocks/types/*.tsx`'s `drawPdf`
 * functions: EPUB is reflowable HTML+CSS rendered by the reading app's own
 * layout engine, so there's no manual text-wrapping, pagination, or font
 * embedding to reimplement here the way the PDF exporter has to — real
 * semantic HTML plus the stylesheet `stylesheet.ts` generates from the
 * theme is enough for a correct, good-looking result across e-readers.
 *
 * `imageSrc(assetId)` resolves an asset id to its path inside the EPUB
 * package (`images/<assetId>.png` — every referenced image is rasterised to
 * PNG and collected into the archive by `exportEpub.ts` before any XHTML is
 * generated, so this function stays synchronous and never needs to know
 * about `assetStore`/`assetDb` itself).
 *
 * Body heading levels are shifted down one level from
 * `HeadingBlock.level` (1/2/3 → h2/h3/h4): each chapter's own XHTML file
 * uses its chapter title as that file's `<h1>`, so an in-body heading
 * needs to start at `<h2>` to keep a correct, unbroken heading outline —
 * exactly the concern `accessibility.ts`'s `headingHierarchySkipChecker`
 * checks for in the Virtual Editor, applied here to the export itself.
 *
 * `block.breakAfter` (Phase 51, manual page break) appends an empty
 * `.bs-page-break` div rather than threading a style attribute through
 * every case below — `stylesheet.ts` gives that class `page-break-after`/
 * `break-after`, which e-readers that paginate (most do, even though EPUB
 * content is reflowable) honour the same way a printed book would.
 */
export function blockToXhtml(block: ContentBlock, imageSrc: (assetId: string) => string): string {
  const html = blockToXhtmlContent(block, imageSrc)
  return block.breakAfter && html ? `${html}<div class="bs-page-break"></div>` : html
}

function blockToXhtmlContent(block: ContentBlock, imageSrc: (assetId: string) => string): string {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(block.level + 1, 6)
      return `<h${level}>${escapeXmlText(block.text)}</h${level}>`
    }
    case 'paragraph':
      // `block.html` already only contains the sanitised <strong>/<em>/<a>
      // subset (see `parser/html.ts`) — valid XHTML as-is, reused verbatim
      // exactly like the on-screen renderer's `dangerouslySetInnerHTML`.
      return `<p>${block.html}</p>`
    case 'image': {
      const alt = escapeXmlAttr(block.altText ?? block.caption ?? '')
      const rotation = block.rotation ? ` style="transform: rotate(${block.rotation}deg);"` : ''
      const img = `<img src="${imageSrc(block.assetId)}" alt="${alt}"${rotation} />`
      const caption = block.caption ? `<figcaption>${escapeXmlText(block.caption)}</figcaption>` : ''
      return `<figure class="bs-image">${img}${caption}</figure>`
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      const items = block.items.map((item) => `<li>${escapeXmlText(item)}</li>`).join('')
      return `<${tag}>${items}</${tag}>`
    }
    case 'table': {
      const header = `<tr>${block.header.map((cell) => `<th>${escapeXmlText(cell)}</th>`).join('')}</tr>`
      const rows = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeXmlText(cell)}</td>`).join('')}</tr>`)
        .join('')
      return `<table><thead>${header}</thead><tbody>${rows}</tbody></table>`
    }
    case 'quote': {
      const cite = block.attribution ? `<cite>${escapeXmlText(block.attribution)}</cite>` : ''
      return `<blockquote class="bs-quote"><p>${escapeXmlText(block.text)}</p>${cite}</blockquote>`
    }
    case 'pull-quote': {
      const cite = block.attribution ? `<cite>${escapeXmlText(block.attribution)}</cite>` : ''
      return `<aside class="bs-pull-quote"><p>${escapeXmlText(block.text)}</p>${cite}</aside>`
    }
    case 'callout': {
      const title = block.title ? `<p class="bs-callout-title">${escapeXmlText(block.title)}</p>` : ''
      return `<aside class="bs-callout bs-callout-${block.variant}">${title}<p>${escapeXmlText(block.text)}</p></aside>`
    }
    case 'case-study':
      return `<aside class="bs-case-study"><h3>${escapeXmlText(block.title)}</h3><p>${escapeXmlText(block.text)}</p></aside>`
    case 'timeline': {
      const entries = block.entries
        .map(
          (e) =>
            `<li><span class="bs-timeline-label">${escapeXmlText(e.label)}</span><p>${escapeXmlText(e.text)}</p></li>`,
        )
        .join('')
      return `<ol class="bs-timeline">${entries}</ol>`
    }
    case 'gallery': {
      const images = block.assetIds.map((id) => `<img src="${imageSrc(id)}" alt="" />`).join('')
      const caption = block.caption ? `<p class="bs-gallery-caption">${escapeXmlText(block.caption)}</p>` : ''
      return `<div class="bs-gallery">${images}</div>${caption}`
    }
    case 'faq': {
      const entries = block.entries
        .map((e) => `<dt>${escapeXmlText(e.question)}</dt><dd>${escapeXmlText(e.answer)}</dd>`)
        .join('')
      return `<dl class="bs-faq">${entries}</dl>`
    }
    case 'statistics': {
      const entries = block.entries
        .map(
          (e) =>
            `<div class="bs-stat"><span class="bs-stat-value">${escapeXmlText(e.value)}</span><span class="bs-stat-label">${escapeXmlText(e.label)}</span></div>`,
        )
        .join('')
      return `<div class="bs-statistics">${entries}</div>`
    }
    case 'checklist': {
      const items = block.items
        .map((i) => `<li class="${i.checked ? 'bs-checked' : ''}">${escapeXmlText(i.text)}</li>`)
        .join('')
      return `<ul class="bs-checklist">${items}</ul>`
    }
    case 'placeholder': {
      // Same "obvious visible marker, never a silent gap" treatment as the
      // PDF/on-screen renderer — see `types/content.ts`'s `PlaceholderBlock`
      // doc comment.
      const label = block.label || `${block.kind.charAt(0).toUpperCase()}${block.kind.slice(1)} placeholder`
      const description = block.description ? `<p class="bs-placeholder-description">${escapeXmlText(block.description)}</p>` : ''
      return `<div class="bs-placeholder"><p class="bs-placeholder-label">${escapeXmlText(label)}</p>${description}</div>`
    }
    default:
      return ''
  }
}
