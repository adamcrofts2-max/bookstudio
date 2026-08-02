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

/**
 * Maps one non-heading `marked` token to a `ContentBlock`, or `null` for
 * token types this parser doesn't represent (code fences, thematic breaks,
 * raw HTML, etc. — same "small, honest start" scope the rest of this parser
 * already has). Factored out of `parseMarkdown`'s loop so
 * `parseMarkdownDraftBlocks` below (AI-drafted-prose insertion, Phase F) can
 * reuse the exact same token→block mapping without a second hand-maintained
 * copy of it — headings are the only place the two callers differ (a
 * manuscript import's H1 starts a new chapter; a draft snippet has no
 * chapters to start, so its caller maps H1 to an ordinary level-1 heading
 * block instead), which is why heading handling stays in each caller rather
 * than in this shared function.
 */
function tokenToBlock(token: Tokens.Generic): ContentBlock | null {
  switch (token.type) {
    case 'paragraph': {
      const p = token as Tokens.Paragraph
      return { id: generateId('blk'), type: 'paragraph', html: inline(p.text) }
    }
    case 'blockquote': {
      const bq = token as Tokens.Blockquote
      const text = bq.tokens
        .map((t) => ('text' in t ? plain((t as Tokens.Paragraph).text) : ''))
        .filter(Boolean)
        .join(' ')
      return { id: generateId('blk'), type: 'quote', text }
    }
    case 'list': {
      const list = token as Tokens.List
      return {
        id: generateId('blk'),
        type: 'list',
        ordered: list.ordered,
        items: list.items.map((item) => plain(item.text)),
      }
    }
    case 'table': {
      const table = token as Tokens.Table
      return {
        id: generateId('blk'),
        type: 'table',
        header: table.header.map((c) => plain(c.text)),
        rows: table.rows.map((row) => row.map((c) => plain(c.text))),
      }
    }
    default:
      return null
  }
}

/** Parses Markdown source into chapters, splitting on level-1 headings. */
export function parseMarkdown(source: string, fallbackTitle: string): Chapter[] {
  const tokens = marked.lexer(source)
  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }
  let started = false

  const pushBlock = (block: ContentBlock) => current.blocks.push(block)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading
      const headingText = plain(heading.text)
      if (heading.depth === 1) {
        if (started || current.blocks.length > 0) chapters.push(current)
        current = { id: generateId('ch'), title: headingText, order: chapters.length, blocks: [] }
        started = true
        continue
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
        continue
      }
      pushBlock({ id: generateId('blk'), type: 'heading', level: heading.depth === 2 ? 2 : 3, text: headingText })
      continue
    }
    const block = tokenToBlock(token)
    if (block) pushBlock(block)
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

/**
 * Parses a short piece of Markdown-flavoured text — an AI's drafted prose,
 * pasted in for review before insertion (Phase F: "insert AI-drafted prose
 * into the manuscript with a reviewable diff", `docs/PLANNING_MODE_UX_AUDIT
 * .md` finding #2) — into a flat list of candidate `ContentBlock`s, with no
 * chapter-splitting concept at all: the caller already knows which existing
 * chapter and position it's inserting into (`AiDraftInsertDialog.tsx`),
 * unlike a whole-manuscript import. This is the one real difference from
 * `parseMarkdown` above: a "# Chapter 12" line in a draft isn't a new
 * chapter, it's just a heading block someone will likely delete or leave as
 * a scene-break marker, so every heading depth (including H1) maps straight
 * to a heading block via the same shared `tokenToBlock` this file's real
 * import path uses — no duplicate token-mapping logic to drift out of sync.
 */
export function parseMarkdownDraftBlocks(source: string): ContentBlock[] {
  const tokens = marked.lexer(source)
  const blocks: ContentBlock[] = []

  for (const token of tokens) {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading
      blocks.push({ id: generateId('blk'), type: 'heading', level: heading.depth === 1 ? 2 : heading.depth === 2 ? 2 : 3, text: plain(heading.text) })
      continue
    }
    const block = tokenToBlock(token)
    if (block) blocks.push(block)
  }

  return blocks
}
