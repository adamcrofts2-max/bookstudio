import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
// @ts-expect-error -- test shim
globalThis.DOMParser = dom.window.DOMParser
// @ts-expect-error -- test shim
globalThis.Node = dom.window.Node

import { parseMarkdown } from '../src/parser/markdown'
import { parseText } from '../src/parser/text'
import { parseHtmlDocument } from '../src/parser/html'
import { paginate } from '../src/renderer/paginate'
import type { ContentBlock } from '../src/types/content'

let failures = 0
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

// --- Markdown parsing ---
const md = `# Chapter One\n\nThis is **bold** and *italic* text in the opening paragraph.\n\n## A subheading\n\n- item one\n- item two\n\n> A wise quote\n\n# Chapter Two\n\nSecond chapter content here.\n`
const mdChapters = parseMarkdown(md, 'Fallback')
check('markdown: splits into 2 chapters', mdChapters.length === 2)
check('markdown: chapter 1 titled correctly', mdChapters[0].title === 'Chapter One')
check('markdown: chapter 2 titled correctly', mdChapters[1].title === 'Chapter Two')
check('markdown: paragraph has inline bold', mdChapters[0].blocks.some((b) => b.type === 'paragraph' && b.html.includes('<strong>')))
check('markdown: heading block level 2 present', mdChapters[0].blocks.some((b) => b.type === 'heading' && b.level === 2))
check('markdown: list block present with 2 items', mdChapters[0].blocks.some((b) => b.type === 'list' && b.items.length === 2))
check('markdown: quote block present', mdChapters[0].blocks.some((b) => b.type === 'quote'))

// --- Text parsing ---
const txt = `Chapter One\n\nFirst paragraph of chapter one.\n\nSecond paragraph.\n\nChapter Two\n\nContent of chapter two.`
const txtChapters = parseText(txt, 'Fallback')
check('text: splits into 2 chapters', txtChapters.length === 2)
check('text: chapter 1 has 2 paragraphs', txtChapters[0].blocks.length === 2)

// --- HTML parsing ---
const html = `<h1>Chapter One</h1><p>Hello <strong>world</strong></p><h1>Chapter Two</h1><p>Second</p>`
const htmlChapters = parseHtmlDocument(html, 'Fallback')
check('html: splits into 2 chapters', htmlChapters.length === 2)
check('html: sanitised strong tag preserved', htmlChapters[0].blocks.some((b) => b.type === 'paragraph' && b.html.includes('<strong>')))

// --- Pagination ---
const bigChapters = [
  { id: 'c1', title: 'Chapter One', order: 0, blocks: Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, type: 'paragraph', html: `p${i}` }) as ContentBlock) },
  { id: 'c2', title: 'Chapter Two', order: 1, blocks: Array.from({ length: 10 }, (_, i) => ({ id: `b2_${i}`, type: 'paragraph', html: `p${i}` }) as ContentBlock) },
]
const contentHeight = 500
const { pages, toc } = paginate(bigChapters, () => 60, contentHeight, 100)
check('paginate: produces multiple pages', pages.length > 3)
check('paginate: page 1 is TOC', pages[0].kind === 'toc')
check('paginate: toc has 2 entries', toc.length === 2)
const chapterStarts = pages.filter((p) => p.kind === 'chapter-start')
check('paginate: 2 chapter-start pages', chapterStarts.length === 2)
check('paginate: all chapter starts on odd (recto) page numbers', chapterStarts.every((p) => p.number % 2 === 1))
const allBlockIds = pages.flatMap((p) => p.blocks.map((b) => b.id))
const expectedBlockIds = bigChapters.flatMap((c) => c.blocks.map((b) => b.id))
check('paginate: no blocks lost or duplicated', allBlockIds.length === expectedBlockIds.length && new Set(allBlockIds).size === allBlockIds.length)
check('paginate: block order preserved within manuscript', JSON.stringify(allBlockIds) === JSON.stringify(expectedBlockIds))
// verify no page overflows content height
const overflow = pages.some((p) => {
  const total = p.blocks.reduce((sum) => sum + 60, 0)
  return total > contentHeight + 200 // + generous slack for opener spacer/orphan guard edge cases
})
check('paginate: no page grossly overflows content height', !overflow)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
