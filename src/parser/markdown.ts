import { marked, type Tokens } from 'marked'

import type { Chapter, ContentBlock } from '@/types/content'
import { generateId } from '@/utils'

function inline(text: string): string {
  return marked.parseInline(text, { async: false }) as string
}

function plain(text: string): string {
  return text.replace(/[*_`~]/g, '').trim()
}

/** Parses Markdown source into chapters, splitting on level-1 headings. */
export function parseMarkdown(source: string, fallbackTitle: string): Chapter[] {
  const tokens = marked.lexer(source)
  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }
  let started = false

  const pushBlock = (block: ContentBlock) => current.blocks.push(block)

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const heading = token as Tokens.Heading
        if (heading.depth === 1) {
          if (started || current.blocks.length > 0) chapters.push(current)
          current = { id: generateId('ch'), title: plain(heading.text), order: chapters.length, blocks: [] }
          started = true
          break
        }
        pushBlock({
          id: generateId('blk'),
          type: 'heading',
          level: heading.depth === 2 ? 2 : 3,
          text: plain(heading.text),
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
  return chapters.filter((c) => c.blocks.length > 0).map((c, i) => ({ ...c, order: i }))
}
