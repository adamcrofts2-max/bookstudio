import { JSDOM } from 'jsdom'

// `url` is required so `localStorage` isn't on an opaque origin — needed by
// the zustand `persist` middleware (contentStore) exercised further below.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
// @ts-expect-error -- test shim
globalThis.DOMParser = dom.window.DOMParser
// @ts-expect-error -- test shim
globalThis.Node = dom.window.Node
// @ts-expect-error -- test shim
globalThis.localStorage = dom.window.localStorage
// zustand's `persist` middleware defaults to `window.localStorage` (not
// `globalThis.localStorage`) — without this, storage silently "fails" and
// persist logs a console warning on every write, even though state updates
// still work in-memory.
// @ts-expect-error -- test shim
globalThis.window = dom.window

import { parseMarkdown } from '../src/parser/markdown'
import { parseText } from '../src/parser/text'
import { parseHtmlDocument, sanitiseInline } from '../src/parser/html'
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

// --- Inline run parsing (used by the PDF exporter) ---
import { parseInlineRuns } from '../src/pdf/htmlRuns'
import { wrapRuns } from '../src/pdf/textWrap'

const runs = parseInlineRuns('Hello <strong>bold world</strong> and plain')
check('inline runs: bold run flagged', runs.some((r) => r.bold && r.text.includes('bold world')))
check('inline runs: plain run not flagged', runs.some((r) => !r.bold && r.text.includes('plain')))

const fakeFont = { widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.6 }
const wrapped = wrapRuns(
  [{ text: 'The quick brown fox jumps over the lazy dog and keeps running', bold: false }],
  fakeFont,
  fakeFont,
  12,
  100,
)
check('text wrap: produces multiple lines when text exceeds width', wrapped.length > 1)
check('text wrap: no line exceeds max width', wrapped.every((l) => l.width <= 100 + 0.001))
const rewordedText = wrapped.flatMap((l) => l.fragments.map((f) => f.text)).join(' ')
check('text wrap: all words preserved in order', rewordedText === 'The quick brown fox jumps over the lazy dog and keeps running')

// --- Full PDF export integration test (exercises pdf-lib + fontkit + our
// drawing pipeline end-to-end, minus image embedding which needs a real
// browser canvas) ---
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const originalFetch = globalThis.fetch
// @ts-expect-error -- test shim: serve /fonts/*.woff2 from the local public/ dir
globalThis.fetch = async (url: string) => {
  if (typeof url === 'string' && url.startsWith('/fonts/')) {
    const filePath = path.join(__dirname, '..', 'public', url)
    const buf = fs.readFileSync(filePath)
    return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response
  }
  return originalFetch(url)
}

const { exportBookToPdf } = await import('../src/pdf/exportPdf')
const { computePageBox } = await import('../src/renderer/pageGeometry')
const { resolveTheme } = await import('../src/theme/presets')
const { DEFAULT_PROJECT_SETTINGS } = await import('../src/types/project')

const testManuscriptChapters = parseMarkdown(
  '# Test Chapter\n\nA paragraph with **bold** text to exercise the exporter end-to-end.\n\n## A heading\n\n- one\n- two\n\n> A quote for good measure\n',
  'Test',
)
const testPageBox = computePageBox(DEFAULT_PROJECT_SETTINGS)
const testTheme = resolveTheme(DEFAULT_PROJECT_SETTINGS.themeId)
const { pages: exportPages, toc: exportToc } = paginate(testManuscriptChapters, () => 40, testPageBox.contentHeightPx, testTheme.chapterOpener.topSpacer)

try {
  const blob = await exportBookToPdf(
    { pages: exportPages, toc: exportToc, pageBox: testPageBox, theme: testTheme },
    'Test Book',
    DEFAULT_PROJECT_SETTINGS,
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const header = new TextDecoder().decode(bytes.slice(0, 5))
  check('pdf export: produces a Blob', blob instanceof Blob)
  check('pdf export: has a valid %PDF- header', header === '%PDF-')
  check('pdf export: non-trivial size (fonts embedded)', bytes.length > 50_000)
  console.log(`    (pdf size: ${(bytes.length / 1024).toFixed(0)} KB for a 1-chapter test book)`)
} catch (err) {
  console.error(err)
  check('pdf export: completes without throwing', false)
}

// --- Virtual Editor: proofreading checkers + pipeline scoring ---
import { runPipeline } from '../src/virtualEditor/pipeline'
import {
  doubleSpaceChecker,
  repeatedWordChecker,
  unmatchedQuotesChecker,
  unmatchedBracketsChecker,
  missingTerminalPunctuationChecker,
  quoteStyleConsistencyChecker,
} from '../src/virtualEditor/checkers/proofreading'
import type { Manuscript, ParagraphBlock } from '../src/types/content'

function makeSingleParagraphManuscript(html: string): Manuscript {
  return {
    chapters: [
      {
        id: 've-chapter',
        title: 'Chapter One',
        order: 0,
        blocks: [{ id: 've-block', type: 'paragraph', html } as ParagraphBlock],
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName: 'virtual-editor-fixture.md',
  }
}

// Double spaces
const doubleSpaceDirty = doubleSpaceChecker.run({ manuscript: makeSingleParagraphManuscript('This has  a double space.') })
check('VE proofreading: double space detected', doubleSpaceDirty.length === 1)
check('VE proofreading: no false positive on clean text (double space)',
  doubleSpaceChecker.run({ manuscript: makeSingleParagraphManuscript('This has a clean sentence.') }).length === 0)
if (doubleSpaceDirty[0]?.suggestedFix) {
  const block = makeSingleParagraphManuscript('This has  a double space.').chapters[0].blocks[0] as ParagraphBlock
  const patch = doubleSpaceDirty[0].suggestedFix.apply(block) as Partial<ParagraphBlock>
  check('VE proofreading: double-space fix collapses to a single space', patch.html === 'This has a double space.')
}

// Repeated adjacent words
const repeatedWordDirty = repeatedWordChecker.run({ manuscript: makeSingleParagraphManuscript('This is the the answer.') })
check('VE proofreading: repeated word detected', repeatedWordDirty.length === 1)
check('VE proofreading: no false positive on clean text (repeated word)',
  repeatedWordChecker.run({ manuscript: makeSingleParagraphManuscript('This is the answer.') }).length === 0)
if (repeatedWordDirty[0]?.suggestedFix) {
  const block = makeSingleParagraphManuscript('This is the the answer.').chapters[0].blocks[0] as ParagraphBlock
  const patch = repeatedWordDirty[0].suggestedFix.apply(block) as Partial<ParagraphBlock>
  check('VE proofreading: repeated-word fix removes the duplicate', patch.html === 'This is the answer.')
}

// Unmatched quotation marks
check('VE proofreading: unmatched quote detected',
  unmatchedQuotesChecker.run({ manuscript: makeSingleParagraphManuscript('She said "hello and walked away.') }).length === 1)
check('VE proofreading: no false positive on balanced quotes',
  unmatchedQuotesChecker.run({ manuscript: makeSingleParagraphManuscript('She said "hello" and walked away.') }).length === 0)

// Unmatched brackets/parentheses
check('VE proofreading: unmatched bracket detected',
  unmatchedBracketsChecker.run({ manuscript: makeSingleParagraphManuscript('This (is broken.') }).length === 1)
check('VE proofreading: no false positive on balanced brackets',
  unmatchedBracketsChecker.run({ manuscript: makeSingleParagraphManuscript('This (is fine).') }).length === 0)

// Missing terminal punctuation
check('VE proofreading: missing terminal punctuation detected',
  missingTerminalPunctuationChecker.run({ manuscript: makeSingleParagraphManuscript('This paragraph has no ending') }).length === 1)
check('VE proofreading: no false positive when punctuation is present',
  missingTerminalPunctuationChecker.run({ manuscript: makeSingleParagraphManuscript('This paragraph ends properly.') }).length === 0)

// Straight vs curly quote consistency
check('VE proofreading: mixed quote styles flagged',
  quoteStyleConsistencyChecker.run({ manuscript: makeSingleParagraphManuscript('He said "hi" and she said “hello”.') }).length === 1)
check('VE proofreading: no false positive on a single quote style',
  quoteStyleConsistencyChecker.run({ manuscript: makeSingleParagraphManuscript('He said “hi” and she said “hello”.') }).length === 0)

// Pipeline + score aggregation
const dirtyReport = runPipeline('ve-test-project', makeSingleParagraphManuscript('This  has a double space and the the repeated word'))
check('VE pipeline: dirty manuscript scores below 100 on proofreading', (dirtyReport.categoryScores.proofreading?.score ?? 100) < 100)
check('VE pipeline: overall score is computed once at least one category is analysed', dirtyReport.overallScore !== null)
check('VE pipeline: categories with no checker registered stay null (honest "not yet analysed")', dirtyReport.categoryScores.readability === null)
check('VE pipeline: overall score equals the mean of analysed categories only', dirtyReport.overallScore === dirtyReport.categoryScores.proofreading?.score)

const cleanReport = runPipeline('ve-test-project', makeSingleParagraphManuscript('This is a perfectly clean sentence.'))
check('VE pipeline: clean manuscript scores a perfect 100 on proofreading', cleanReport.categoryScores.proofreading?.score === 100)
check('VE pipeline: clean manuscript has zero findings', cleanReport.findings.length === 0)

// --- Inline editing: sanitise-on-commit reuses the import-time sanitiser ---
// BlockContent.tsx feeds whatever a contentEditable paragraph produced back
// through this exact function (see src/renderer/BlockContent.tsx's
// `useEditableField` with mode 'html') rather than maintaining a second
// sanitiser. Simulate a deliberately messy contentEditable-style fragment:
// an unknown wrapper tag with an inline event handler, a <script>, <b>/<i>
// needing conversion to <strong>/<em>, and an <a> with a stray attribute.
const messyHtml =
  '<div>Hello <span onclick="evil()">world</span> and <b>bold</b> <i>ital</i> <a href="https://example.com" onclick="steal()">a link</a>.</div>'
const messyDoc = new DOMParser().parseFromString(messyHtml, 'text/html')
const sanitisedOnCommit = sanitiseInline(messyDoc.body.firstElementChild as unknown as Node)
check('sanitise-on-commit: unknown wrapper tag (<span>) stripped but its text kept', sanitisedOnCommit.includes('world') && !sanitisedOnCommit.includes('<span'))
check('sanitise-on-commit: inline event handlers never survive', !sanitisedOnCommit.includes('onclick'))
check('sanitise-on-commit: <b>/<i> normalised to <strong>/<em>', sanitisedOnCommit.includes('<strong>bold</strong>') && sanitisedOnCommit.includes('<em>ital</em>'))
check(
  'sanitise-on-commit: safe <a href> preserved with target/rel added, no stray attributes',
  sanitisedOnCommit.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">a link</a>'),
)

// --- measureKey staleness fix: contentStore's per-project revision signal ---
// `BookRenderer.tsx` folds `contentStore.revisionByProject[projectId]` into
// its `measureKey` so an edited block's stale cached height is always
// invalidated (see contentStore.ts's `revisionByProject`/`getRevision`).
// Exercised here at the store level rather than through a full React render.
const { useContentStore } = await import('../src/store/contentStore')
const revisionTestProjectId = 've-revision-test-project'
const revisionManuscript: Manuscript = {
  chapters: [
    {
      id: 'rev-chapter',
      title: 'Chapter One',
      order: 0,
      blocks: [{ id: 'rev-block', type: 'heading', level: 2, text: 'Original heading' }],
    },
  ],
  importedAt: new Date().toISOString(),
  sourceFileName: 'revision-fixture.md',
}
const contentStoreApi = useContentStore.getState()
contentStoreApi.setManuscript(revisionTestProjectId, revisionManuscript)
const revisionAfterImport = useContentStore.getState().getRevision(revisionTestProjectId)

const revisionBeforeEdit = useContentStore.getState().getRevision(revisionTestProjectId)
check('contentStore: revision unchanged when nothing has edited the project', revisionBeforeEdit === revisionAfterImport)

useContentStore.getState().updateBlock(revisionTestProjectId, 'rev-chapter', 'rev-block', { text: 'Edited heading' })
const revisionAfterUpdateBlock = useContentStore.getState().getRevision(revisionTestProjectId)
check('contentStore: revision bumps on updateBlock (fixes the measureKey staleness bug)', revisionAfterUpdateBlock > revisionBeforeEdit)

const revisionBeforeRename = revisionAfterUpdateBlock
useContentStore.getState().renameChapter(revisionTestProjectId, 'rev-chapter', 'Renamed Chapter')
const revisionAfterRename = useContentStore.getState().getRevision(revisionTestProjectId)
check('contentStore: revision bumps on renameChapter', revisionAfterRename > revisionBeforeRename)

const revisionUnrelatedProjectId = 've-revision-test-project-unrelated'
contentStoreApi.setManuscript(revisionUnrelatedProjectId, revisionManuscript)
useContentStore.getState().updateBlock(revisionUnrelatedProjectId, 'rev-chapter', 'rev-block', { text: 'Different project' })
const revisionAfterUnrelatedEdit = useContentStore.getState().getRevision(revisionTestProjectId)
check('contentStore: editing a different project does not bump this project\'s revision', revisionAfterUnrelatedEdit === revisionAfterRename)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
