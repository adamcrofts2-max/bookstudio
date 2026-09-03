/**
 * Shared manuscript-import error base.
 *
 * Exists so the import UI can recognise a known, user-safe failure without
 * statically importing a parser module. A direct `import { EpubImportError }
 * from '@/parser/epub'` would pull the EPUB reader (and its ZIP inflate path)
 * into the main bundle, defeating the dynamic import that keeps it out of the
 * initial download for the majority of users who never import an EPUB.
 *
 * This module deliberately has no dependencies of its own.
 */
export class ManuscriptImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ManuscriptImportError'
  }
}
