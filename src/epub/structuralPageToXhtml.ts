import type { StructuralPage } from '@/types/structuralPage'
import { escapeXmlText } from '@/epub/xhtmlEscape'

/** Splits free-form text on blank lines into `<p>` tags, matching how every
 * "long-form" structural page (Copyright/Dedication/Foreword/etc.) already
 * treats its `text` field on screen — see `src/structuralPages/longForm.tsx`. */
function textToParagraphs(text: string | undefined): string {
  if (!text?.trim()) return ''
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeXmlText(para)}</p>`)
    .join('')
}

/**
 * Converts one structural (front-/back-matter) page to an XHTML fragment
 * for EPUB export, or `null` when the page has nothing meaningful to
 * contribute to a reflowable ebook — see the two documented skips below.
 *
 * `imageSrc(assetId)` resolves an asset id exactly like
 * `blockToXhtml.ts`'s own parameter of the same name — every referenced
 * image is already rasterised and collected into the archive by
 * `exportEpub.ts` before this function ever runs.
 */
export function structuralPageToXhtml(page: StructuralPage, imageSrc: (assetId: string) => string): string | null {
  switch (page.type) {
    case 'blank':
      // A blank page exists purely to force the next structural/chapter
      // page onto a recto (right-hand) page in *fixed* print pagination —
      // a concept reflowable EPUB text has no equivalent of. Skipped
      // entirely, not rendered as an empty page, per this file's own
      // "honest, not silently faked" standard.
      return null

    case 'cover': {
      const { title, subtitle, author, imageAssetId } = page.content
      const image = imageAssetId ? `<img class="bs-cover-image" src="${imageSrc(imageAssetId)}" alt="" />` : ''
      return `<div class="bs-cover-page">${image}<div class="bs-cover-text">${title ? `<h1>${escapeXmlText(title)}</h1>` : ''}${subtitle ? `<p class="bs-subtitle">${escapeXmlText(subtitle)}</p>` : ''}${author ? `<p class="bs-author">${escapeXmlText(author)}</p>` : ''}</div></div>`
    }

    case 'title-page': {
      const { title, subtitle, author } = page.content
      return `<div class="bs-title-page">${title ? `<h1>${escapeXmlText(title)}</h1>` : ''}${subtitle ? `<p class="bs-subtitle">${escapeXmlText(subtitle)}</p>` : ''}${author ? `<p class="bs-author">${escapeXmlText(author)}</p>` : ''}</div>`
    }

    case 'half-title':
      return page.content.title ? `<div class="bs-half-title"><h1>${escapeXmlText(page.content.title)}</h1></div>` : null

    case 'copyright':
      return page.content.text?.trim() ? `<div class="bs-copyright">${textToParagraphs(page.content.text)}</div>` : null

    case 'dedication':
      return page.content.text?.trim() ? `<div class="bs-dedication">${textToParagraphs(page.content.text)}</div>` : null

    case 'foreword': {
      const { text, authorName } = page.content
      if (!text?.trim()) return null
      const attribution = authorName ? `<p class="bs-attribution">— ${escapeXmlText(authorName)}</p>` : ''
      return `<div class="bs-foreword"><h1>Foreword</h1>${textToParagraphs(text)}${attribution}</div>`
    }

    case 'preface':
      return page.content.text?.trim() ? `<div class="bs-preface"><h1>Preface</h1>${textToParagraphs(page.content.text)}</div>` : null

    case 'acknowledgements':
      return page.content.text?.trim()
        ? `<div class="bs-acknowledgements"><h1>Acknowledgements</h1>${textToParagraphs(page.content.text)}</div>`
        : null

    case 'conclusion':
      return page.content.text?.trim() ? `<div class="bs-conclusion"><h1>Conclusion</h1>${textToParagraphs(page.content.text)}</div>` : null

    case 'appendix': {
      const { title, text } = page.content
      if (!text?.trim() && !title?.trim()) return null
      return `<div class="bs-appendix"><h1>${escapeXmlText(title || 'Appendix')}</h1>${textToParagraphs(text)}</div>`
    }

    case 'about-the-author': {
      const { text, imageAssetId } = page.content
      if (!text?.trim() && !imageAssetId) return null
      const image = imageAssetId ? `<img class="bs-author-image" src="${imageSrc(imageAssetId)}" alt="" />` : ''
      return `<div class="bs-about-author"><h1>About the Author</h1>${image}${textToParagraphs(text)}</div>`
    }

    case 'bibliography': {
      const entries = page.content.entries ?? []
      if (entries.length === 0) return null
      const items = entries.map((entry) => `<li>${escapeXmlText(entry)}</li>`).join('')
      return `<div class="bs-bibliography"><h1>Bibliography</h1><ul>${items}</ul></div>`
    }

    case 'glossary': {
      const entries = page.content.entries ?? []
      if (entries.length === 0) return null
      const items = entries
        .map((e) => `<dt>${escapeXmlText(e.term)}</dt><dd>${escapeXmlText(e.definition)}</dd>`)
        .join('')
      return `<div class="bs-glossary"><h1>Glossary</h1><dl>${items}</dl></div>`
    }

    case 'index': {
      // No page numbers — reflowable EPUB text has no fixed page numbers
      // for an index to point to (a documented simplification, not a bug;
      // see this file's header comment for the same reasoning applied to
      // `blank` pages above).
      const entries = page.content.entries ?? []
      if (entries.length === 0) return null
      const items = entries.map((entry) => `<li>${escapeXmlText(entry)}</li>`).join('')
      return `<div class="bs-index"><h1>Index</h1><ul class="bs-index-list">${items}</ul></div>`
    }

    case 'isbn-page': {
      const { isbn, edition, printerInfo } = page.content
      if (!isbn && !edition && !printerInfo) return null
      const lines = [
        isbn ? `<p>ISBN: ${escapeXmlText(isbn)}</p>` : '',
        edition ? `<p>${escapeXmlText(edition)}</p>` : '',
        printerInfo ? `<p>${escapeXmlText(printerInfo)}</p>` : '',
      ].join('')
      return `<div class="bs-isbn-page">${lines}</div>`
    }

    case 'barcode':
      // The scannable barcode graphic itself is a physical-print
      // back-cover requirement with no meaning in a reflowable ebook file
      // — only the human-readable ISBN text carries over.
      return page.content.isbn ? `<div class="bs-barcode-page"><p>ISBN: ${escapeXmlText(page.content.isbn)}</p></div>` : null

    case 'back-cover': {
      const { blurb, authorBio } = page.content
      if (!blurb?.trim() && !authorBio?.trim()) return null
      return `<div class="bs-back-cover"><h1>About This Book</h1>${textToParagraphs(blurb)}${authorBio ? `<p class="bs-attribution">${escapeXmlText(authorBio)}</p>` : ''}</div>`
    }

    default:
      return null
  }
}
