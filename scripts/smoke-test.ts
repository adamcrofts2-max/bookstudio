import { JSDOM } from 'jsdom'
// Polyfills `indexedDB`/`IDBKeyRange` as real globals — needed to exercise
// `assetDb.ts` (real `idb`-wrapped IndexedDB calls) below for the
// `removeAssetWithHistory` test, since jsdom itself doesn't implement
// IndexedDB. `URL.createObjectURL`/`Blob` are NOT stubbed here: Node's own
// globals already provide both natively, and `assetStore.ts` references
// them as ambient globals (not via jsdom's `window`), so they work as-is.
import 'fake-indexeddb/auto'

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
import { getBlockTypeDefinition } from '../src/blocks/registry'
import type { ContentBlock, ContentBlockType } from '../src/types/content'
import type { ImageAsset } from '../src/types/asset'

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

// Stray closing curly quote used as an apostrophe (discovered against a real
// manuscript: this used to be reported as a plain, unfixable "unmatched
// quote" — it now gets its own issueType, a suggestedFix, and doesn't inflate
// the same bucket as a genuinely ambiguous mismatch).
const strayApostropheFindings = unmatchedQuotesChecker.run({
  manuscript: makeSingleParagraphManuscript('In the first two years, young trees and shrubs are asking for four moments” of attention.'),
})
check('VE proofreading: stray closing curly quote after a letter is detected', strayApostropheFindings.length === 1)
check('VE proofreading: stray apostrophe case gets its own issueType', strayApostropheFindings[0]?.issueType === 'quote-mark-as-apostrophe')
check('VE proofreading: stray apostrophe case is minor severity, not major', strayApostropheFindings[0]?.severity === 'minor')
check('VE proofreading: stray apostrophe case has a suggestedFix (Fix/Fix All now has something real to do)',
  strayApostropheFindings[0]?.suggestedFix !== undefined)
if (strayApostropheFindings[0]?.suggestedFix) {
  const block = makeSingleParagraphManuscript('In the first two years, young trees and shrubs are asking for four moments” of attention.').chapters[0].blocks[0] as ParagraphBlock
  const patch = strayApostropheFindings[0].suggestedFix.apply(block) as Partial<ParagraphBlock>
  check('VE proofreading: stray-apostrophe fix replaces ” with ’ in place',
    patch.html === 'In the first two years, young trees and shrubs are asking for four moments’ of attention.')
}
const ambiguousMismatchFindings = unmatchedQuotesChecker.run({
  manuscript: makeSingleParagraphManuscript('She trailed off mid-thought, then oddly a stray mark appeared: ”'),
})
check('VE proofreading: a genuinely ambiguous curly-quote mismatch (no letter directly before the extra mark) is still flagged',
  ambiguousMismatchFindings.length === 1)
check('VE proofreading: that ambiguous case keeps issueType "unmatched-quote" and gets no fix',
  ambiguousMismatchFindings[0]?.issueType === 'unmatched-quote' && ambiguousMismatchFindings[0]?.suggestedFix === undefined)

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

// --- virtualEditorStore.fixAll / fixCategory: bulk-apply wiring on top of
// the existing acceptFix (never duplicates its snapshot-then-updateBlock
// logic — just loops and calls it). ---
const { useVirtualEditorStore } = await import('../src/store/virtualEditorStore')
const { useContentStore: useContentStoreForFixAll } = await import('../src/store/contentStore')

function makeFixAllTestManuscript(): Manuscript {
  return {
    chapters: [
      {
        id: 've-fixall-chapter',
        title: 'Chapter One',
        order: 0,
        blocks: [
          { id: 've-fixall-double-space', type: 'paragraph', html: 'This has  a double space here.' } as ParagraphBlock,
          { id: 've-fixall-repeated-word', type: 'paragraph', html: 'This is the the answer given.' } as ParagraphBlock,
          { id: 've-fixall-unfixable', type: 'paragraph', html: 'This has "an unmatched quote.' } as ParagraphBlock,
        ],
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName: 'virtual-editor-fixall-fixture.md',
  }
}

// fixCategory: scoped correctly (a category with no matching findings is a
// no-op; the matching category applies every fixable 'new' finding in it
// and leaves the unfixable one alone).
const fixCategoryProjectId = 've-fixcategory-test-project'
useContentStoreForFixAll.getState().setManuscript(fixCategoryProjectId, makeFixAllTestManuscript())
useVirtualEditorStore.getState().runReview(fixCategoryProjectId, useContentStoreForFixAll.getState().getManuscript(fixCategoryProjectId)!)

useVirtualEditorStore.getState().fixCategory(fixCategoryProjectId, 'readability')
const afterWrongCategoryFix = useContentStoreForFixAll.getState().getManuscript(fixCategoryProjectId)!
const chapterAfterWrongCategoryFix = afterWrongCategoryFix.chapters.find((c) => c.id === 've-fixall-chapter')!
check(
  'fixCategory: a category with no matching findings is a harmless no-op',
  (chapterAfterWrongCategoryFix.blocks.find((b) => b.id === 've-fixall-double-space') as ParagraphBlock).html === 'This has  a double space here.',
)

useVirtualEditorStore.getState().fixCategory(fixCategoryProjectId, 'proofreading')
const afterRightCategoryFix = useContentStoreForFixAll.getState().getManuscript(fixCategoryProjectId)!
const chapterAfterRightCategoryFix = afterRightCategoryFix.chapters.find((c) => c.id === 've-fixall-chapter')!
check(
  'fixCategory: applies the fix for every fixable finding in the matching category (double space)',
  (chapterAfterRightCategoryFix.blocks.find((b) => b.id === 've-fixall-double-space') as ParagraphBlock).html === 'This has a double space here.',
)
check(
  'fixCategory: applies the fix for every fixable finding in the matching category (repeated word)',
  (chapterAfterRightCategoryFix.blocks.find((b) => b.id === 've-fixall-repeated-word') as ParagraphBlock).html === 'This is the answer given.',
)
check(
  'fixCategory: leaves a finding without a suggestedFix (unmatched quote) untouched',
  (chapterAfterRightCategoryFix.blocks.find((b) => b.id === 've-fixall-unfixable') as ParagraphBlock).html === 'This has "an unmatched quote.',
)
const fixCategoryReport = useVirtualEditorStore.getState().reportsByProject[fixCategoryProjectId]!
const fixCategoryStatuses = useVirtualEditorStore.getState().findingStatusByProject[fixCategoryProjectId] ?? {}
const doubleSpaceFindingAfterCategoryFix = fixCategoryReport.findings.find((f) => f.issueType === 'double-space')!
const unfixableFindingAfterCategoryFix = fixCategoryReport.findings.find((f) => f.issueType === 'unmatched-quote')!
check('fixCategory: fixed finding is marked accepted', fixCategoryStatuses[doubleSpaceFindingAfterCategoryFix.id] === 'accepted')
check('fixCategory: unfixable finding stays new (never touched)', (fixCategoryStatuses[unfixableFindingAfterCategoryFix.id] ?? 'new') === 'new')

// fixAll: applies every fixable 'new' finding across the whole report,
// skips a finding that's already been resolved (even though it has a
// suggestedFix and would otherwise be fixable), and skips findings with no
// suggestedFix entirely.
const fixAllProjectId = 've-fixall-test-project'
useContentStoreForFixAll.getState().setManuscript(fixAllProjectId, makeFixAllTestManuscript())
useVirtualEditorStore.getState().runReview(fixAllProjectId, useContentStoreForFixAll.getState().getManuscript(fixAllProjectId)!)

const fixAllReportBefore = useVirtualEditorStore.getState().reportsByProject[fixAllProjectId]!
const repeatedWordFindingForFixAll = fixAllReportBefore.findings.find((f) => f.issueType === 'repeated-word')!
// Pre-resolve the repeated-word finding (as if the user had already rejected it) before calling fixAll.
useVirtualEditorStore.getState().setFindingStatus(fixAllProjectId, repeatedWordFindingForFixAll.id, 'rejected')

useVirtualEditorStore.getState().fixAll(fixAllProjectId)
const afterFixAll = useContentStoreForFixAll.getState().getManuscript(fixAllProjectId)!
const chapterAfterFixAll = afterFixAll.chapters.find((c) => c.id === 've-fixall-chapter')!
check(
  'fixAll: applies the fix for a fresh fixable finding (double space)',
  (chapterAfterFixAll.blocks.find((b) => b.id === 've-fixall-double-space') as ParagraphBlock).html === 'This has a double space here.',
)
check(
  'fixAll: skips an already-resolved finding, even though it has a suggestedFix (repeated word stays untouched)',
  (chapterAfterFixAll.blocks.find((b) => b.id === 've-fixall-repeated-word') as ParagraphBlock).html === 'This is the the answer given.',
)
check(
  'fixAll: skips a finding with no suggestedFix (unmatched quote stays untouched)',
  (chapterAfterFixAll.blocks.find((b) => b.id === 've-fixall-unfixable') as ParagraphBlock).html === 'This has "an unmatched quote.',
)
const fixAllStatuses = useVirtualEditorStore.getState().findingStatusByProject[fixAllProjectId] ?? {}
check(
  'fixAll: the pre-resolved finding\'s status is left exactly as it was (rejected), not overwritten to accepted',
  fixAllStatuses[repeatedWordFindingForFixAll.id] === 'rejected',
)

// --- BookRenderer's scroll-target matching predicate (extracted as
// `spreadMatchesScrollTarget` for testability, since mounting BookRenderer
// itself needs a real IntersectionObserver/layout jsdom can't provide). ---
const { spreadMatchesScrollTarget } = await import('../src/renderer/BookRenderer')

function makeFakePage(overrides: Partial<import('../src/renderer/paginate').LaidOutPage>): import('../src/renderer/paginate').LaidOutPage {
  return { id: 'page-x', number: 1, side: 'left', kind: 'content', blocks: [], ...overrides }
}

const chapterOpenerPage = makeFakePage({ id: 'page-1', kind: 'chapter-start', chapterId: 'chap-a' })
const contentPage = makeFakePage({ id: 'page-2', chapterId: 'chap-a', blocks: [{ id: 'blk-1', type: 'paragraph', html: 'x' } as ContentBlock] })
const otherChapterPage = makeFakePage({ id: 'page-3', kind: 'chapter-start', chapterId: 'chap-b' })

check(
  'spreadMatchesScrollTarget: chapter target matches the spread containing that chapter\'s opener page',
  spreadMatchesScrollTarget([chapterOpenerPage], { type: 'chapter', chapterId: 'chap-a' }),
)
check(
  'spreadMatchesScrollTarget: chapter target does not match a different chapter\'s opener',
  !spreadMatchesScrollTarget([otherChapterPage], { type: 'chapter', chapterId: 'chap-a' }),
)
check(
  'spreadMatchesScrollTarget: page target matches by exact page id regardless of chapter',
  spreadMatchesScrollTarget([contentPage], { type: 'page', pageId: 'page-2' }),
)
check(
  'spreadMatchesScrollTarget: block target matches the spread containing that exact block within the right chapter',
  spreadMatchesScrollTarget([contentPage], { type: 'block', chapterId: 'chap-a', blockId: 'blk-1' }),
)
check(
  'spreadMatchesScrollTarget: block target does not match if the block id is present but the chapter id is wrong',
  !spreadMatchesScrollTarget([contentPage], { type: 'block', chapterId: 'chap-b', blockId: 'blk-1' }),
)
check(
  'spreadMatchesScrollTarget: block target does not match a spread that lacks the block entirely',
  !spreadMatchesScrollTarget([chapterOpenerPage], { type: 'block', chapterId: 'chap-a', blockId: 'blk-1' }),
)


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

// --- contentStore.insertBlock: the only sanctioned way to add a block ---
// (image drag-and-drop placement in Page.tsx). Exercised at the store level;
// the actual HTML5 drag-and-drop UI isn't meaningfully testable in jsdom.
import type { HeadingBlock, ImageBlock } from '../src/types/content'

function makeInsertTestManuscript(): Manuscript {
  return {
    chapters: [
      {
        id: 'ib-chapter-1',
        title: 'Chapter One',
        order: 0,
        blocks: [
          { id: 'ib-a', type: 'heading', level: 2, text: 'A' } as HeadingBlock,
          { id: 'ib-b', type: 'paragraph', html: 'B' } as ParagraphBlock,
          { id: 'ib-c', type: 'paragraph', html: 'C' } as ParagraphBlock,
        ],
      },
      {
        id: 'ib-chapter-2',
        title: 'Chapter Two',
        order: 1,
        blocks: [{ id: 'ib-x', type: 'paragraph', html: 'X' } as ParagraphBlock],
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName: 'insert-block-fixture.md',
  }
}

const makeTestImageBlock = (id: string): ImageBlock => ({ id, type: 'image', assetId: 'asset-1', caption: undefined, rotation: 0, widthPercent: 100 })

const insertTestProjectId = 've-insert-block-test-project'
const insertOtherProjectId = 've-insert-block-test-project-other'
contentStoreApi.setManuscript(insertTestProjectId, makeInsertTestManuscript())
contentStoreApi.setManuscript(insertOtherProjectId, makeInsertTestManuscript())

// Insert at the start of a chapter (afterBlockId === null)
useContentStore.getState().insertBlock(insertTestProjectId, 'ib-chapter-1', null, makeTestImageBlock('ib-new-start'))
const afterInsertStart = useContentStore.getState().getManuscript(insertTestProjectId)!
const chapter1AfterStart = afterInsertStart.chapters.find((c) => c.id === 'ib-chapter-1')!
check('insertBlock: null afterBlockId inserts at index 0', chapter1AfterStart.blocks[0].id === 'ib-new-start')
check('insertBlock: existing blocks shifted right, order preserved', chapter1AfterStart.blocks.map((b) => b.id).join(',') === 'ib-new-start,ib-a,ib-b,ib-c')

// Insert in the middle of a chapter (after 'ib-a', which is now index 1)
useContentStore.getState().insertBlock(insertTestProjectId, 'ib-chapter-1', 'ib-a', makeTestImageBlock('ib-new-middle'))
const afterInsertMiddle = useContentStore.getState().getManuscript(insertTestProjectId)!
const chapter1AfterMiddle = afterInsertMiddle.chapters.find((c) => c.id === 'ib-chapter-1')!
check('insertBlock: inserts immediately after the given afterBlockId', chapter1AfterMiddle.blocks.map((b) => b.id).join(',') === 'ib-new-start,ib-a,ib-new-middle,ib-b,ib-c')

// Insert at the end of a chapter (after the last block)
useContentStore.getState().insertBlock(insertTestProjectId, 'ib-chapter-1', 'ib-c', makeTestImageBlock('ib-new-end'))
const afterInsertEnd = useContentStore.getState().getManuscript(insertTestProjectId)!
const chapter1AfterEnd = afterInsertEnd.chapters.find((c) => c.id === 'ib-chapter-1')!
check('insertBlock: inserting after the last block appends it', chapter1AfterEnd.blocks[chapter1AfterEnd.blocks.length - 1].id === 'ib-new-end')
check('insertBlock: full expected order after start/middle/end inserts', chapter1AfterEnd.blocks.map((b) => b.id).join(',') === 'ib-new-start,ib-a,ib-new-middle,ib-b,ib-c,ib-new-end')

// Other chapters in the same project are untouched
const chapter2Untouched = afterInsertEnd.chapters.find((c) => c.id === 'ib-chapter-2')!
check('insertBlock: other chapters in the same project are left untouched', chapter2Untouched.blocks.map((b) => b.id).join(',') === 'ib-x')

// Other projects are untouched
const otherProjectManuscript = useContentStore.getState().getManuscript(insertOtherProjectId)!
const otherProjectChapter1 = otherProjectManuscript.chapters.find((c) => c.id === 'ib-chapter-1')!
check('insertBlock: other projects are left untouched', otherProjectChapter1.blocks.map((b) => b.id).join(',') === 'ib-a,ib-b,ib-c')

// Bumps the revision counter, exactly like updateBlock/renameChapter
const revisionBeforeInsert = useContentStore.getState().getRevision(insertTestProjectId)
useContentStore.getState().insertBlock(insertTestProjectId, 'ib-chapter-1', null, makeTestImageBlock('ib-new-revision-check'))
const revisionAfterInsert = useContentStore.getState().getRevision(insertTestProjectId)
check('insertBlock: bumps revisionByProject like updateBlock/renameChapter', revisionAfterInsert > revisionBeforeInsert)

// --- ImageBlock.widthPercent defaulting: existing persisted manuscripts
// (created before this field existed) don't have it — must read as 100
// everywhere, never require a migration. BlockContent.tsx computes exactly
// `block.widthPercent ?? 100`; assert that same expression here rather than
// re-deriving separate logic. ---
const legacyImageBlockWithoutWidth = { id: 'legacy-img', type: 'image', assetId: 'asset-1', caption: undefined, rotation: 0 } as ImageBlock
check('ImageBlock.widthPercent: block without the field defaults to 100', (legacyImageBlockWithoutWidth.widthPercent ?? 100) === 100)

const explicitImageBlock = { ...legacyImageBlockWithoutWidth, id: 'explicit-img', widthPercent: 65 } as ImageBlock
check('ImageBlock.widthPercent: an explicit value is preserved, not overridden', (explicitImageBlock.widthPercent ?? 100) === 65)

// --- contentStore.deleteBlock: removes a block, bumps revision, leaves
// other chapters/projects untouched (mirrors insertBlock's test shape). ---
const deleteTestProjectId = 've-delete-block-test-project'
const deleteOtherProjectId = 've-delete-block-test-project-other'
contentStoreApi.setManuscript(deleteTestProjectId, makeInsertTestManuscript())
contentStoreApi.setManuscript(deleteOtherProjectId, makeInsertTestManuscript())

useContentStore.getState().deleteBlock(deleteTestProjectId, 'ib-chapter-1', 'ib-b')
const afterDelete = useContentStore.getState().getManuscript(deleteTestProjectId)!
const chapter1AfterDelete = afterDelete.chapters.find((c) => c.id === 'ib-chapter-1')!
check('deleteBlock: removes the targeted block', chapter1AfterDelete.blocks.map((b) => b.id).join(',') === 'ib-a,ib-c')

const chapter2AfterDelete = afterDelete.chapters.find((c) => c.id === 'ib-chapter-2')!
check('deleteBlock: other chapters in the same project are left untouched', chapter2AfterDelete.blocks.map((b) => b.id).join(',') === 'ib-x')

const otherProjectAfterDelete = useContentStore.getState().getManuscript(deleteOtherProjectId)!
const otherProjectChapter1AfterDelete = otherProjectAfterDelete.chapters.find((c) => c.id === 'ib-chapter-1')!
check('deleteBlock: other projects are left untouched', otherProjectChapter1AfterDelete.blocks.map((b) => b.id).join(',') === 'ib-a,ib-b,ib-c')

const revisionBeforeDelete = useContentStore.getState().getRevision(deleteTestProjectId)
useContentStore.getState().deleteBlock(deleteTestProjectId, 'ib-chapter-1', 'ib-a')
const revisionAfterDelete = useContentStore.getState().getRevision(deleteTestProjectId)
check('deleteBlock: bumps revisionByProject like updateBlock/insertBlock', revisionAfterDelete > revisionBeforeDelete)

const revisionBeforeNoopDelete = useContentStore.getState().getRevision(deleteOtherProjectId)
useContentStore.getState().deleteBlock(deleteOtherProjectId, 'ib-chapter-1', 'does-not-exist')
const afterNoopDelete = useContentStore.getState().getManuscript(deleteOtherProjectId)!
const chapter1AfterNoopDelete = afterNoopDelete.chapters.find((c) => c.id === 'ib-chapter-1')!
check('deleteBlock: deleting a non-existent blockId is a harmless no-op on the blocks array', chapter1AfterNoopDelete.blocks.map((b) => b.id).join(',') === 'ib-a,ib-b,ib-c')
check('deleteBlock: still bumps revision even on a no-op delete (matches updateBlock\'s unconditional-bump behaviour)', useContentStore.getState().getRevision(deleteOtherProjectId) > revisionBeforeNoopDelete)

// --- ImageBlock.widthMm/heightMm/aspectLocked/grayscale/align/altText:
// same "optional field defaults in code, never migrated" pattern as
// widthPercent above. ---
const PX_PER_MM = 96 / 25.4 // mirrors renderer/pageGeometry.ts's exported constant exactly

const legacyImageBlockNoNewFields = { id: 'legacy-img-2', type: 'image', assetId: 'asset-1', caption: undefined, rotation: 0, widthPercent: 100 } as ImageBlock
check('ImageBlock.widthMm: absent on legacy blocks, so widthPercent path is used', legacyImageBlockNoNewFields.widthMm === undefined)
check('ImageBlock.align: absent defaults to center', (legacyImageBlockNoNewFields.align ?? 'center') === 'center')
check('ImageBlock.grayscale: absent defaults to false', (legacyImageBlockNoNewFields.grayscale ?? false) === false)
check('ImageBlock.altText: absent falls back to caption, then empty string', (legacyImageBlockNoNewFields.altText ?? legacyImageBlockNoNewFields.caption ?? '') === '')

// mm -> px conversion (BlockContent.tsx's on-screen sizing): deterministic,
// exercised directly against the same PX_PER_MM constant pageGeometry.ts
// exports (mirrored above rather than imported, to keep this test file
// import-light — the constant's value is asserted, not re-derived).
const widthMmSample = 80
const expectedWidthPx = widthMmSample * PX_PER_MM
check('mm->px sizing: 80mm converts to the expected CSS px width at 96dpi', Math.abs(expectedWidthPx - (widthMmSample * 96) / 25.4) < 1e-9)

// Aspect-locked recompute (ImagePanel.tsx's handleWidthMmChange logic):
// widthMm * (naturalHeight / naturalWidth), rounded to 1 decimal place.
const naturalWidth = 1600
const naturalHeight = 900
const aspectRatio = naturalHeight / naturalWidth
const recomputedHeightMm = Math.round(widthMmSample * aspectRatio * 10) / 10
check('mm sizing: aspect-locked height recompute matches natural image ratio', recomputedHeightMm === 45)

// --- PDF exportPdf.ts displayWidth priority logic: widthMm (converted via
// PX_PER_MM -> PX_TO_PT) beats widthPercent, which beats the full
// contentWidthPt legacy default. Pure arithmetic, no canvas/DOM image decode
// needed, so it's fully testable here — unlike the grayscale pixel
// desaturation (imageForPdf.ts's blobToPng), which needs a real canvas 2D
// context and image decode that jsdom doesn't provide, so it is NOT covered
// by this smoke test (see docs/STATUS.md for the honest limitation).
const PX_TO_PT = 72 / 96
const contentWidthPt = 400

function displayWidthFor(block: Partial<ImageBlock>): number {
  return block.widthMm != null
    ? block.widthMm * PX_PER_MM * PX_TO_PT
    : block.widthPercent != null
      ? contentWidthPt * (block.widthPercent / 100)
      : contentWidthPt
}

check('exportPdf displayWidth: widthMm takes precedence over widthPercent when both are set', displayWidthFor({ widthMm: 50, widthPercent: 40 }) === 50 * PX_PER_MM * PX_TO_PT)
check('exportPdf displayWidth: widthPercent is used as a fraction of contentWidthPt when widthMm is absent', displayWidthFor({ widthPercent: 65 }) === contentWidthPt * 0.65)
check('exportPdf displayWidth: falls back to full contentWidthPt when neither field is set (legacy default)', displayWidthFor({}) === contentWidthPt)

// Alignment x-offset logic (same file): left/center/right against a known
// displayWidth.
const alignContentX = 50
function imageXFor(align: 'left' | 'center' | 'right', displayWidth: number): number {
  return align === 'left' ? alignContentX
    : align === 'right' ? alignContentX + (contentWidthPt - displayWidth)
    : alignContentX + (contentWidthPt - displayWidth) / 2
}
check('exportPdf alignment: left aligns flush to contentX', imageXFor('left', 200) === alignContentX)
check('exportPdf alignment: right aligns flush to the far edge of the content column', imageXFor('right', 200) === alignContentX + 200)
check('exportPdf alignment: center splits the remaining space evenly', imageXFor('center', 200) === alignContentX + 100)

// --- Phase 14: historyStore — generic per-project undo/redo command stack ---
const { useHistoryStore } = await import('../src/store/historyStore')
const historyProjectId = 'history-test-project'

let undoCalls = 0
let redoCalls = 0
useHistoryStore.getState().record(historyProjectId, 'First edit', () => { undoCalls++ }, () => { redoCalls++ })
check('historyStore: record makes canUndo true', useHistoryStore.getState().canUndo(historyProjectId))
check('historyStore: record leaves canRedo false (nothing to redo yet)', !useHistoryStore.getState().canRedo(historyProjectId))
check('historyStore: peekUndoLabel reflects the just-recorded command', useHistoryStore.getState().peekUndoLabel(historyProjectId) === 'First edit')
check('historyStore: peekRedoLabel is undefined when the redo stack is empty', useHistoryStore.getState().peekRedoLabel(historyProjectId) === undefined)

useHistoryStore.getState().record(historyProjectId, 'Second edit', () => { undoCalls++ }, () => { redoCalls++ })
check('historyStore: peekUndoLabel reflects the most recent of 2 recorded commands', useHistoryStore.getState().peekUndoLabel(historyProjectId) === 'Second edit')

useHistoryStore.getState().undo(historyProjectId)
check("historyStore: undo calls the command's undo()", undoCalls === 1)
check('historyStore: undo moves the command onto the redo stack', useHistoryStore.getState().canRedo(historyProjectId))
check("historyStore: peekRedoLabel is the just-undone command's label", useHistoryStore.getState().peekRedoLabel(historyProjectId) === 'Second edit')
check('historyStore: peekUndoLabel now points at the remaining older command', useHistoryStore.getState().peekUndoLabel(historyProjectId) === 'First edit')

useHistoryStore.getState().redo(historyProjectId)
check("historyStore: redo calls the command's redo()", redoCalls === 1)
check('historyStore: redo moves the command back onto the undo stack', useHistoryStore.getState().peekUndoLabel(historyProjectId) === 'Second edit')
check('historyStore: redo stack empty again after redoing everything', !useHistoryStore.getState().canRedo(historyProjectId))

useHistoryStore.getState().undo(historyProjectId)
useHistoryStore.getState().undo(historyProjectId)
check('historyStore: undo stack empty after undoing both recorded commands', !useHistoryStore.getState().canUndo(historyProjectId))
check('historyStore: redo stack holds both undone commands', useHistoryStore.getState().canRedo(historyProjectId))
useHistoryStore.getState().record(historyProjectId, 'Third edit (new branch)', () => {}, () => {})
check('historyStore: recording a new command clears the redo stack (a fresh edit invalidates the old "future")', !useHistoryStore.getState().canRedo(historyProjectId))

const historyEmptyProjectId = 'history-empty-project'
useHistoryStore.getState().undo(historyEmptyProjectId)
useHistoryStore.getState().redo(historyEmptyProjectId)
check(
  'historyStore: undo/redo on a project with no history at all are harmless no-ops (no throw, stacks stay empty)',
  !useHistoryStore.getState().canUndo(historyEmptyProjectId) && !useHistoryStore.getState().canRedo(historyEmptyProjectId),
)

const historyDepthProjectId = 'history-depth-test-project'
for (let i = 0; i < 105; i++) {
  useHistoryStore.getState().record(historyDepthProjectId, `edit-${i}`, () => {}, () => {})
}
const historyDepthStack = useHistoryStore.getState().undoStackByProject[historyDepthProjectId] ?? []
check('historyStore: undo stack capped at 100 entries even after 105 records', historyDepthStack.length === 100)
check('historyStore: oldest entries dropped once over the cap (bottom of stack is edit-5, not edit-0)', historyDepthStack[0].label === 'edit-5')
check('historyStore: newest entry still on top after capping', historyDepthStack[historyDepthStack.length - 1].label === 'edit-104')

// --- Phase 14: editorActions.ts — history-aware wrappers around
// contentStore's mutating actions. `useContentStore` here is the same
// binding imported further up this file for the revision-signal tests. ---
const { editBlock, insertBlockWithHistory, deleteBlockWithHistory, renameChapterWithHistory, removeAssetWithHistory } =
  await import('../src/store/editorActions')

const eaProjectId = 'editor-actions-test-project'
const eaManuscript: Manuscript = {
  chapters: [
    {
      id: 'ea-chapter',
      title: 'Chapter One',
      order: 0,
      blocks: [
        { id: 'ea-block-a', type: 'heading', level: 2, text: 'Original heading' } as HeadingBlock,
        { id: 'ea-block-b', type: 'paragraph', html: 'Paragraph B' } as ParagraphBlock,
        { id: 'ea-block-c', type: 'paragraph', html: 'Paragraph C' } as ParagraphBlock,
      ],
    },
  ],
  importedAt: new Date().toISOString(),
  sourceFileName: 'editor-actions-fixture.md',
}
useContentStore.getState().setManuscript(eaProjectId, eaManuscript)
const eaBlockIds = () => useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].blocks.map((b) => b.id)

// editBlock: full-block snapshot restore (updateBlock shallow-merges, so
// undo must spread back the ENTIRE old block, not just the touched field).
editBlock(eaProjectId, 'ea-chapter', 'ea-block-a', { text: 'Edited heading' })
check(
  'editBlock: applies the update like updateBlock would',
  (useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].blocks[0] as HeadingBlock).text === 'Edited heading',
)
check('editBlock: records a command on historyStore', useHistoryStore.getState().canUndo(eaProjectId))
check('editBlock: label is type-appropriate ("Edit text" for a non-image block)', useHistoryStore.getState().peekUndoLabel(eaProjectId) === 'Edit text')

useHistoryStore.getState().undo(eaProjectId)
check(
  'editBlock -> undo: restores the exact prior block',
  (useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].blocks[0] as HeadingBlock).text === 'Original heading',
)
check('editBlock -> undo: moves the command onto the redo stack', useHistoryStore.getState().canRedo(eaProjectId))

useHistoryStore.getState().redo(eaProjectId)
check(
  'editBlock -> undo -> redo: re-applies the edit',
  (useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].blocks[0] as HeadingBlock).text === 'Edited heading',
)

// deleteBlockWithHistory: a mid-chapter delete captures the PRECEDING
// block's id, so undo re-inserts at the same (middle) position.
deleteBlockWithHistory(eaProjectId, 'ea-chapter', 'ea-block-b')
check('deleteBlockWithHistory: removes the targeted block', !eaBlockIds().includes('ea-block-b'))
check('deleteBlockWithHistory: label reflects the block type ("Delete block" for a non-image block)', useHistoryStore.getState().peekUndoLabel(eaProjectId) === 'Delete block')

useHistoryStore.getState().undo(eaProjectId)
check('deleteBlockWithHistory -> undo: re-inserts the deleted block at the same (middle) position', eaBlockIds().join(',') === 'ea-block-a,ea-block-b,ea-block-c')

useHistoryStore.getState().redo(eaProjectId)
check('deleteBlockWithHistory -> undo -> redo: deletes it again', !eaBlockIds().includes('ea-block-b'))

// insertBlockWithHistory with a `null` afterBlockId (insert at the very
// start of the chapter) — covers the other branch of contentStore.insertBlock.
const eaNewImageBlock: ImageBlock = { id: 'ea-new-image', type: 'image', assetId: 'ea-asset-1', caption: undefined, rotation: 0, widthPercent: 100 }
insertBlockWithHistory(eaProjectId, 'ea-chapter', null, eaNewImageBlock)
check('insertBlockWithHistory: null afterBlockId inserts at index 0', eaBlockIds().join(',') === 'ea-new-image,ea-block-a,ea-block-c')
check('insertBlockWithHistory: label is type-appropriate ("Insert image")', useHistoryStore.getState().peekUndoLabel(eaProjectId) === 'Insert image')

useHistoryStore.getState().undo(eaProjectId)
check('insertBlockWithHistory -> undo: removes the just-inserted block', !eaBlockIds().includes('ea-new-image'))

useHistoryStore.getState().redo(eaProjectId)
check('insertBlockWithHistory -> undo -> redo: re-inserts at the same (start) position', eaBlockIds().join(',') === 'ea-new-image,ea-block-a,ea-block-c')

// deleteBlockWithHistory on the FIRST block in the chapter — precedingBlockId
// must be captured as `null`, so undo re-inserts it back at the start too.
deleteBlockWithHistory(eaProjectId, 'ea-chapter', 'ea-new-image')
check('deleteBlockWithHistory (first block): removes it', !eaBlockIds().includes('ea-new-image'))
check('deleteBlockWithHistory (first block): label reflects the image type ("Delete image")', useHistoryStore.getState().peekUndoLabel(eaProjectId) === 'Delete image')

useHistoryStore.getState().undo(eaProjectId)
check(
  'deleteBlockWithHistory (first block) -> undo: re-inserts at the start (precedingBlockId captured as null)',
  eaBlockIds().join(',') === 'ea-new-image,ea-block-a,ea-block-c',
)

// renameChapterWithHistory
renameChapterWithHistory(eaProjectId, 'ea-chapter', 'Renamed Chapter')
check('renameChapterWithHistory: applies the rename', useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].title === 'Renamed Chapter')
check('renameChapterWithHistory: label', useHistoryStore.getState().peekUndoLabel(eaProjectId) === 'Rename chapter')

useHistoryStore.getState().undo(eaProjectId)
check('renameChapterWithHistory -> undo: restores the old title', useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].title === 'Chapter One')

useHistoryStore.getState().redo(eaProjectId)
check('renameChapterWithHistory -> undo -> redo: re-applies the new title', useContentStore.getState().getManuscript(eaProjectId)!.chapters[0].title === 'Renamed Chapter')

// --- Phase 14: removeAssetWithHistory — the one genuinely destructive
// action this milestone closes the gap on. Exercises the REAL assetDb.ts
// IndexedDB calls via fake-indexeddb (imported at the very top of this
// file), since jsdom itself doesn't implement IndexedDB; there was no
// pre-existing asset-store test pattern in this file to follow, since
// assetStore/assetDb had no smoke-test coverage before this phase.
const { useAssetStore } = await import('../src/store/assetStore')
const { putAsset, getAssetBlob } = await import('../src/store/assetDb')

const assetHistoryProjectId = 'asset-history-test-project'
const assetUnderTest: ImageAsset = {
  id: 'asset-under-test',
  projectId: assetHistoryProjectId,
  name: 'test.png',
  mimeType: 'image/png',
  size: 4,
  width: 10,
  height: 10,
  createdAt: new Date().toISOString(),
}
const blobUnderTest = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
await putAsset(assetUnderTest, blobUnderTest)
useAssetStore.setState((state) => ({ byProject: { ...state.byProject, [assetHistoryProjectId]: [assetUnderTest] } }))

await removeAssetWithHistory(assetHistoryProjectId, assetUnderTest.id)
check(
  'removeAssetWithHistory: removes the asset from assetStore state',
  !(useAssetStore.getState().byProject[assetHistoryProjectId] ?? []).some((a) => a.id === assetUnderTest.id),
)
check('removeAssetWithHistory: deletes the blob from IndexedDB', (await getAssetBlob(assetUnderTest.id)) === undefined)
check('removeAssetWithHistory: records an undo command', useHistoryStore.getState().canUndo(assetHistoryProjectId))
check('removeAssetWithHistory: label', useHistoryStore.getState().peekUndoLabel(assetHistoryProjectId) === 'Delete image asset')

useHistoryStore.getState().undo(assetHistoryProjectId)
// The undo command's body is `void restoreAsset(...)` — historyStore's
// `undo`/`redo` signatures are synchronous (`() => void`), so this is
// deliberately fire-and-forget; give its internal `putAsset` (IndexedDB)
// await a moment to actually settle before asserting on it.
await new Promise((resolve) => setTimeout(resolve, 50))
const assetsAfterUndo = useAssetStore.getState().byProject[assetHistoryProjectId] ?? []
check('removeAssetWithHistory -> undo: restores the asset under the same id', assetsAfterUndo.some((a) => a.id === assetUnderTest.id))
const blobAfterUndo = await getAssetBlob(assetUnderTest.id)
check(
  'removeAssetWithHistory -> undo: restores the blob byte-for-byte in IndexedDB',
  blobAfterUndo !== undefined && blobAfterUndo.size === blobUnderTest.size && blobAfterUndo.type === blobUnderTest.type,
)

// --- Phase 15: version history (snapshotDb.ts / versionStore.ts) — a
// coarse, periodic + manual whole-manuscript-plus-settings safety net,
// completely separate from Phase 14's undo/redo. Exercises the REAL
// snapshotDb.ts IndexedDB calls via fake-indexeddb (imported at the very
// top of this file), same approach as the removeAssetWithHistory tests
// above.
const { useVersionStore } = await import('../src/store/versionStore')
const { listSnapshotsForProject: listSnapshotsFromDb } = await import('../src/store/snapshotDb')
const { useProjectStore } = await import('../src/store/projectStore')

function makeVersionTestManuscript(sourceFileName: string): Manuscript {
  return {
    chapters: [
      {
        id: 'vh-chapter',
        title: 'Chapter One',
        order: 0,
        blocks: [{ id: 'vh-block-a', type: 'heading', level: 2, text: 'Original heading' } as HeadingBlock],
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName,
  }
}

// createSnapshot: no-op when there's no manuscript yet.
const vhNoManuscriptProjectId = 'version-history-no-manuscript-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: vhNoManuscriptProjectId,
      name: 'No Manuscript Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    },
  ],
}))
await useVersionStore.getState().createSnapshot(vhNoManuscriptProjectId, 'manual', 'Should not be created')
check(
  'createSnapshot: no-op when the project has no manuscript yet',
  (await listSnapshotsFromDb(vhNoManuscriptProjectId)).length === 0,
)

// createSnapshot: writes correctly (manual, explicit label + auto, default label).
const vhProjectId = 'version-history-test-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: vhProjectId,
      name: 'Version History Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS, themeId: 'original-theme' },
    },
  ],
}))
useContentStore.getState().setManuscript(vhProjectId, makeVersionTestManuscript('version-history-fixture.md'))

await useVersionStore.getState().createSnapshot(vhProjectId, 'manual', 'My named save')
await useVersionStore.getState().listSnapshots(vhProjectId)
const vhSnapshotsAfterManual = useVersionStore.getState().getSnapshots(vhProjectId)
check('createSnapshot (manual): writes a snapshot with the given label', vhSnapshotsAfterManual.some((s) => s.label === 'My named save'))
check('createSnapshot (manual): kind is "manual"', vhSnapshotsAfterManual.find((s) => s.label === 'My named save')?.kind === 'manual')
check(
  'createSnapshot (manual): captures the current manuscript',
  vhSnapshotsAfterManual.find((s) => s.label === 'My named save')?.manuscript.sourceFileName === 'version-history-fixture.md',
)
check(
  'createSnapshot (manual): captures the current project settings',
  vhSnapshotsAfterManual.find((s) => s.label === 'My named save')?.settings.themeId === 'original-theme',
)

await useVersionStore.getState().createSnapshot(vhProjectId, 'auto')
await useVersionStore.getState().listSnapshots(vhProjectId)
const vhSnapshotsAfterAuto = useVersionStore.getState().getSnapshots(vhProjectId)
check(
  'createSnapshot (auto, no label given): defaults to an "Autosave — <timestamp>" label',
  vhSnapshotsAfterAuto.some((s) => s.kind === 'auto' && s.label.startsWith('Autosave — ')),
)

// listSnapshots: newest-first ordering — write two snapshots directly via
// putSnapshot with explicit, deliberately out-of-insertion-order createdAt
// values so the sort is actually exercised rather than coincidentally
// matching wall-clock insertion order.
const { putSnapshot: putSnapshotDirect } = await import('../src/store/snapshotDb')
const vhOrderingProjectId = 'version-history-ordering-test-project'
await putSnapshotDirect({
  id: 'vh-order-older',
  projectId: vhOrderingProjectId,
  createdAt: '2020-01-01T00:00:00.000Z',
  label: 'Older',
  kind: 'manual',
  manuscript: makeVersionTestManuscript('older.md'),
  settings: { ...DEFAULT_PROJECT_SETTINGS },
})
await putSnapshotDirect({
  id: 'vh-order-newer',
  projectId: vhOrderingProjectId,
  createdAt: '2024-06-01T00:00:00.000Z',
  label: 'Newer',
  kind: 'manual',
  manuscript: makeVersionTestManuscript('newer.md'),
  settings: { ...DEFAULT_PROJECT_SETTINGS },
})
await useVersionStore.getState().listSnapshots(vhOrderingProjectId)
const vhOrdered = useVersionStore.getState().getSnapshots(vhOrderingProjectId)
check('listSnapshots: newest-first ordering', vhOrdered.map((s) => s.id).join(',') === 'vh-order-newer,vh-order-older')

// createSnapshot: prunes beyond the 20-most-recent-per-project cap.
const vhPruneProjectId = 'version-history-prune-test-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: vhPruneProjectId,
      name: 'Prune Test Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    },
  ],
}))
useContentStore.getState().setManuscript(vhPruneProjectId, makeVersionTestManuscript('prune-fixture.md'))
for (let i = 0; i < 25; i++) {
  await useVersionStore.getState().createSnapshot(vhPruneProjectId, 'manual', `save-${i}`)
}
const vhPruned = await listSnapshotsFromDb(vhPruneProjectId)
check('createSnapshot: prunes down to at most 20 snapshots per project after 25 creations', vhPruned.length === 20)
check('createSnapshot: pruning keeps the most recent ones (save-24 survives)', vhPruned.some((s) => s.label === 'save-24'))
check('createSnapshot: pruning drops the oldest ones (save-0 is gone)', !vhPruned.some((s) => s.label === 'save-0'))

// deleteSnapshot: manual cleanup.
const vhDeleteProjectId = 'version-history-delete-test-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: vhDeleteProjectId,
      name: 'Delete Test Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    },
  ],
}))
useContentStore.getState().setManuscript(vhDeleteProjectId, makeVersionTestManuscript('delete-fixture.md'))
await useVersionStore.getState().createSnapshot(vhDeleteProjectId, 'manual', 'To be deleted')
await useVersionStore.getState().listSnapshots(vhDeleteProjectId)
const vhSnapshotToDelete = useVersionStore.getState().getSnapshots(vhDeleteProjectId)[0]
await useVersionStore.getState().deleteSnapshot(vhDeleteProjectId, vhSnapshotToDelete.id)
check(
  'deleteSnapshot: removes it from versionStore state',
  !useVersionStore.getState().getSnapshots(vhDeleteProjectId).some((s) => s.id === vhSnapshotToDelete.id),
)
check(
  'deleteSnapshot: removes it from IndexedDB',
  !(await listSnapshotsFromDb(vhDeleteProjectId)).some((s) => s.id === vhSnapshotToDelete.id),
)

// restoreSnapshot: calls setManuscript/updateProjectSettings with the
// snapshot's data, and itself creates a pre-restore safety snapshot first.
const vhRestoreProjectId = 'version-history-restore-test-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: vhRestoreProjectId,
      name: 'Restore Test Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS, themeId: 'theme-to-be-restored' },
    },
  ],
}))
useContentStore.getState().setManuscript(vhRestoreProjectId, makeVersionTestManuscript('to-be-restored.md'))
await useVersionStore.getState().createSnapshot(vhRestoreProjectId, 'manual', 'Good version')
await useVersionStore.getState().listSnapshots(vhRestoreProjectId)
const vhGoodSnapshot = useVersionStore.getState().getSnapshots(vhRestoreProjectId).find((s) => s.label === 'Good version')!

// Now diverge: a bad edit to the manuscript and settings, as if the user
// had a rough editing session since the good snapshot was taken.
useContentStore.getState().setManuscript(vhRestoreProjectId, makeVersionTestManuscript('bad-edit.md'))
useProjectStore.getState().updateProjectSettings(vhRestoreProjectId, { themeId: 'bad-theme' })

await useVersionStore.getState().restoreSnapshot(vhRestoreProjectId, vhGoodSnapshot.id)
check(
  'restoreSnapshot: calls setManuscript with the snapshot\'s manuscript',
  useContentStore.getState().getManuscript(vhRestoreProjectId)?.sourceFileName === 'to-be-restored.md',
)
check(
  'restoreSnapshot: calls updateProjectSettings with the snapshot\'s settings',
  useProjectStore.getState().getProject(vhRestoreProjectId)?.settings.themeId === 'theme-to-be-restored',
)
const vhSnapshotsAfterRestore = useVersionStore.getState().getSnapshots(vhRestoreProjectId)
check(
  'restoreSnapshot: creates a pre-restore safety snapshot of the about-to-be-overwritten state',
  vhSnapshotsAfterRestore.some((s) => s.label === 'Before restoring an earlier version' && s.manuscript.sourceFileName === 'bad-edit.md'),
)
check(
  'restoreSnapshot: the safety snapshot is kind "auto"',
  vhSnapshotsAfterRestore.find((s) => s.label === 'Before restoring an earlier version')?.kind === 'auto',
)

// --- Block-type registry (Milestone 1 of docs/MODULAR_PAGE_SYSTEM_PLAN.md) ---
// The registry replaced three parallel switches (BlockContent.tsx,
// exportPdf.ts's drawBlock, paginate.ts's blockSpacing) with one lookup per
// ContentBlockType. These checks lock in the registry's own shape — not a
// re-test of rendering output itself, which the rest of this suite doesn't
// exercise in jsdom either.
const ALL_BLOCK_TYPES: ContentBlockType[] = ['heading', 'paragraph', 'image', 'list', 'table', 'quote']
for (const type of ALL_BLOCK_TYPES) {
  const def = getBlockTypeDefinition(type)
  check(
    `block registry: has a complete definition for "${type}"`,
    !!def && def.id === type && typeof def.Render === 'function' && typeof def.drawPdf === 'function',
  )
}
check(
  'block registry: blockSpacing matches the pre-refactor blockSpacing switch for heading/image/quote (8/6/6)',
  getBlockTypeDefinition('heading')?.blockSpacing?.({ id: 'x', type: 'heading', level: 1, text: '' }) === 8
    && getBlockTypeDefinition('image')?.blockSpacing?.({ id: 'x', type: 'image', assetId: 'a', rotation: 0 }) === 6
    && getBlockTypeDefinition('quote')?.blockSpacing?.({ id: 'x', type: 'quote', text: '' }) === 6,
)
check(
  'block registry: paragraph/list/table have no blockSpacing entry (paginate.ts defaults them to 0)',
  getBlockTypeDefinition('paragraph')?.blockSpacing === undefined
    && getBlockTypeDefinition('list')?.blockSpacing === undefined
    && getBlockTypeDefinition('table')?.blockSpacing === undefined,
)
check(
  'block registry: getBlockTypeDefinition returns undefined for a made-up block type',
  getBlockTypeDefinition('not-a-real-type' as ContentBlockType) === undefined,
)

// --- Structural pages (Milestone 2 of docs/MODULAR_PAGE_SYSTEM_PLAN.md) ---
// New, additive StructuralPage data layer proven on 4 types (Cover, Title
// Page, Copyright, Blank Page): structuralPageStore CRUD, composeBookPages
// (pure splicing of front-/back-matter around paginate.ts's own output),
// registry lookups, and the editorActions.ts history wrappers that make
// this new surface undoable.
const { getStructuralPageTypeDefinition } = await import('../src/structuralPages/registry')
const { useStructuralPageStore } = await import('../src/store/structuralPageStore')
const { composeBookPages } = await import('../src/renderer/composePages')
const {
  insertPageWithHistory,
  duplicatePageWithHistory,
  deletePageWithHistory,
  movePageWithHistory,
  updatePageContentWithHistory,
} = await import('../src/store/editorActions')
const { useHistoryStore: useHistoryStoreForPages } = await import('../src/store/historyStore')
import type { StructuralPageType } from '../src/types/structuralPage'
import type { LaidOutPage } from '../src/renderer/paginate'

// Registry lookups — every one of the 4 shipped types has both Render and drawPdf.
const ALL_STRUCTURAL_TYPES: StructuralPageType[] = ['cover', 'title-page', 'copyright', 'blank']
for (const type of ALL_STRUCTURAL_TYPES) {
  const def = getStructuralPageTypeDefinition(type)
  check(
    `structural page registry: has a complete definition for "${type}"`,
    !!def && def.id === type && typeof def.Render === 'function' && typeof def.drawPdf === 'function' && typeof def.defaultContent === 'function',
  )
}
check(
  'structural page registry: getStructuralPageTypeDefinition returns undefined for a made-up type',
  getStructuralPageTypeDefinition('not-a-real-type' as StructuralPageType) === undefined,
)

// structuralPageStore CRUD
const spProjectA = 'sp-project-a'
const spProjectB = 'sp-project-b' // used to prove cross-project isolation

const spStore = useStructuralPageStore.getState()
const revBefore = spStore.getRevision(spProjectA)
const coverId = spStore.insertPage(spProjectA, 'front-matter', 'cover', null)
check('structuralPageStore.insertPage: bumps revisionByProject', useStructuralPageStore.getState().getRevision(spProjectA) > revBefore)
check(
  'structuralPageStore.insertPage: inserted page has the right type/category',
  useStructuralPageStore.getState().getPages(spProjectA).some((p) => p.id === coverId && p.type === 'cover' && p.category === 'front-matter'),
)
const titleId = spStore.insertPage(spProjectA, 'front-matter', 'title-page', coverId)
check(
  'structuralPageStore.insertPage: inserts after the given afterPageId',
  useStructuralPageStore.getState().getPages(spProjectA).findIndex((p) => p.id === titleId)
    === useStructuralPageStore.getState().getPages(spProjectA).findIndex((p) => p.id === coverId) + 1,
)
const backBlankId = spStore.insertPage(spProjectA, 'back-matter', 'blank', null)
check(
  'structuralPageStore.insertPage: front-matter and back-matter are independently ordered',
  useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'front-matter').length === 2
    && useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'back-matter').length === 1
    && useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'back-matter')[0].id === backBlankId,
)

// Cross-project isolation: mutating project A never touches project B.
useStructuralPageStore.getState().insertPage(spProjectB, 'front-matter', 'copyright', null)
const revBBefore = useStructuralPageStore.getState().getRevision(spProjectB)
useStructuralPageStore.getState().insertPage(spProjectA, 'front-matter', 'blank', null)
check(
  'structuralPageStore: mutating one project never touches another project\'s pages or revision',
  useStructuralPageStore.getState().getPages(spProjectB).length === 1
    && useStructuralPageStore.getState().getRevision(spProjectB) === revBBefore,
)

// duplicatePage
const revBeforeDup = useStructuralPageStore.getState().getRevision(spProjectA)
const dupId = useStructuralPageStore.getState().duplicatePage(spProjectA, coverId)
check('structuralPageStore.duplicatePage: returns a fresh id', !!dupId && dupId !== coverId)
check('structuralPageStore.duplicatePage: bumps revisionByProject', useStructuralPageStore.getState().getRevision(spProjectA) > revBeforeDup)
check(
  'structuralPageStore.duplicatePage: clone is inserted immediately after the original, same category',
  useStructuralPageStore.getState().getPages(spProjectA).findIndex((p) => p.id === dupId)
    === useStructuralPageStore.getState().getPages(spProjectA).findIndex((p) => p.id === coverId) + 1,
)
check(
  'structuralPageStore.duplicatePage: returns undefined for a non-existent page id',
  useStructuralPageStore.getState().duplicatePage(spProjectA, 'does-not-exist') === undefined,
)

// movePage
const beforeMoveOrder = useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'front-matter').map((p) => p.id)
useStructuralPageStore.getState().movePage(spProjectA, beforeMoveOrder[1], 'up')
const afterMoveOrder = useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'front-matter').map((p) => p.id)
check(
  'structuralPageStore.movePage: swaps with the previous page in the same category',
  afterMoveOrder[0] === beforeMoveOrder[1] && afterMoveOrder[1] === beforeMoveOrder[0],
)
const revBeforeNoopMove = useStructuralPageStore.getState().getRevision(spProjectA)
const topId = useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'front-matter')[0].id
useStructuralPageStore.getState().movePage(spProjectA, topId, 'up')
check(
  'structuralPageStore.movePage: no-ops (order unchanged) when already at the top of its category',
  useStructuralPageStore.getState().getPagesByCategory(spProjectA, 'front-matter')[0].id === topId,
)
check(
  'structuralPageStore.movePage: does NOT bump revision on a genuine no-op move at a category boundary (unlike deleteBlock\'s always-bump precedent — here nothing at all changed, so no revision bump is the more correct behaviour)',
  useStructuralPageStore.getState().getRevision(spProjectA) === revBeforeNoopMove,
)

// deletePage
const revBeforeDelete = useStructuralPageStore.getState().getRevision(spProjectA)
const countBeforeDelete = useStructuralPageStore.getState().getPages(spProjectA).length
useStructuralPageStore.getState().deletePage(spProjectA, dupId!)
check('structuralPageStore.deletePage: removes the page', useStructuralPageStore.getState().getPages(spProjectA).length === countBeforeDelete - 1)
check('structuralPageStore.deletePage: bumps revisionByProject', useStructuralPageStore.getState().getRevision(spProjectA) > revBeforeDelete)
check(
  'structuralPageStore.deletePage: leaves project B untouched',
  useStructuralPageStore.getState().getPages(spProjectB).length === 1,
)

// updatePageContent, including the imageAssetId -> assets sync for Cover pages
useStructuralPageStore.getState().updatePageContent(spProjectA, coverId, { title: 'My Book', imageAssetId: 'asset-123' })
const updatedCover = useStructuralPageStore.getState().getPages(spProjectA).find((p) => p.id === coverId)
check('structuralPageStore.updatePageContent: applies the update', updatedCover?.type === 'cover' && updatedCover.content.title === 'My Book')
check(
  'structuralPageStore.updatePageContent: syncs CoverPage.assets from imageAssetId (mirrors ImageBlock.assetId tracking)',
  JSON.stringify(updatedCover?.assets) === JSON.stringify(['asset-123']),
)
useStructuralPageStore.getState().updatePageContent(spProjectA, coverId, { imageAssetId: undefined })
check(
  'structuralPageStore.updatePageContent: clearing imageAssetId clears assets too',
  JSON.stringify(useStructuralPageStore.getState().getPages(spProjectA).find((p) => p.id === coverId)?.assets) === JSON.stringify([]),
)

// --- composeBookPages (pure function) ---
function makeStructuralFixture(id: string, category: 'front-matter' | 'back-matter', order: number) {
  return { id, category, order, type: 'blank' as const, content: {} }
}
function makePaginatedFixture(count: number): LaidOutPage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `paginated-${i}`,
    number: i + 1,
    side: (i % 2 === 0 ? 'right' : 'left') as 'left' | 'right',
    kind: 'content' as const,
    blocks: [],
  }))
}

const paginatedFixture = makePaginatedFixture(3)
const composedNone = composeBookPages([], paginatedFixture, [])
check('composeBookPages: 0 front/back matter returns paginated pages unchanged (same length)', composedNone.length === paginatedFixture.length)
check(
  'composeBookPages: 0 front/back matter never mutates paginated pages\' own number/side',
  JSON.stringify(composedNone.map((p) => [p.number, p.side])) === JSON.stringify(paginatedFixture.map((p) => [p.number, p.side])),
)

const oneFront = [makeStructuralFixture('front-1', 'front-matter', 0)]
const composedOneFront = composeBookPages(oneFront, paginatedFixture, [])
check('composeBookPages: 1 front-matter page is prepended', composedOneFront[0].id === 'front-1' && composedOneFront[0].kind === 'structural')
check('composeBookPages: 1 front-matter page — total length is front + paginated', composedOneFront.length === 1 + paginatedFixture.length)
check('composeBookPages: 1 front-matter page at position 1 gets side "right"', composedOneFront[0].side === 'right')
check(
  'composeBookPages: paginated pages\' own number/side still untouched with front matter present',
  JSON.stringify(composedOneFront.slice(1).map((p) => [p.number, p.side])) === JSON.stringify(paginatedFixture.map((p) => [p.number, p.side])),
)

const twoFront = [makeStructuralFixture('front-1', 'front-matter', 0), makeStructuralFixture('front-2', 'front-matter', 1)]
const oneBack = [makeStructuralFixture('back-1', 'back-matter', 0)]
const composedFull = composeBookPages(twoFront, paginatedFixture, oneBack)
check(
  'composeBookPages: 2 front-matter + paginated + 1 back-matter — correct concatenation order',
  composedFull.map((p) => p.id).join(',') === ['front-1', 'front-2', ...paginatedFixture.map((p) => p.id), 'back-1'].join(','),
)
check('composeBookPages: front-matter positions 1/2 get right/left side', composedFull[0].side === 'right' && composedFull[1].side === 'left')
check(
  'composeBookPages: back-matter page position (6th overall — 2 front + 3 paginated before it) gets side "left"',
  composedFull[composedFull.length - 1].side === 'left',
)
check(
  'composeBookPages: structuralPageId is set to the structural page\'s own id (reused, not regenerated — needed for requestScrollToPage)',
  composedFull[0].structuralPageId === 'front-1' && composedFull[composedFull.length - 1].structuralPageId === 'back-1',
)
check('composeBookPages: structural pages carry no blocks', composedFull[0].blocks.length === 0)

// --- editorActions.ts history wrappers for structural pages ---
const eaPagesProjectId = 'ea-structural-pages-project'
const newPageId = insertPageWithHistory(eaPagesProjectId, 'front-matter', 'title-page', null)
check('insertPageWithHistory: creates the page', useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === newPageId))
useHistoryStoreForPages.getState().undo(eaPagesProjectId)
check('insertPageWithHistory -> undo: removes the just-created page', !useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === newPageId))
useHistoryStoreForPages.getState().redo(eaPagesProjectId)
check(
  'insertPageWithHistory -> undo -> redo: re-creates the exact same page id (not a new one)',
  useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === newPageId),
)

const eaDupId = duplicatePageWithHistory(eaPagesProjectId, newPageId)
check('duplicatePageWithHistory: creates a clone', !!eaDupId && useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === eaDupId))
useHistoryStoreForPages.getState().undo(eaPagesProjectId)
check('duplicatePageWithHistory -> undo: removes the clone', !useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === eaDupId))

const eaCountBeforeDelete = useStructuralPageStore.getState().getPages(eaPagesProjectId).length
deletePageWithHistory(eaPagesProjectId, newPageId)
check('deletePageWithHistory: removes the page', useStructuralPageStore.getState().getPages(eaPagesProjectId).length === eaCountBeforeDelete - 1)
useHistoryStoreForPages.getState().undo(eaPagesProjectId)
check(
  'deletePageWithHistory -> undo: restores the page at its original position/id',
  useStructuralPageStore.getState().getPages(eaPagesProjectId).some((p) => p.id === newPageId),
)

// Seed an initial, explicit title first (via the plain, non-history action)
// so the "old snapshot" undo restores has a real value to come back to —
// a freshly-created page's `content.title` key is simply absent, and
// merging an old snapshot that never had the key back in can't "unset" a
// key the same way `editBlock`'s always-fully-populated `ContentBlock`
// fields can, so this exercises the realistic edit-an-existing-value case.
useStructuralPageStore.getState().updatePageContent(eaPagesProjectId, newPageId, { title: 'Original Title' })
updatePageContentWithHistory(eaPagesProjectId, newPageId, { title: 'Edited Title' })
check(
  'updatePageContentWithHistory: applies the edit',
  (useStructuralPageStore.getState().getPages(eaPagesProjectId).find((p) => p.id === newPageId)?.content as { title?: string })?.title === 'Edited Title',
)
useHistoryStoreForPages.getState().undo(eaPagesProjectId)
check(
  'updatePageContentWithHistory -> undo: restores the prior content exactly',
  (useStructuralPageStore.getState().getPages(eaPagesProjectId).find((p) => p.id === newPageId)?.content as { title?: string })?.title === 'Original Title',
)

const eaMoveProjectId = 'ea-structural-pages-move-project'
const moveIdA = insertPageWithHistory(eaMoveProjectId, 'front-matter', 'blank', null)
const moveIdB = insertPageWithHistory(eaMoveProjectId, 'front-matter', 'blank', moveIdA)
movePageWithHistory(eaMoveProjectId, moveIdB, 'up')
check(
  'movePageWithHistory: reorders (moveIdB now first)',
  useStructuralPageStore.getState().getPages(eaMoveProjectId)[0].id === moveIdB,
)
useHistoryStoreForPages.getState().undo(eaMoveProjectId)
check(
  'movePageWithHistory -> undo: restores the original order',
  useStructuralPageStore.getState().getPages(eaMoveProjectId)[0].id === moveIdA,
)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
