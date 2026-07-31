import { marked, type Tokens } from 'marked'

import type { Chapter, ContentBlock } from '@/types/content'
import { generateId } from '@/utils'

function inline(text: string): string {
  return marked.parseInline(text, { async: false }) as string
}

function plain(text: string): string {
  return text.replace(/[*_`~]/g, '').trim()
}

/** Matches a manually-authored "Contents" / "Table of Contents" heading —
 * see the `heading` case below for why this section is dropped rather than
 * imported. */
const CONTENTS_HEADING = /^(table of )?contents$/i

/** Parses Markdown source into chapters, splitting on level-1 headings. */
export function parseMarkdown(source: string, fallbackTitle: string): Chapter[] {
  const tokens = marked.lexer(source)
  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }
  let started = false

  const pushBlock = (block: ContentBlock) => current.blocks.push(block)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading
        const headingText = plain(heading.text)
        if (heading.depth === 1) {
          if (started || current.blocks.length > 0) chapters.push(current)
          current = { id: generateId('ch'), title: headingText, order: chapters.length, blocks: [] }
          started = true
          break
        }
        // A manuscript's own hand-typed "Contents" list (heading + a list of
        // chapter links) is always redundant with — and, worse, permanently
        // out of sync with — Book Studio's real, auto-generated Table of
        // Contents page (`paginate.ts` reserves page 1 for it from the
        // actual parsed chapters). Importing it as ordinary body content
        // produced two visibly different "contents" pages a few leaves
        // apart: the real one, and this stale, broken one (markdown link
        // syntax like `[Chapter One](#anchor)` isn't resolved by `plain()`,
        // so it rendered as literal bracket-and-parenthesis text too).
        // Dropping the heading and the list immediately after it removes
        // both problems at the source.
        if (CONTENTS_HEADING.test(headingText)) {
          if (tokens[i + 1]?.type === 'list') i++
          break
        }
        pushBlock({
          id: generateId('blk'),
          type: 'heading',
          level: heading.depth === 2 ? 2 : 3,
          text: headingText,
        })
        break
      }
      case 'paragraph': {
        const p = token as Tokens.Paragraph
        pushBlock({ id: generateId('blk'), type: 'paragraph', html: inline(p.text) })
        break
      }
      case 'blockquote': {
        const bq = token as Tokens.Blockquote
        const text = bq.tokens
          .map((t) => ('text' in t ? plain((t as Tokens.Paragraph).text) : ''))
          .filter(Boolean)
          .join(' ')
        pushBlock({ id: generateId('blk'), type: 'quote', text })
        break
      }
      case 'list': {
        const list = token as Tokens.List
        pushBlock({
          id: generateId('blk'),
          type: 'list',
          ordered: list.ordered,
          items: list.items.map((item) => plain(item.text)),
        })
        break
      }
      case 'table': {
        const table = token as Tokens.Table
        pushBlock({
          id: generateId('blk'),
          type: 'table',
          header: table.header.map((c) => plain(c.text)),
          rows: table.rows.map((row) => row.map((c) => plain(c.text))),
        })
        break
      }
      default:
        break
    }
  }

  chapters.push(current)

  // Many manuscripts open with a title-page-style H1 (the book's own
  // title, maybe a subtitle as an H2) before the real first chapter — with
  // the Contents section already stripped above, a "chapter" like that has
  // nothing left but heading blocks, no real paragraph/list/table/quote
  // content. Importing it as "Chapter 1" would both waste a chapter slot
  // and shift every real chapter's auto-generated opener number/word one
  // higher than the number already embedded in its own title text (see
  // `renderer/chapterOpenerLabel.ts`) — e.g. a manuscript's own "Chapter
  // One: ..." heading rendering under an auto-generated "Chapter Two"
  // label. Only the leading run of such chapters is dropped — a heading-
  // only chapter that isn't first is left alone, since that's a much odder,
  // deliberate-looking structure this shouldn't guess about.
  const isHeadingOnly = (c: Chapter) => c.blocks.length > 0 && c.blocks.every((b) => b.type === 'heading')
  while (chapters.length > 1 && isHeadingOnly(chapters[0])) {
    chapters.shift()
  }

  return chapters.filter((c) => c.blocks.length > 0).map((c, i) => ({ ...c, order: i }))
}
