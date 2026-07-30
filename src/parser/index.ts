import type { Manuscript } from '@/types/content'
import { parseMarkdown } from '@/parser/markdown'
import { parseText } from '@/parser/text'
import { parseHtmlDocument } from '@/parser/html'

export class UnsupportedManuscriptFormatError extends Error {
  constructor(extension: string) {
    super(`Unsupported manuscript format: "${extension}". Supported: .docx, .md, .txt, .html`)
    this.name = 'UnsupportedManuscriptFormatError'
  }
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled Chapter'
}

/** Imports a manuscript file into the Content layer shape. Never touches
 * Project, Theme or Layout data — see docs/SYSTEM_ARCHITECTURE.md. */
export async function importManuscript(file: File, projectId: string): Promise<Manuscript> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fallbackTitle = titleFromFileName(file.name)

  const chapters = await (async () => {
    switch (extension) {
      case 'md':
      case 'markdown':
        return parseMarkdown(await file.text(), fallbackTitle)
      case 'txt':
        return parseText(await file.text(), fallbackTitle)
      case 'html':
      case 'htm':
        return parseHtmlDocument(await file.text(), fallbackTitle)
      case 'docx': {
        const { parseDocx } = await import('@/parser/docx')
        return parseDocx(file, fallbackTitle, projectId)
      }
      default:
        throw new UnsupportedManuscriptFormatError(extension)
    }
  })()

  return { chapters, importedAt: new Date().toISOString(), sourceFileName: file.name }
}

export { UnsupportedManuscriptFormatError as ManuscriptImportError }
