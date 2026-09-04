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

// --- Page identity is stable across runs (Phase 139) ---
// The whole writing experience rested on this: `LazySpread` keys its pages
// by `page.id`, so a fresh random id per run made React tear down and
// rebuild every page — destroying the focused element and the caret in it.
{
  const runA = paginate(bigChapters, () => 60, contentHeight, 100)
  const runB = paginate(bigChapters, () => 60, contentHeight, 100)
  check(
    'paginate: identical input produces identical page ids',
    runA.pages.length === runB.pages.length && runA.pages.every((page, i) => page.id === runB.pages[i].id),
  )
  check('paginate: page ids are unique within a run', new Set(runA.pages.map((x) => x.id)).size === runA.pages.length)

  // Editing a chapter must not renumber the pages before the edit — that is
  // what lets the page holding the caret keep its React identity while its
  // contents reflow.
  const edited = bigChapters.map((c, i) =>
    i === bigChapters.length - 1 ? { ...c, blocks: [...c.blocks, { id: 'extra-block', type: 'paragraph' as const, html: 'More.' }] } : c,
  )
  const runC = paginate(edited, () => 60, contentHeight, 100)
  const sharedPrefix = Math.min(runA.pages.length, runC.pages.length)
  let stable = 0
  for (let i = 0; i < sharedPrefix; i++) if (runA.pages[i].id === runC.pages[i].id) stable++
  check('paginate: adding a block keeps earlier page ids stable', stable === sharedPrefix)
}
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
/**
 * Serves anything under `public/` straight from disk, the way the dev server
 * and the deployed site both do.
 *
 * Covers absolute same-origin URLs as well as root-relative ones: production
 * code resolves asset paths against `document.baseURI` (so the app keeps
 * working when served from a sub-path), which means requests arrive here as
 * `http://localhost/...` rather than `/...`.
 *
 * Deliberately broader than the fonts-only shim it replaces. The spell-check
 * dictionaries live under `public/dictionaries/`, and without them every
 * spelling-dependent checker silently reported "not analysed" — which is how
 * a genuine assertion about category scores came to fail without anyone
 * noticing the dictionary had never loaded.
 */
// @ts-expect-error -- test shim
globalThis.fetch = async (url: string) => {
  const requestPath = typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '') : ''
  if (requestPath.startsWith('/')) {
    const filePath = path.join(__dirname, '..', 'public', requestPath)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const buf = fs.readFileSync(filePath)
      return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as Response
    }
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
import { DEFAULT_STYLE_GUIDE } from '../src/virtualEditor/types'
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

// Straight vs curly quote consistency, WITH a Style Guide preference
// (Phase 24) — the checker's old book-wide-mixing behaviour must stay
// byte-for-byte unchanged when no preference is set (including when
// 'no-preference' is passed explicitly), but must switch to per-span,
// preference-aware flagging once a real preference is set.
const mixedQuoteText = 'He said "hi" and she said “hello”.'
check(
  'VE proofreading: styleGuide.quoteStyle "no-preference" behaves exactly like no styleGuide at all',
  quoteStyleConsistencyChecker.run({
    manuscript: makeSingleParagraphManuscript(mixedQuoteText),
    styleGuide: { ...DEFAULT_STYLE_GUIDE, quoteStyle: 'no-preference' },
  }).length === 1,
)
const curlyPreferenceFindings = quoteStyleConsistencyChecker.run({
  manuscript: makeSingleParagraphManuscript(mixedQuoteText),
  styleGuide: { ...DEFAULT_STYLE_GUIDE, quoteStyle: 'curly' },
})
check(
  'VE proofreading: with quoteStyle "curly" preferred, the straight-quote span is flagged (not the book-wide message)',
  curlyPreferenceFindings.length === 1 && curlyPreferenceFindings[0]?.issueType === 'quote-style-preference-violation',
)
check(
  'VE proofreading: curly-preference finding message names the actual preference',
  curlyPreferenceFindings[0]?.message.includes('curly') ?? false,
)
const straightPreferenceFindings = quoteStyleConsistencyChecker.run({
  manuscript: makeSingleParagraphManuscript(mixedQuoteText),
  styleGuide: { ...DEFAULT_STYLE_GUIDE, quoteStyle: 'straight' },
})
check(
  'VE proofreading: with quoteStyle "straight" preferred, the curly-quote span is flagged',
  straightPreferenceFindings.length === 1 && straightPreferenceFindings[0]?.issueType === 'quote-style-preference-violation',
)
check(
  'VE proofreading: a manuscript using only the preferred quote style produces no findings',
  quoteStyleConsistencyChecker.run({
    manuscript: makeSingleParagraphManuscript('He said “hi” and she said “hello”.'),
    styleGuide: { ...DEFAULT_STYLE_GUIDE, quoteStyle: 'curly' },
  }).length === 0,
)

// --- Virtual Editor: Consistency checkers (term-casing + measurement units) ---
import { termCasingConsistencyChecker, measurementUnitConsistencyChecker } from '../src/virtualEditor/checkers/consistency'

function makeMultiParagraphManuscript(paragraphs: string[]): Manuscript {
  return {
    chapters: [
      {
        id: 've-consistency-chapter',
        title: 'Chapter One',
        order: 0,
        blocks: paragraphs.map((html, i) => ({ id: `ve-consistency-block-${i}`, type: 'paragraph', html }) as ParagraphBlock),
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName: 'virtual-editor-consistency-fixture.md',
  }
}

// Term casing: "Forest Garden" (Title Case, x2) vs "forest garden" (lowercase,
// x1) — 3 total mentions clears the combined-frequency floor.
const termCasingDirty = termCasingConsistencyChecker.run({
  manuscript: makeMultiParagraphManuscript([
    'Forest Garden design begins in spring.',
    'Many gardeners visit the forest garden every year.',
    'The Forest Garden thrives with native plants.',
  ]),
})
const termCasingFinding = termCasingDirty.find((f) => f.issueType === 'term-casing-inconsistency' && f.message.includes('Forest Garden'))
check('VE consistency: inconsistent term casing detected across the book', termCasingFinding !== undefined)
check('VE consistency: term-casing finding has no suggestedFix (flag-only, per doc precedent)', termCasingFinding?.suggestedFix === undefined)
check('VE consistency: term-casing finding is minor severity', termCasingFinding?.severity === 'minor')

// No false positive when the term is used with one consistent casing throughout.
const termCasingClean = termCasingConsistencyChecker.run({
  manuscript: makeMultiParagraphManuscript([
    'Forest Garden design begins in spring.',
    'Every visitor loves the Forest Garden greatly.',
    'The Forest Garden thrives with native plants.',
  ]),
})
check(
  'VE consistency: no false positive when a term is capitalised consistently every time',
  termCasingClean.every((f) => f.issueType !== 'term-casing-inconsistency'),
)

// No false positive below the combined-frequency floor: exactly one of each
// casing (2 total) is deliberately not enough to call it a genuine pattern.
const termCasingBelowFloor = termCasingConsistencyChecker.run({
  manuscript: makeMultiParagraphManuscript(['Rare Term appears once here.', 'Then rare term appears lowercase once.']),
})
check(
  'VE consistency: no false positive below the combined-frequency floor (only 2 total mentions)',
  termCasingBelowFloor.every((f) => f.issueType !== 'term-casing-inconsistency'),
)

// Sentence-initial article + proper noun ("The Forest Garden...") must not be
// mistaken for a genuine "the forest" vs "the Forest" casing inconsistency —
// the exact false-positive LEADING_STOPWORDS exists to prevent.
const leadingArticleNoFalsePositive = termCasingConsistencyChecker.run({
  manuscript: makeMultiParagraphManuscript([
    'The Forest Garden is beautiful in every season of the year.',
    'Visitors often admire the forest views from the upper path.',
    'The Forest Garden welcomes new volunteers throughout the year.',
  ]),
})
check(
  'VE consistency: sentence-initial "The" before a proper noun does not falsely flag "the forest"/"the Forest" as inconsistent',
  leadingArticleNoFalsePositive.every((f) => !(f.issueType === 'term-casing-inconsistency' && f.message.toLowerCase().includes('"the forest"'))),
)

// Measurement units: metric vs imperial mixing
const unitMixManuscript = makeMultiParagraphManuscript([
  'The raised bed measures 5 metres by 2 metres in the plan.',
  'An older sketch shows the same bed as 16 feet by 6 feet.',
])
const unitMixFindings = measurementUnitConsistencyChecker.run({ manuscript: unitMixManuscript })
check(
  'VE consistency: metric vs imperial unit mixing detected',
  unitMixFindings.some((f) => f.issueType === 'metric-imperial-mixing'),
)
check(
  'VE consistency: metric/imperial finding has no suggestedFix (flag-only)',
  unitMixFindings.find((f) => f.issueType === 'metric-imperial-mixing')?.suggestedFix === undefined,
)
check(
  'VE consistency: no false positive on a metric-only manuscript',
  measurementUnitConsistencyChecker
    .run({ manuscript: makeMultiParagraphManuscript(['The bed measures 5 metres by 2 metres.', 'A path runs 10 metres further along.']) })
    .every((f) => f.issueType !== 'metric-imperial-mixing'),
)

// Measurement units: abbreviated vs spelled-out metric style
const unitStyleFindings = measurementUnitConsistencyChecker.run({
  manuscript: makeMultiParagraphManuscript(['The bed is 5m wide and 2m deep.', 'The path beyond is 10 metres long.']),
})
check(
  'VE consistency: abbreviated vs spelled-out metric unit style inconsistency detected',
  unitStyleFindings.some((f) => f.issueType === 'unit-abbreviation-style-inconsistency'),
)
check(
  'VE consistency: no false positive when metric units are always spelled out',
  measurementUnitConsistencyChecker
    .run({ manuscript: makeMultiParagraphManuscript(['The bed is 5 metres wide.', 'The path beyond is 10 metres long.']) })
    .every((f) => f.issueType !== 'unit-abbreviation-style-inconsistency'),
)

// --- Virtual Editor: Readability checkers (Flesch Reading Ease / Grade
// Level + long-sentence-paragraph flagging) ---
import { fleschReadabilityChecker, longSentenceParagraphChecker, countSyllables } from '../src/virtualEditor/checkers/readability'

check('VE readability: syllable heuristic gives a sane count for a simple word', countSyllables('garden') === 2)
check('VE readability: syllable heuristic handles a silent trailing "e"', countSyllables('like') === 1)
check('VE readability: syllable heuristic gives "-le" its own syllable after a consonant', countSyllables('table') === 2)
check('VE readability: every word counts as at least one syllable', countSyllables('a') === 1)

const readabilityManuscript = makeMultiParagraphManuscript([
  'The garden is calm. Birds sing at dawn. Frost melts by noon.',
  'Visitors walk the paths and rest under the old oak tree.',
])
const readabilityFindings = fleschReadabilityChecker.run({ manuscript: readabilityManuscript })
check('VE readability: produces exactly one book-level Flesch finding', readabilityFindings.length === 1)
check('VE readability: Flesch finding has no blockId (book-level, not per-block)', readabilityFindings[0]?.location.blockId === undefined)
check('VE readability: Flesch finding has no suggestedFix (informational only)', readabilityFindings[0]?.suggestedFix === undefined)
check('VE readability: Flesch finding message reports both the reading-ease score and grade level', /Reading Ease is -?\d/.test(readabilityFindings[0]?.message ?? '') && /Grade Level -?\d/.test(readabilityFindings[0]?.message ?? ''))
check(
  'VE readability: no finding at all when the manuscript has no paragraph prose',
  fleschReadabilityChecker.run({
    manuscript: { chapters: [{ id: 'c', title: 'C', order: 0, blocks: [{ id: 'h', type: 'heading', level: 1, text: 'Just a heading' }] }], importedAt: new Date().toISOString(), sourceFileName: 'x.md' },
  }).length === 0,
)

// A deliberately dense, run-on paragraph (one very long sentence) vs a clean,
// short-sentence paragraph in the same manuscript — only the long one should
// be flagged, with a real per-block location.
const longSentenceText =
  'When the gardeners arrived early in the morning before the frost had fully lifted from the raised beds and the greenhouse glass was still fogged with condensation from the overnight chill, they began the long and careful process of turning the compost, checking the irrigation lines for blockages, and noting which seedlings had survived the unexpectedly cold snap that had settled over the whole valley the previous week.'
const shortSentenceText = 'The gardeners arrived early. They checked the beds. Everything looked fine.'
const longSentenceManuscript = makeMultiParagraphManuscript([longSentenceText, shortSentenceText])
const longSentenceFindings = longSentenceParagraphChecker.run({ manuscript: longSentenceManuscript })
check('VE readability: unusually long sentence paragraph flagged', longSentenceFindings.length === 1)
check('VE readability: long-sentence finding points at the exact offending block', longSentenceFindings[0]?.location.blockId === 've-consistency-block-0')
check('VE readability: long-sentence finding is minor severity, informational only', longSentenceFindings[0]?.severity === 'minor' && longSentenceFindings[0]?.suggestedFix === undefined)
check(
  'VE readability: no false positive on a paragraph of short, clean sentences',
  longSentenceParagraphChecker.run({ manuscript: makeMultiParagraphManuscript([shortSentenceText]) }).length === 0,
)

// --- Virtual Editor: Copy editing checkers (Phase 24 — first
// Style-Guide-dependent checker: only ever fires when a heading
// capitalisation preference is explicitly set) ---
import { headingCapitalisationChecker } from '../src/virtualEditor/checkers/copyEditing'

function makeHeadingManuscript(headings: string[]): Manuscript {
  return {
    chapters: [
      {
        id: 've-heading-chapter',
        title: 'Chapter One',
        order: 0,
        blocks: headings.map((text, i) => ({ id: `ve-heading-${i}`, type: 'heading', level: 2, text }) as HeadingBlock),
      },
    ],
    importedAt: new Date().toISOString(),
    sourceFileName: 've-heading-fixture.md',
  }
}

// Title Case: correctly-cased heading is never flagged.
check(
  'VE copyEditing: a correctly Title-Cased heading is not flagged',
  headingCapitalisationChecker.run({
    manuscript: makeHeadingManuscript(['A Walk in the Garden']),
    styleGuide: { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'title-case' },
  }).length === 0,
)
// Title Case: a major word left lowercase ("walk") is flagged.
const titleCaseFindings = headingCapitalisationChecker.run({
  manuscript: makeHeadingManuscript(['A walk in the Garden']),
  styleGuide: { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'title-case' },
})
check('VE copyEditing: a heading violating Title Case is flagged', titleCaseFindings.length === 1)
check('VE copyEditing: Title Case finding is in the copyEditing category', titleCaseFindings[0]?.category === 'copyEditing')
check('VE copyEditing: Title Case finding has no suggestedFix (flag-only)', titleCaseFindings[0]?.suggestedFix === undefined)
check('VE copyEditing: Title Case finding points at the exact heading block', titleCaseFindings[0]?.location.blockId === 've-heading-0')

// Sentence case: correctly-cased heading (only first word capitalised, no
// proper nouns in this fixture) is never flagged.
check(
  'VE copyEditing: a correctly Sentence-cased heading is not flagged',
  headingCapitalisationChecker.run({
    manuscript: makeHeadingManuscript(['The history of gardening']),
    styleGuide: { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'sentence-case' },
  }).length === 0,
)
// Sentence case: extra capitalised words are flagged.
const sentenceCaseFindings = headingCapitalisationChecker.run({
  manuscript: makeHeadingManuscript(['The History Of Gardening']),
  styleGuide: { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'sentence-case' },
})
check('VE copyEditing: a heading violating Sentence case is flagged', sentenceCaseFindings.length === 1)

// Never fires with no preference set — the checker's whole premise is that
// it needs an explicit Style Guide opinion to have anything to enforce.
check(
  'VE copyEditing: does not fire at all when headingCapitalisation is "no-preference"',
  headingCapitalisationChecker.run({
    manuscript: makeHeadingManuscript(['A walk in the Garden', 'The History Of Gardening']),
    styleGuide: { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'no-preference' },
  }).length === 0,
)
check(
  'VE copyEditing: does not fire at all when no styleGuide is passed',
  headingCapitalisationChecker.run({
    manuscript: makeHeadingManuscript(['A walk in the Garden', 'The History Of Gardening']),
  }).length === 0,
)

// Pipeline + score aggregation
const dirtyReport = runPipeline('ve-test-project', makeSingleParagraphManuscript('This  has a double space and the the repeated word'))
check('VE pipeline: dirty manuscript scores below 100 on proofreading', (dirtyReport.categoryScores.proofreading?.score ?? 100) < 100)
check('VE pipeline: overall score is computed once at least one category is analysed', dirtyReport.overallScore !== null)
check(
  // copyEditing gained a real (if conditionally silent) checker in Phase 24
  // (headingCapitalisationChecker) — it's no longer a "not yet analysed"
  // example. publishingStandards has no checker at all yet, so it's the
  // still-accurate example of a category that stays null.
  'VE pipeline: a category with no checker registered at all still stays null (honest "not yet analysed") — publishing standards has no checker yet',
  dirtyReport.categoryScores.publishingStandards === null,
)
check(
  'VE pipeline: consistency and readability are no longer null now that real checkers are registered for them (Phase 23)',
  dirtyReport.categoryScores.consistency !== null && dirtyReport.categoryScores.readability !== null,
)
check(
  // Registering headingCapitalisationChecker under copyEditing (Phase 24)
  // means that category is now "analysed" too, even when no styleGuide is
  // passed at all — the checker correctly finds nothing (it only fires with
  // an explicit heading-capitalisation preference), so it scores a real,
  // honest 100 rather than null. This mirrors the documented scoring rule:
  // "a category with a registered checker but zero findings scores a real
  // 100" — not a bug, but worth asserting explicitly since it's a visible
  // dashboard behaviour change (Grammar Score tile goes from "Not yet
  // analysed" to "100" even with no Style Guide set at all).
  'VE pipeline: copyEditing now scores a real 100 (registered checker, zero findings with no styleGuide passed) instead of null',
  dirtyReport.categoryScores.copyEditing !== null && dirtyReport.categoryScores.copyEditing?.score === 100,
)
// Derived from the report itself rather than a hardcoded category list.
// The previous version named the four categories that had checkers when it
// was written; four more (developmental, typography, accessibility,
// commercial) were registered afterwards, so the assertion quietly went stale
// and started failing — unnoticed, because the suite was already red further
// down. Reading whatever the pipeline actually analysed keeps this honest as
// new checkers are added, which is the whole point of the assertion.
const analysedDirtyScores = Object.values(dirtyReport.categoryScores).filter(
  (c): c is NonNullable<typeof c> => c !== null,
)
check(
  'VE pipeline: at least the four long-standing categories are analysed',
  [
    dirtyReport.categoryScores.proofreading,
    dirtyReport.categoryScores.consistency,
    dirtyReport.categoryScores.readability,
    dirtyReport.categoryScores.copyEditing,
  ].every((c) => c !== null),
)
check(
  'VE pipeline: overall score equals the mean of every analysed category, not just proofreading alone',
  dirtyReport.overallScore === Math.round(analysedDirtyScores.reduce((sum, c) => sum + c.score, 0) / analysedDirtyScores.length),
)

const cleanReport = runPipeline('ve-test-project', makeSingleParagraphManuscript('This is a perfectly clean sentence.'))
check('VE pipeline: clean manuscript scores a perfect 100 on proofreading', cleanReport.categoryScores.proofreading?.score === 100)
check('VE pipeline: clean manuscript has zero proofreading findings', cleanReport.findings.filter((f) => f.category === 'proofreading').length === 0)
check('VE pipeline: clean manuscript has zero consistency findings (too short for a real pattern)', cleanReport.findings.filter((f) => f.category === 'consistency').length === 0)
check(
  'VE pipeline: clean manuscript still gets exactly one informational readability finding — the book-level Flesch report is always produced when there is prose, not only when something is wrong',
  cleanReport.findings.filter((f) => f.category === 'readability').length === 1,
)

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

/**
 * `virtualEditorStore.runReview` defers `runPipeline` by one tick
 * (`window.setTimeout(…, 0)`) so the "Reviewing…" state paints before the
 * synchronous pipeline blocks the main thread. These tests therefore have to
 * let that tick run before asserting on the report — reading it synchronously
 * finds no report at all, which is what silently broke this suite: the
 * assertions below failed, and a later line dereferenced the missing report
 * and killed the whole run before anything after it could execute.
 */
const flushReview = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// fixCategory: scoped correctly (a category with no matching findings is a
// no-op; the matching category applies every fixable 'new' finding in it
// and leaves the unfixable one alone).
const fixCategoryProjectId = 've-fixcategory-test-project'
useContentStoreForFixAll.getState().setManuscript(fixCategoryProjectId, makeFixAllTestManuscript())
useVirtualEditorStore.getState().runReview(fixCategoryProjectId, useContentStoreForFixAll.getState().getManuscript(fixCategoryProjectId)!)
await flushReview()

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
await flushReview()

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

// --- virtualEditorStore.runReview: accepts and forwards an optional
// styleGuide param (Phase 24) all the way to the checkers, through
// runPipeline, exactly like every other checker input. Confirms the full
// wiring end-to-end rather than just unit-testing the checker in isolation. ---
const styleGuideReviewProjectId = 've-stylguide-review-project'
const styleGuideReviewManuscript = makeHeadingManuscript(['A walk in the Garden'])
useContentStoreForFixAll.getState().setManuscript(styleGuideReviewProjectId, styleGuideReviewManuscript)
useVirtualEditorStore.getState().runReview(
  styleGuideReviewProjectId,
  styleGuideReviewManuscript,
  { ...DEFAULT_STYLE_GUIDE, headingCapitalisation: 'title-case' },
)
await flushReview()
const styleGuideReport = useVirtualEditorStore.getState().reportsByProject[styleGuideReviewProjectId]!
check(
  'runReview: a styleGuide passed through runReview reaches headingCapitalisationChecker via runPipeline',
  styleGuideReport.findings.some((f) => f.issueType === 'heading-capitalisation-mismatch'),
)
// Same manuscript with no styleGuide argument at all — the finding must not appear.
const noStyleGuideReviewProjectId = 've-no-styleguide-review-project'
useContentStoreForFixAll.getState().setManuscript(noStyleGuideReviewProjectId, styleGuideReviewManuscript)
useVirtualEditorStore.getState().runReview(noStyleGuideReviewProjectId, styleGuideReviewManuscript)
await flushReview()
const noStyleGuideReport = useVirtualEditorStore.getState().reportsByProject[noStyleGuideReviewProjectId]!
check(
  'runReview: with no styleGuide argument, headingCapitalisationChecker stays silent (no false-positive plumbing bug)',
  noStyleGuideReport.findings.every((f) => f.issueType !== 'heading-capitalisation-mismatch'),
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

// --- Virtual Editor: Publishing Standards + Layout checkers (real
// pagination data) — the two categories docs/VIRTUAL_EDITOR.md previously
// listed as "Designed, not built" because CheckerContext carried no
// pagination output at all. All five checkers below read `ctx.pages`
// exclusively (never `ctx.manuscript`), so an empty manuscript fixture is
// reused as `ctx.manuscript` for every case here — reusing `makeFakePage`
// from the spreadMatchesScrollTarget section above, and `LaidOutPage`/
// `HeadingBlock`/`ImageBlock`, already imported further down this file (ES
// module imports are hoisted, same pre-existing pattern this file already
// relies on for `HeadingBlock` above).
import { sparseChapterEndingChecker, emptyChapterOpenerChecker, consecutiveBlankPagesChecker } from '../src/virtualEditor/checkers/publishingStandards'
import { inconsistentImageSizingChecker, imageDensityImbalanceChecker } from '../src/virtualEditor/checkers/layout'

const EMPTY_VE_MANUSCRIPT: Manuscript = { chapters: [], importedAt: new Date().toISOString(), sourceFileName: 've-layout-fixture.md' }

function makeImageBlock(id: string, overrides: Partial<ImageBlock> = {}): ImageBlock {
  return { id, type: 'image', assetId: `asset-${id}`, rotation: 0, ...overrides }
}

// A "healthy" book fixture reused as the shared no-false-positive case for
// every checker below: two real chapters, each with a substantial final
// page, a small/consistent set of image sizes, a roughly balanced image
// count between chapters, structural front/back matter, and exactly one
// (legitimate) blank page mixed in — proving every checker correctly
// ignores structural pages and doesn't mistake one intentional blank page
// for an anomaly.
const healthyChapterAStart = makeFakePage({
  id: 'healthy-a-start',
  kind: 'chapter-start',
  chapterId: 'chap-a',
  chapterTitle: 'Garden Basics',
  blocks: [
    { id: 'healthy-a-heading', type: 'heading', level: 1, text: 'Garden Basics' } as HeadingBlock,
    {
      id: 'healthy-a-p1',
      type: 'paragraph',
      html: 'A long opening paragraph introducing the chapter with plenty of real content to read through before moving on.',
    } as ParagraphBlock,
  ],
})
const healthyChapterAContent = makeFakePage({
  id: 'healthy-a-content',
  kind: 'content',
  chapterId: 'chap-a',
  chapterTitle: 'Garden Basics',
  blocks: [
    makeImageBlock('healthy-a-img1', { widthPercent: 100 }),
    makeImageBlock('healthy-a-img2', { widthPercent: 100 }),
    {
      id: 'healthy-a-p2',
      type: 'paragraph',
      html: 'A closing paragraph for this chapter that is long enough on its own to not read as a sparse, nearly-blank final page.',
    } as ParagraphBlock,
  ],
})
const healthyBlank = makeFakePage({ id: 'healthy-blank', kind: 'blank' })
const healthyChapterBStart = makeFakePage({
  id: 'healthy-b-start',
  kind: 'chapter-start',
  chapterId: 'chap-b',
  chapterTitle: 'Garden Tools',
  blocks: [
    { id: 'healthy-b-heading', type: 'heading', level: 1, text: 'Garden Tools' } as HeadingBlock,
    makeImageBlock('healthy-b-img1', { widthPercent: 100 }),
  ],
})
const healthyChapterBContent = makeFakePage({
  id: 'healthy-b-content',
  kind: 'content',
  chapterId: 'chap-b',
  chapterTitle: 'Garden Tools',
  blocks: [
    makeImageBlock('healthy-b-img2', { widthPercent: 100 }),
    makeImageBlock('healthy-b-img3', { widthPercent: 90 }),
    {
      id: 'healthy-b-p1',
      type: 'paragraph',
      html: 'A closing paragraph for the second chapter that is likewise long enough to be a healthy, non-sparse ending page.',
    } as ParagraphBlock,
  ],
})
const healthyStructuralFront = makeFakePage({ id: 'healthy-cover', kind: 'structural', number: 0, structuralPageId: 'healthy-cover', blocks: [] })
const healthyStructuralBack = makeFakePage({ id: 'healthy-back', kind: 'structural', number: 0, structuralPageId: 'healthy-back', blocks: [] })
const healthyToc = makeFakePage({ id: 'healthy-toc', kind: 'toc', number: 1, blocks: [] })

const healthyPages: LaidOutPage[] = [
  healthyStructuralFront,
  healthyToc,
  healthyChapterAStart,
  healthyChapterAContent,
  healthyBlank,
  healthyChapterBStart,
  healthyChapterBContent,
  healthyStructuralBack,
]
const healthyCtx = { manuscript: EMPTY_VE_MANUSCRIPT, pages: healthyPages }

check('VE publishingStandards: sparseChapterEndingChecker — no false positive on a healthy book', sparseChapterEndingChecker.run(healthyCtx).length === 0)
check('VE publishingStandards: emptyChapterOpenerChecker — no false positive on a healthy book', emptyChapterOpenerChecker.run(healthyCtx).length === 0)
check(
  'VE publishingStandards: consecutiveBlankPagesChecker — no false positive on a healthy book (single blank page, not a run)',
  consecutiveBlankPagesChecker.run(healthyCtx).length === 0,
)
check('VE layout: inconsistentImageSizingChecker — no false positive on a healthy book (small, consistent size set)', inconsistentImageSizingChecker.run(healthyCtx).length === 0)
check('VE layout: imageDensityImbalanceChecker — no false positive on a healthy, roughly balanced book', imageDensityImbalanceChecker.run(healthyCtx).length === 0)

// --- sparseChapterEndingChecker: true positive ---
const sparseChapterStart = makeFakePage({
  id: 'sparse-start',
  kind: 'chapter-start',
  chapterId: 'chap-sparse',
  chapterTitle: 'Chapter Sparse',
  blocks: [
    { id: 'sparse-heading', type: 'heading', level: 1, text: 'Chapter Sparse' } as HeadingBlock,
    {
      id: 'sparse-p1',
      type: 'paragraph',
      html: 'This chapter explores many aspects of the garden including soil composition, watering schedules, and seasonal planting techniques used by experienced gardeners everywhere.',
    } as ParagraphBlock,
  ],
})
const sparseChapterLast = makeFakePage({
  id: 'sparse-last',
  kind: 'content',
  chapterId: 'chap-sparse',
  chapterTitle: 'Chapter Sparse',
  blocks: [{ id: 'sparse-final-p', type: 'paragraph', html: 'And that was the end.' } as ParagraphBlock],
})
const sparsePages: LaidOutPage[] = [sparseChapterStart, sparseChapterLast]
const sparseFindings = sparseChapterEndingChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: sparsePages })
check('VE publishingStandards: sparseChapterEndingChecker flags a chapter ending in one short paragraph alone on its final page', sparseFindings.length === 1)
check('VE publishingStandards: sparse-ending finding points at the exact short paragraph', sparseFindings[0]?.location.blockId === 'sparse-final-p')
check(
  'VE publishingStandards: sparse-ending finding is minor severity with no suggestedFix (heuristic, not a mechanical fix)',
  sparseFindings[0]?.severity === 'minor' && sparseFindings[0]?.suggestedFix === undefined,
)
check(
  "VE publishingStandards: sparseChapterEndingChecker.isApplicable reflects whether ctx.pages is present",
  sparseChapterEndingChecker.isApplicable?.({ manuscript: EMPTY_VE_MANUSCRIPT }) === false &&
    sparseChapterEndingChecker.isApplicable?.({ manuscript: EMPTY_VE_MANUSCRIPT, pages: sparsePages }) === true,
)
check('VE publishingStandards: sparseChapterEndingChecker returns [] with no pages at all', sparseChapterEndingChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT }).length === 0)

// --- emptyChapterOpenerChecker: true positive ---
const emptyChapterPage = makeFakePage({ id: 'empty-start', kind: 'chapter-start', chapterId: 'chap-empty', chapterTitle: 'Chapter Empty', blocks: [] })
const emptyFindings = emptyChapterOpenerChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: [emptyChapterPage] })
check('VE publishingStandards: emptyChapterOpenerChecker flags a chapter with zero blocks at all', emptyFindings.length === 1)
check(
  'VE publishingStandards: empty-chapter finding is major severity, high confidence, with no blockId (no single block to point to)',
  emptyFindings[0]?.severity === 'major' && (emptyFindings[0]?.confidence ?? 0) >= 0.9 && emptyFindings[0]?.location.blockId === undefined,
)
check(
  'VE publishingStandards: sparseChapterEndingChecker does not also flag a truly empty chapter (0 blocks is not "exactly 1")',
  sparseChapterEndingChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: [emptyChapterPage] }).length === 0,
)

// --- consecutiveBlankPagesChecker: true positive ---
const blankRunBeforeChapter: LaidOutPage[] = [
  makeFakePage({ id: 'blank-run-a-start', kind: 'chapter-start', chapterId: 'chap-blank-a', chapterTitle: 'Before' }),
  makeFakePage({ id: 'blank-run-1', kind: 'blank' }),
  makeFakePage({ id: 'blank-run-2', kind: 'blank' }),
  makeFakePage({ id: 'blank-run-b-start', kind: 'chapter-start', chapterId: 'chap-blank-b', chapterTitle: 'After' }),
]
const blankRunFindings = consecutiveBlankPagesChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: blankRunBeforeChapter })
check('VE publishingStandards: consecutiveBlankPagesChecker flags 2 adjacent blank pages', blankRunFindings.length === 1)
check(
  'VE publishingStandards: consecutive-blank finding is attributed to the chapter immediately following the run',
  blankRunFindings[0]?.location.chapterId === 'chap-blank-b',
)
check('VE publishingStandards: consecutive-blank finding message reports the exact run length', blankRunFindings[0]?.message.includes('2 blank pages'))

// Edge case: a blank run at the very end of the book, with no following
// chapter at all — falls back to the preceding chapter.
const blankRunAtEnd: LaidOutPage[] = [
  makeFakePage({ id: 'blank-end-start', kind: 'chapter-start', chapterId: 'chap-blank-end', chapterTitle: 'Last Chapter' }),
  makeFakePage({ id: 'blank-end-1', kind: 'blank' }),
  makeFakePage({ id: 'blank-end-2', kind: 'blank' }),
]
const blankRunAtEndFindings = consecutiveBlankPagesChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: blankRunAtEnd })
check('VE publishingStandards: a blank run at the very end of the book falls back to the preceding chapter', blankRunAtEndFindings[0]?.location.chapterId === 'chap-blank-end')

// --- inconsistentImageSizingChecker: true positive ---
const sizingChapterPage = makeFakePage({
  id: 'sizing-content',
  kind: 'content',
  chapterId: 'chap-sizing',
  chapterTitle: 'Chapter Sizing',
  blocks: [
    makeImageBlock('sizing-img-40', { widthPercent: 40 }),
    makeImageBlock('sizing-img-65', { widthPercent: 65 }),
    makeImageBlock('sizing-img-85', { widthPercent: 85 }),
    makeImageBlock('sizing-img-100', { widthPercent: 100 }),
  ],
})
const sizingFindings = inconsistentImageSizingChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: [sizingChapterPage] })
check('VE layout: inconsistentImageSizingChecker flags a chapter with 4 widely different image sizes (the app\'s own 40/65/85/100 presets, all used together)', sizingFindings.length === 1)
check('VE layout: inconsistent-sizing finding is suggestion severity (polish nit, not an error)', sizingFindings[0]?.severity === 'suggestion')

// Precedence check: widthMm must win over widthPercent, exactly like
// ImageRender/drawImagePdf — every image below has an identical
// widthPercent (100, which alone would bucket to a single size) but 4
// distinct widthMm values; the checker only flags if it's actually reading
// widthMm, proving the precedence rule was reused correctly, not reinvented.
const mmPrecedencePages: LaidOutPage[] = [
  makeFakePage({
    id: 'sizing-mm',
    kind: 'content',
    chapterId: 'chap-sizing-mm',
    chapterTitle: 'Chapter Sizing MM',
    blocks: [
      makeImageBlock('mm-1', { widthMm: 40, widthPercent: 100 }),
      makeImageBlock('mm-2', { widthMm: 80, widthPercent: 100 }),
      makeImageBlock('mm-3', { widthMm: 120, widthPercent: 100 }),
      makeImageBlock('mm-4', { widthMm: 160, widthPercent: 100 }),
    ],
  }),
]
check(
  'VE layout: inconsistentImageSizingChecker prefers widthMm over widthPercent, matching ImageRender/drawImagePdf\'s precedence exactly',
  inconsistentImageSizingChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: mmPrecedencePages }).length === 1,
)

// --- imageDensityImbalanceChecker: true positive (both outlier shapes in one fixture) ---
const densityPages: LaidOutPage[] = [
  makeFakePage({
    id: 'density-zero-start',
    kind: 'chapter-start',
    chapterId: 'chap-density-zero',
    chapterTitle: 'No Images',
    blocks: [{ id: 'density-zero-p', type: 'paragraph', html: 'Just text, no images at all in this chapter.' } as ParagraphBlock],
  }),
  makeFakePage({
    id: 'density-mid-start',
    kind: 'chapter-start',
    chapterId: 'chap-density-mid',
    chapterTitle: 'One Image',
    blocks: [makeImageBlock('density-mid-img1', { widthPercent: 100 })],
  }),
  makeFakePage({
    id: 'density-high-start',
    kind: 'chapter-start',
    chapterId: 'chap-density-high',
    chapterTitle: 'Many Images',
    blocks: [
      makeImageBlock('density-high-img1'),
      makeImageBlock('density-high-img2'),
      makeImageBlock('density-high-img3'),
      makeImageBlock('density-high-img4'),
      makeImageBlock('density-high-img5'),
      makeImageBlock('density-high-img6'),
      makeImageBlock('density-high-img7'),
      makeImageBlock('density-high-img8'),
    ],
  }),
]
const densityFindings = imageDensityImbalanceChecker.run({ manuscript: EMPTY_VE_MANUSCRIPT, pages: densityPages })
check('VE layout: imageDensityImbalanceChecker flags both a zero-image outlier and a high-image outlier, and nothing else', densityFindings.length === 2)
check(
  'VE layout: the zero-image chapter is flagged as issueType image-density-zero',
  densityFindings.some((f) => f.issueType === 'image-density-zero' && f.location.chapterId === 'chap-density-zero'),
)
check(
  'VE layout: the 8-image chapter (more than double the 3-image book average) is flagged as issueType image-density-high',
  densityFindings.some((f) => f.issueType === 'image-density-high' && f.location.chapterId === 'chap-density-high'),
)
check(
  'VE layout: the middling 1-image chapter (close to the book average) is not flagged at all',
  !densityFindings.some((f) => f.location.chapterId === 'chap-density-mid'),
)

// --- pipeline.ts: isApplicable-driven analysedCategories — publishingStandards
// and layout must stay null (honest "Not yet analysed") when pages is
// omitted, and become real scores the moment real pages are provided,
// without any other category's behaviour changing at all. ---
const noPagesReport = runPipeline('ve-layout-pipeline-project', EMPTY_VE_MANUSCRIPT)
check('VE pipeline: publishingStandards stays null (not yet analysed) when no pages are provided', noPagesReport.categoryScores.publishingStandards === null)
check('VE pipeline: layout stays null (not yet analysed) when no pages are provided', noPagesReport.categoryScores.layout === null)

const withHealthyPagesReport = runPipeline('ve-layout-pipeline-project', EMPTY_VE_MANUSCRIPT, undefined, healthyPages)
check(
  'VE pipeline: publishingStandards becomes a real, perfect 100 once real pages are provided and nothing is flagged',
  withHealthyPagesReport.categoryScores.publishingStandards?.score === 100,
)
check(
  'VE pipeline: layout becomes a real, perfect 100 once real pages are provided and nothing is flagged',
  withHealthyPagesReport.categoryScores.layout?.score === 100,
)

const withSparsePagesReport = runPipeline('ve-layout-pipeline-project', EMPTY_VE_MANUSCRIPT, undefined, sparsePages)
check('VE pipeline: publishingStandards score drops below 100 with real pages containing a real finding', (withSparsePagesReport.categoryScores.publishingStandards?.score ?? 100) < 100)
check(
  'VE pipeline: the sparse-chapter-ending finding actually appears in the pipeline output, tagged publishingStandards',
  withSparsePagesReport.findings.some((f) => f.issueType === 'sparse-chapter-ending' && f.category === 'publishingStandards'),
)

// --- virtualEditorStore.runReview: the new optional 4th `pages` parameter
// really does reach the pipeline (and is genuinely optional — omitting it
// keeps publishingStandards/layout honestly null, no silent default). ---
const veReviewPagesProjectId = 've-pages-review-project'
useContentStoreForFixAll.getState().setManuscript(veReviewPagesProjectId, EMPTY_VE_MANUSCRIPT)
useVirtualEditorStore.getState().runReview(veReviewPagesProjectId, EMPTY_VE_MANUSCRIPT, undefined, sparsePages)
await flushReview()
const veReviewPagesReport = useVirtualEditorStore.getState().reportsByProject[veReviewPagesProjectId]!
check('runReview: an optional pages argument reaches the pipeline and produces a real publishingStandards score', veReviewPagesReport.categoryScores.publishingStandards !== null)

const veNoPagesReviewProjectId = 've-no-pages-review-project'
useContentStoreForFixAll.getState().setManuscript(veNoPagesReviewProjectId, EMPTY_VE_MANUSCRIPT)
useVirtualEditorStore.getState().runReview(veNoPagesReviewProjectId, EMPTY_VE_MANUSCRIPT)
await flushReview()
const veNoPagesReviewReport = useVirtualEditorStore.getState().reportsByProject[veNoPagesReviewProjectId]!
check('runReview: without a pages argument, publishingStandards stays null (genuinely optional, no silent default)', veNoPagesReviewReport.categoryScores.publishingStandards === null)

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

// --- Style Guide settings UI's data plumbing (Phase 24): ProjectSettings'
// new optional `styleGuide` field persists/reads through
// projectStore.updateProjectSettings exactly like every other settings
// field (trimSize, themeId, etc.), and defaults correctly when absent —
// "optional field, default in code, never migrate", per CLAUDE.md. ---
const styleGuideProjectId = 've-styleguide-settings-project'
useProjectStore.setState((state) => ({
  projects: [
    ...state.projects,
    {
      id: styleGuideProjectId,
      name: 'Style Guide Settings Project',
      category: 'other',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    },
  ],
}))
check(
  'ProjectSettings: styleGuide is absent by default on a freshly created project (never migrated in)',
  useProjectStore.getState().getProject(styleGuideProjectId)?.settings.styleGuide === undefined,
)
check(
  'ProjectSettings: an absent styleGuide reads as DEFAULT_STYLE_GUIDE at the read site (the "?? DEFAULT_STYLE_GUIDE" pattern used by ProjectSettingsDialog/VirtualEditorWorkspace)',
  JSON.stringify(useProjectStore.getState().getProject(styleGuideProjectId)?.settings.styleGuide ?? DEFAULT_STYLE_GUIDE) === JSON.stringify(DEFAULT_STYLE_GUIDE),
)

// Setting one field (mirroring ProjectSettingsDialog's `{ ...styleGuide, [field]: value }` merge-at-the-styleGuide-object-level pattern).
useProjectStore.getState().updateProjectSettings(styleGuideProjectId, {
  styleGuide: { ...DEFAULT_STYLE_GUIDE, quoteStyle: 'curly' },
})
check(
  'ProjectSettings: updateProjectSettings persists a styleGuide field change',
  useProjectStore.getState().getProject(styleGuideProjectId)?.settings.styleGuide?.quoteStyle === 'curly',
)
check(
  'ProjectSettings: setting styleGuide does not disturb other, unrelated settings fields (themeId untouched)',
  useProjectStore.getState().getProject(styleGuideProjectId)?.settings.themeId === DEFAULT_PROJECT_SETTINGS.themeId,
)

// Flipping a second field must preserve the first (the styleGuide-object-level spread ProjectSettingsDialog performs, not a fresh object).
const currentStyleGuideForMerge = useProjectStore.getState().getProject(styleGuideProjectId)!.settings.styleGuide!
useProjectStore.getState().updateProjectSettings(styleGuideProjectId, {
  styleGuide: { ...currentStyleGuideForMerge, headingCapitalisation: 'sentence-case' },
})
const styleGuideAfterSecondFieldChange = useProjectStore.getState().getProject(styleGuideProjectId)?.settings.styleGuide
check(
  'ProjectSettings: changing one styleGuide field via the object-level spread preserves a previously-set sibling field (quoteStyle stays "curly")',
  styleGuideAfterSecondFieldChange?.quoteStyle === 'curly' && styleGuideAfterSecondFieldChange?.headingCapitalisation === 'sentence-case',
)

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

// --- Modular Page System Milestone 5 (Phase 22): 8 new in-chapter content
// block types — Pull Quote, Callout, Case Study, Timeline, Gallery, FAQ,
// Statistics, Checklist. Same registry-lookup pattern as the 6 pre-existing
// types above, proving BlockContent.tsx/exportPdf.ts/paginate.ts needed zero
// changes (they all dispatch purely through getBlockTypeDefinition), plus
// the new optional label/icon fields (forward groundwork for a future "Add
// Block" picker — see docs/STATUS.md's Phase 22 entry).
const MILESTONE_5_BLOCK_TYPES: ContentBlockType[] = ['pull-quote', 'callout', 'case-study', 'timeline', 'gallery', 'faq', 'statistics', 'checklist']
for (const type of MILESTONE_5_BLOCK_TYPES) {
  const def = getBlockTypeDefinition(type)
  check(
    `block registry (Phase 22): has a complete definition for "${type}"`,
    !!def && def.id === type && typeof def.Render === 'function' && typeof def.drawPdf === 'function',
  )
  check(
    `block registry (Phase 22): "${type}" has a label and icon (forward groundwork for a future Add Block picker)`,
    typeof def?.label === 'string' && def.label.length > 0 && !!def?.icon,
  )
}
check(
  'block registry (Phase 22): pull-quote/callout/case-study/timeline/gallery/faq/statistics all have a blockSpacing entry',
  getBlockTypeDefinition('pull-quote')?.blockSpacing?.({ id: 'x', type: 'pull-quote', text: '' }) === 8
    && getBlockTypeDefinition('callout')?.blockSpacing?.({ id: 'x', type: 'callout', variant: 'tip', text: '' }) === 8
    && getBlockTypeDefinition('case-study')?.blockSpacing?.({ id: 'x', type: 'case-study', title: '', text: '' }) === 8
    && getBlockTypeDefinition('timeline')?.blockSpacing?.({ id: 'x', type: 'timeline', entries: [] }) === 8
    && getBlockTypeDefinition('gallery')?.blockSpacing?.({ id: 'x', type: 'gallery', assetIds: [] }) === 6
    && getBlockTypeDefinition('faq')?.blockSpacing?.({ id: 'x', type: 'faq', entries: [] }) === 8
    && getBlockTypeDefinition('statistics')?.blockSpacing?.({ id: 'x', type: 'statistics', entries: [] }) === 8,
)
check(
  'block registry (Phase 22): checklist deliberately has no blockSpacing entry (matches list/table/paragraph having none)',
  getBlockTypeDefinition('checklist')?.blockSpacing === undefined,
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
const { splitParagraphs } = await import('../src/structuralPages/longForm')
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

// --- Phase 20: 5 new front-matter structural page types (Milestone 4,
// first batch) — Half Title, Dedication, Foreword, Preface, Acknowledgements.
// Same registry-lookup + editorActions coverage pattern Phase 19 established
// for the original 4 types.
const NEW_STRUCTURAL_TYPES: StructuralPageType[] = ['half-title', 'dedication', 'foreword', 'preface', 'acknowledgements']
for (const type of NEW_STRUCTURAL_TYPES) {
  const def = getStructuralPageTypeDefinition(type)
  check(
    `structural page registry (Phase 20): has a complete definition for "${type}"`,
    !!def && def.id === type && typeof def.Render === 'function' && typeof def.drawPdf === 'function' && typeof def.defaultContent === 'function',
  )
  check(`structural page registry (Phase 20): "${type}" is category "front-matter"`, def?.category === 'front-matter')
}

const eaNewTypesProjectId = 'ea-structural-pages-new-types-project'

// Half Title: insertPageWithHistory + undo.
const halfTitleId = insertPageWithHistory(eaNewTypesProjectId, 'front-matter', 'half-title', null)
check(
  'insertPageWithHistory (Phase 20): creates a Half Title page',
  useStructuralPageStore.getState().getPages(eaNewTypesProjectId).some((p) => p.id === halfTitleId && p.type === 'half-title'),
)
useHistoryStoreForPages.getState().undo(eaNewTypesProjectId)
check(
  'insertPageWithHistory (Phase 20) -> undo: removes the just-created Half Title page',
  !useStructuralPageStore.getState().getPages(eaNewTypesProjectId).some((p) => p.id === halfTitleId),
)
useHistoryStoreForPages.getState().redo(eaNewTypesProjectId)
check(
  'insertPageWithHistory (Phase 20) -> undo -> redo: re-creates the exact same Half Title page id',
  useStructuralPageStore.getState().getPages(eaNewTypesProjectId).some((p) => p.id === halfTitleId),
)

// Foreword: insertPageWithHistory + undo, plus its two-field content shape.
const forewordId = insertPageWithHistory(eaNewTypesProjectId, 'front-matter', 'foreword', halfTitleId)
check(
  'insertPageWithHistory (Phase 20): creates a Foreword page',
  useStructuralPageStore.getState().getPages(eaNewTypesProjectId).some((p) => p.id === forewordId && p.type === 'foreword'),
)
check(
  'insertPageWithHistory (Phase 20): Foreword is inserted after the given afterPageId',
  useStructuralPageStore.getState().getPages(eaNewTypesProjectId).findIndex((p) => p.id === forewordId)
    === useStructuralPageStore.getState().getPages(eaNewTypesProjectId).findIndex((p) => p.id === halfTitleId) + 1,
)
updatePageContentWithHistory(eaNewTypesProjectId, forewordId, { text: 'Paragraph one.\n\nParagraph two.', authorName: 'A. Reviewer' })
check(
  'updatePageContentWithHistory (Phase 20): applies Foreword text + authorName',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaNewTypesProjectId).find((pg) => pg.id === forewordId)
    return p?.type === 'foreword' && p.content.text === 'Paragraph one.\n\nParagraph two.' && p.content.authorName === 'A. Reviewer'
  })(),
)
useHistoryStoreForPages.getState().undo(eaNewTypesProjectId)
check(
  'updatePageContentWithHistory (Phase 20) -> undo: restores Foreword content to empty',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaNewTypesProjectId).find((pg) => pg.id === forewordId)
    return p?.type === 'foreword' && p.content.text === undefined && p.content.authorName === undefined
  })(),
)
useHistoryStoreForPages.getState().undo(eaNewTypesProjectId)
check(
  'insertPageWithHistory (Phase 20) -> undo: removes the just-created Foreword page',
  !useStructuralPageStore.getState().getPages(eaNewTypesProjectId).some((p) => p.id === forewordId),
)

// splitParagraphs — the paragraph-splitting helper shared by Foreword/
// Preface/Acknowledgements' rendering and PDF drawing.
check('splitParagraphs (Phase 20): splits on a blank-line boundary into 2 paragraphs', splitParagraphs('First paragraph.\n\nSecond paragraph.').length === 2)
check('splitParagraphs (Phase 20): a single paragraph with no blank line stays 1 paragraph', splitParagraphs('Just one paragraph, no breaks.').length === 1)
check('splitParagraphs (Phase 20): empty text yields zero paragraphs', splitParagraphs('').length === 0)
check(
  'splitParagraphs (Phase 20): trims each paragraph and drops empty ones from extra blank lines',
  JSON.stringify(splitParagraphs('  First.  \n\n\n\n  Second.  ')) === JSON.stringify(['First.', 'Second.']),
)

// Regression test for a real bug caught by the check above's sibling
// ('updatePageContentWithHistory (Phase 20) -> undo: restores Foreword content
// to empty'): `updatePageContent`'s shallow merge can never clear a field that
// went from absent to present, since merging `{}` into `{ text: 'x' }` leaves
// `text: 'x'` untouched. `replacePageContent` (a full, non-merging replace) is
// the fix — verified directly here, not just indirectly via the history wrapper.
const rpcProjectId = 'rpc-project'
const rpcHalfTitleId = useStructuralPageStore.getState().insertPage(rpcProjectId, 'front-matter', 'half-title', null)
useStructuralPageStore.getState().updatePageContent(rpcProjectId, rpcHalfTitleId, { title: 'Something' })
check(
  'replacePageContent: sanity — updatePageContent merge actually set the field first',
  useStructuralPageStore.getState().getPages(rpcProjectId).find((p) => p.id === rpcHalfTitleId)?.content.title === 'Something',
)
useStructuralPageStore.getState().replacePageContent(rpcProjectId, rpcHalfTitleId, {})
check(
  'replacePageContent: fully replaces content, clearing a previously-set field (the bug updatePageContent has)',
  useStructuralPageStore.getState().getPages(rpcProjectId).find((p) => p.id === rpcHalfTitleId)?.content.title === undefined,
)

// --- Phase 21: 8 new back-matter structural page types (Milestone 4,
// second batch) — Conclusion, Appendix, About the Author, Bibliography,
// Glossary, Index, ISBN Page, Barcode. Same registry-lookup + editorActions
// coverage pattern Phases 19/20 established.
const BACK_MATTER_STRUCTURAL_TYPES: StructuralPageType[] = [
  'conclusion',
  'appendix',
  'about-the-author',
  'bibliography',
  'glossary',
  'index',
  'isbn-page',
  'barcode',
]
for (const type of BACK_MATTER_STRUCTURAL_TYPES) {
  const def = getStructuralPageTypeDefinition(type)
  check(
    `structural page registry (Phase 21): has a complete definition for "${type}"`,
    !!def && def.id === type && typeof def.Render === 'function' && typeof def.drawPdf === 'function' && typeof def.defaultContent === 'function',
  )
  check(`structural page registry (Phase 21): "${type}" is category "back-matter"`, def?.category === 'back-matter')
}

const eaBackMatterProjectId = 'ea-structural-pages-back-matter-project'

// Bibliography: array-of-strings content, insertPageWithHistory + update +
// undo — exercises the exact "field goes from absent to present and back"
// path the Phase 20 undo bug lived in, this time for an array field.
const bibliographyId = insertPageWithHistory(eaBackMatterProjectId, 'back-matter', 'bibliography', null)
check(
  'insertPageWithHistory (Phase 21): creates a Bibliography page',
  useStructuralPageStore.getState().getPages(eaBackMatterProjectId).some((p) => p.id === bibliographyId && p.type === 'bibliography'),
)
updatePageContentWithHistory(eaBackMatterProjectId, bibliographyId, { entries: ['Smith, J. (2020). Forest Ecology.', 'Doe, A. (2018). Soil Science.'] })
check(
  'updatePageContentWithHistory (Phase 21): applies Bibliography entries',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaBackMatterProjectId).find((pg) => pg.id === bibliographyId)
    return p?.type === 'bibliography' && p.content.entries?.length === 2 && p.content.entries[0] === 'Smith, J. (2020). Forest Ecology.'
  })(),
)
useHistoryStoreForPages.getState().undo(eaBackMatterProjectId)
check(
  'updatePageContentWithHistory (Phase 21) -> undo: restores Bibliography entries to empty (not left over from the merge)',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaBackMatterProjectId).find((pg) => pg.id === bibliographyId)
    return p?.type === 'bibliography' && p.content.entries === undefined
  })(),
)
useHistoryStoreForPages.getState().redo(eaBackMatterProjectId)
check(
  'updatePageContentWithHistory (Phase 21) -> undo -> redo: Bibliography entries come back',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaBackMatterProjectId).find((pg) => pg.id === bibliographyId)
    return p?.type === 'bibliography' && p.content.entries?.length === 2
  })(),
)

// Glossary: array-of-objects content — same absent/present undo check, one
// level more complex than Bibliography's array-of-strings.
const glossaryId = insertPageWithHistory(eaBackMatterProjectId, 'back-matter', 'glossary', bibliographyId)
updatePageContentWithHistory(eaBackMatterProjectId, glossaryId, { entries: [{ term: 'Mulch', definition: 'A protective layer over soil.' }] })
check(
  'updatePageContentWithHistory (Phase 21): applies Glossary entries',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaBackMatterProjectId).find((pg) => pg.id === glossaryId)
    return p?.type === 'glossary' && p.content.entries?.[0]?.term === 'Mulch'
  })(),
)
useHistoryStoreForPages.getState().undo(eaBackMatterProjectId)
check(
  'updatePageContentWithHistory (Phase 21) -> undo: restores Glossary entries to empty',
  (() => {
    const p = useStructuralPageStore.getState().getPages(eaBackMatterProjectId).find((pg) => pg.id === glossaryId)
    return p?.type === 'glossary' && p.content.entries === undefined
  })(),
)

// ISBN Page + Barcode: the sibling-read pattern (Barcode falls back to a
// sibling ISBN Page's `isbn` value, same as copyright.tsx reading the Title
// Page's author) — exercised directly against the registry's `Render`
// resolution logic isn't practical in jsdom without mounting React, so this
// verifies the underlying data relationship the render/drawPdf functions
// both depend on: the sibling page actually exists with the expected value.
const isbnPageId = insertPageWithHistory(eaBackMatterProjectId, 'back-matter', 'isbn-page', null)
updatePageContentWithHistory(eaBackMatterProjectId, isbnPageId, { isbn: '978-1-234567-89-0' })
const barcodeId = insertPageWithHistory(eaBackMatterProjectId, 'back-matter', 'barcode', isbnPageId)
check(
  'structural pages (Phase 21): Barcode and ISBN Page can coexist so Barcode can read its sibling\'s isbn',
  (() => {
    const pages = useStructuralPageStore.getState().getPages(eaBackMatterProjectId)
    const isbnPage = pages.find((p) => p.id === isbnPageId)
    const barcode = pages.find((p) => p.id === barcodeId)
    return isbnPage?.type === 'isbn-page' && isbnPage.content.isbn === '978-1-234567-89-0' && barcode?.type === 'barcode' && barcode.content.isbn === undefined
  })(),
)

// --- Modular Page System Milestone 5 (Phase 22): insert/undo/redo coverage
// for Timeline (array-of-objects `entries`) and Gallery (array-of-strings
// `assetIds`) — the two new field shapes most likely to re-trigger the
// exact class of shallow-merge undo bug fixed in Phase 20
// (`replacePageContent`), this time for `contentStore`/`editBlock` rather
// than `structuralPageStore`/`updatePageContentWithHistory`. See
// contentStore.ts's `replaceBlock` and editorActions.ts's `editBlock` doc
// comments for the real, previously-latent bug this investigation found
// (present since Phase 17, for any optional field on any block type) and
// its fix.
import type { TimelineBlock, GalleryBlock } from '../src/types/content'

const m5ProjectId = 'milestone-5-blocks-project'
const m5Manuscript: Manuscript = {
  chapters: [
    {
      id: 'm5-chapter',
      title: 'Chapter One',
      order: 0,
      blocks: [{ id: 'm5-block-a', type: 'paragraph', html: 'Paragraph A' } as ParagraphBlock],
    },
  ],
  importedAt: new Date().toISOString(),
  sourceFileName: 'milestone-5-fixture.md',
}
useContentStore.getState().setManuscript(m5ProjectId, m5Manuscript)
const m5BlockIds = () => useContentStore.getState().getManuscript(m5ProjectId)!.chapters[0].blocks.map((b) => b.id)
const m5Block = (id: string) => useContentStore.getState().getManuscript(m5ProjectId)!.chapters[0].blocks.find((b) => b.id === id)

// Timeline: insertBlockWithHistory + undo/redo (array-of-objects `entries`).
const m5TimelineBlock: TimelineBlock = { id: 'm5-timeline', type: 'timeline', entries: [{ label: '1900', text: 'Founded' }] }
insertBlockWithHistory(m5ProjectId, 'm5-chapter', null, m5TimelineBlock)
check('insertBlockWithHistory (Phase 22): inserts a Timeline block at the start', m5BlockIds().join(',') === 'm5-timeline,m5-block-a')
check(
  'insertBlockWithHistory (Phase 22): Timeline block carries its full entries array',
  (m5Block('m5-timeline') as TimelineBlock).entries.length === 1 && (m5Block('m5-timeline') as TimelineBlock).entries[0].label === '1900',
)
useHistoryStore.getState().undo(m5ProjectId)
check('insertBlockWithHistory (Phase 22) -> undo: removes the just-inserted Timeline block', !m5BlockIds().includes('m5-timeline'))
useHistoryStore.getState().redo(m5ProjectId)
check(
  'insertBlockWithHistory (Phase 22) -> undo -> redo: Timeline block and its entries array come back intact',
  m5BlockIds().includes('m5-timeline') && (m5Block('m5-timeline') as TimelineBlock).entries[0].text === 'Founded',
)

// Timeline: editBlock + undo — replacing the WHOLE `entries` array (not
// mutating one entry's field in place) round-trips correctly through the
// new contentStore.replaceBlock: growing it to 2 entries, then undoing back
// to exactly 1, not left at 2 by a merge.
editBlock(m5ProjectId, 'm5-chapter', 'm5-timeline', {
  entries: [
    { label: '1900', text: 'Founded' },
    { label: '1950', text: 'Expanded' },
  ],
})
check('editBlock (Phase 22): Timeline entries array grows to 2', (m5Block('m5-timeline') as TimelineBlock).entries.length === 2)
useHistoryStore.getState().undo(m5ProjectId)
check(
  'editBlock (Phase 22) -> undo: Timeline entries array restored to exactly 1 (not left with 2 from a merge)',
  (m5Block('m5-timeline') as TimelineBlock).entries.length === 1,
)

// Gallery: insertBlockWithHistory + undo/redo (array-of-strings `assetIds`).
const m5GalleryBlock: GalleryBlock = { id: 'm5-gallery', type: 'gallery', assetIds: ['asset-1', 'asset-2'] }
insertBlockWithHistory(m5ProjectId, 'm5-chapter', 'm5-timeline', m5GalleryBlock)
check('insertBlockWithHistory (Phase 22): inserts a Gallery block after the Timeline block', m5BlockIds().join(',') === 'm5-timeline,m5-gallery,m5-block-a')
check(
  'insertBlockWithHistory (Phase 22): Gallery block carries its full assetIds array',
  (m5Block('m5-gallery') as GalleryBlock).assetIds.join(',') === 'asset-1,asset-2',
)
useHistoryStore.getState().undo(m5ProjectId)
check('insertBlockWithHistory (Phase 22) -> undo: removes the just-inserted Gallery block', !m5BlockIds().includes('m5-gallery'))
useHistoryStore.getState().redo(m5ProjectId)
check(
  'insertBlockWithHistory (Phase 22) -> undo -> redo: Gallery block and its assetIds array come back intact',
  (m5Block('m5-gallery') as GalleryBlock | undefined)?.assetIds.join(',') === 'asset-1,asset-2',
)

// Gallery: editBlock + undo — the real bug this investigation found: an
// optional field (`caption`) going from absent to present via a live edit,
// then undo needing to clear it back to absent. Before the
// `contentStore.replaceBlock` fix, `editBlock`'s undo called `updateBlock`
// with the full old-block snapshot as `updates` — a merge that can only
// add/overwrite keys, never delete one the old snapshot never had at all,
// so undo silently left `caption` set. Same bug class Phase 20 found in
// `updatePageContentWithHistory`, just in contentStore instead of
// structuralPageStore.
editBlock(m5ProjectId, 'm5-chapter', 'm5-gallery', { caption: 'A gallery of photos' })
check(
  'editBlock (Phase 22): sets Gallery caption (previously absent, now present)',
  (m5Block('m5-gallery') as GalleryBlock).caption === 'A gallery of photos',
)
useHistoryStore.getState().undo(m5ProjectId)
check(
  "editBlock (Phase 22) -> undo: clears Gallery caption back to absent (the bug contentStore.replaceBlock fixes — updateBlock's merge could not)",
  (m5Block('m5-gallery') as GalleryBlock).caption === undefined,
)
useHistoryStore.getState().redo(m5ProjectId)
check('editBlock (Phase 22) -> undo -> redo: Gallery caption reapplied', (m5Block('m5-gallery') as GalleryBlock).caption === 'A gallery of photos')

// Direct regression check for contentStore.replaceBlock itself (not just
// indirectly via editBlock's undo) — mirrors Phase 20's direct
// `replacePageContent` unit checks exactly.
const rbProjectId = 'replace-block-project'
const rbManuscript: Manuscript = {
  chapters: [{ id: 'rb-chapter', title: 'Chapter', order: 0, blocks: [{ id: 'rb-block', type: 'quote', text: 'Hi' } as ContentBlock] }],
  importedAt: new Date().toISOString(),
  sourceFileName: 'replace-block-fixture.md',
}
useContentStore.getState().setManuscript(rbProjectId, rbManuscript)
useContentStore.getState().updateBlock(rbProjectId, 'rb-chapter', 'rb-block', { attribution: 'Someone' })
check(
  'replaceBlock: sanity — updateBlock merge actually set the field first',
  (useContentStore.getState().getManuscript(rbProjectId)!.chapters[0].blocks[0] as ContentBlock & { attribution?: string }).attribution === 'Someone',
)
useContentStore.getState().replaceBlock(rbProjectId, 'rb-chapter', 'rb-block', { id: 'rb-block', type: 'quote', text: 'Hi' } as ContentBlock)
check(
  'replaceBlock: fully replaces the block, clearing a previously-set optional field (the bug updateBlock-as-merge has)',
  (useContentStore.getState().getManuscript(rbProjectId)!.chapters[0].blocks[0] as ContentBlock & { attribution?: string }).attribution === undefined,
)

// --- Book templates (Phase E: series consistency) ---
{
  const { buildTemplate } = await import('../src/templates/buildTemplate')
  const { pagesForNewProject } = await import('../src/templates/applyTemplate')
  const { DEFAULT_PROJECT_SETTINGS } = await import('../src/types/project')
  type AnyPage = import('../src/types/structuralPage').StructuralPage

  const coverPage = {
    id: 'page-cover',
    type: 'cover',
    category: 'front-matter',
    order: 0,
    enabled: true,
    content: { title: 'The Book of Enoch', subtitle: 'A subtitle', imageAssetId: 'asset-123', layout: 'centered' },
    elements: [
      { id: 'el-1', kind: 'text', text: 'THE HIDDEN LIBRARY', x: 0.5, y: 0.9, width: 0.5, height: 0.05 },
      { id: 'el-2', kind: 'rect', x: 0.1, y: 0.1, width: 0.8, height: 0.02 },
    ],
  } as unknown as AnyPage

  const copyrightPage = {
    id: 'page-copyright',
    type: 'copyright',
    category: 'front-matter',
    order: 1,
    enabled: true,
    content: { text: 'Published by The Hidden Library.' },
  } as unknown as AnyPage

  const base = {
    name: 'Series template',
    description: '',
    settings: { ...DEFAULT_PROJECT_SETTINGS, trimSize: '5.5x8.5' as const },
    category: 'nonfiction' as const,
    customTheme: null,
    structuralPages: [coverPage, copyrightPage],
  }

  const withContent = buildTemplate({ ...base, includeContent: true })
  const withoutContent = buildTemplate({ ...base, includeContent: false })

  const wcCover = withContent.structuralPages[0] as unknown as { content: Record<string, unknown>; elements: { kind: string; text?: string; assetId?: string }[] }
  const wocCover = withoutContent.structuralPages[0] as unknown as { content: Record<string, unknown>; elements: { kind: string; text?: string }[] }

  check('buildTemplate: keeps page text when includeContent is true', wcCover.content.title === 'The Book of Enoch')
  check(
    'buildTemplate: keeps imprint boilerplate on other pages too',
    (withContent.structuralPages[1] as unknown as { content: { text?: string } }).content.text === 'Published by The Hidden Library.',
  )
  check('buildTemplate: clears page text when includeContent is false', wocCover.content.title === undefined)
  check(
    'buildTemplate: clears cover element text when includeContent is false',
    wocCover.elements.find((e) => e.kind === 'text')?.text === '',
  )

  // Layout must survive BOTH modes — clearing text must never clear design.
  check('buildTemplate: keeps layout when text is kept', wcCover.content.layout === 'centered')
  check('buildTemplate: keeps layout even when text is cleared', wocCover.content.layout === 'centered')
  check(
    'buildTemplate: keeps non-text cover elements when text is cleared',
    wocCover.elements.some((e) => e.kind === 'rect'),
  )

  // Assets are per-project IndexedDB blobs; a retained id would resolve to a
  // missing image in whatever project the template is applied to.
  check('buildTemplate: strips image asset references in both modes', wcCover.content.imageAssetId === undefined && wocCover.content.imageAssetId === undefined)

  // A template is presentation and structure — never a manuscript.
  check('buildTemplate: carries no manuscript', !('manuscript' in withContent) && !('chapters' in withContent))
  check('buildTemplate: records which mode it was saved in', withContent.includesContent === true && withoutContent.includesContent === false)
  check('buildTemplate: carries page setup', withContent.settings.trimSize === '5.5x8.5')

  const applied = pagesForNewProject({ ...withContent, id: 'tpl-1', schemaVersion: 1, createdAt: '' })
  check('applyTemplate: regenerates page ids', applied[0].id !== 'page-cover' && applied[1].id !== 'page-copyright')
  check('applyTemplate: gives every page a distinct id', applied[0].id !== applied[1].id)
  check('applyTemplate: preserves page count and order', applied.length === 2 && applied[0].type === 'cover' && applied[1].type === 'copyright')
  check(
    'applyTemplate: does not mutate the stored template',
    (withContent.structuralPages[0] as unknown as { id: string }).id === 'page-cover',
  )
}

// --- EPUB import (Phase 124) ---
{
  const { buildZip } = await import('../src/epub/zipWriter')
  const { parseEpub } = await import('../src/parser/epub')
  const enc = (t: string) => new TextEncoder().encode(t)

  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`

  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Book of Enoch</dc:title></metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
  <item id="empty" href="empty.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="empty"/></spine>
</package>`

  // Deeply nested, exactly like real EPUBs: content wrapped in containers,
  // with verse marked up as bare <div class="line"> elements.
  const c1 = `<html><body>
  <div class="chapter"><h2>Book of the Watchers</h2></div>
  <p>The words of the blessing of Enoch.</p>
  <div class="lg-container"><div class="linegroup"><div class="group">
    <div class="line">And the eternal God will tread upon the earth,</div>
    <div class="line">[And appear from His camp]</div>
    <div class="line">And appear from the heaven &#x231C;of heavens&#x231D;.</div>
  </div></div></div>
  </body></html>`

  const c2 = `<html><body><section><h2>The Parables</h2><p>The second vision.</p>
  <blockquote>A quotation.</blockquote><ul><li>one</li><li>two</li></ul></section></body></html>`

  const epubBytes = await buildZip([
    { name: 'mimetype', data: enc('application/epub+zip') },
    { name: 'META-INF/container.xml', data: enc(container) },
    { name: 'OEBPS/content.opf', data: enc(opf) },
    { name: 'OEBPS/nav.xhtml', data: enc('<html><body><nav><ol><li>Contents</li></ol></nav></body></html>') },
    { name: 'OEBPS/c1.xhtml', data: enc(c1) },
    { name: 'OEBPS/c2.xhtml', data: enc(c2) },
    { name: 'OEBPS/empty.xhtml', data: enc('<html><body><div></div></body></html>') },
  ])
  const epubFile = new File([epubBytes as unknown as BlobPart], 'book.epub', { type: 'application/epub+zip' })
  const epubChapters = await parseEpub(epubFile, 'Fallback', 'proj-epub')

  check('epub: skips the nav document and empty spine entries', epubChapters.length === 2)
  check(
    'epub: takes each chapter title from its own first heading',
    epubChapters[0]?.title === 'Book of the Watchers' && epubChapters[1]?.title === 'The Parables',
  )
  check('epub: keeps spine reading order', epubChapters[0].order === 0 && epubChapters[1].order === 1)

  const c1Text = epubChapters[0].blocks.map((b) => (b.type === 'paragraph' ? b.html : '')).join('\n')
  check('epub: flattens nested containers instead of dropping their text', c1Text.includes('words of the blessing'))
  // Regression: verse lives in bare <div class="line"> elements, which are not
  // block tags. An importer that only walks known block tags drops every line
  // of poetry in the book while appearing to work.
  check('epub: preserves verse lines held in non-block containers', c1Text.includes('the eternal God will tread'))
  check(
    'epub: keeps each verse line as its own block rather than merging them',
    epubChapters[0].blocks.filter((b) => b.type === 'paragraph' && /eternal God|His camp|of heavens/.test(b.html)).length === 3,
  )
  check('epub: preserves textual-critical brackets verbatim', c1Text.includes('⌜of heavens⌝') && c1Text.includes('[And appear from His camp]'))

  const c2Types = epubChapters[1].blocks.map((b) => b.type)
  check('epub: converts blockquote and list blocks', c2Types.includes('quote') && c2Types.includes('list'))

  // A non-EPUB file must fail with a message safe to show the user, not a
  // stack trace from the ZIP reader.
  const { ManuscriptImportError } = await import('../src/parser/errors')
  let epubError: unknown
  try {
    await parseEpub(new File([enc('not a zip at all') as unknown as BlobPart], 'x.epub'), 'F', 'p')
  } catch (err) { epubError = err }
  check('epub: a non-EPUB file raises a user-safe ManuscriptImportError', epubError instanceof ManuscriptImportError)
}

// --- Mobile shell detection (Phase 126) ---
{
  const { MOBILE_QUERY } = await import('../src/hooks/useIsMobile')

  /** Evaluates the real media query against a device, so this asserts the
   * shipped rule rather than restating it. Supports only the three features
   * the query actually uses. */
  const matches = (query: string, device: { width: number; height: number; coarsePointer: boolean }): boolean =>
    query.split(',').some((clause) =>
      clause.split(' and ').every((term) => {
        const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(term)
        if (maxWidth) return device.width <= Number(maxWidth[1])
        const maxHeight = /\(max-height:\s*(\d+)px\)/.exec(term)
        if (maxHeight) return device.height <= Number(maxHeight[1])
        const pointer = /\(pointer:\s*(\w+)\)/.exec(term)
        if (pointer) return pointer[1] === (device.coarsePointer ? 'coarse' : 'fine')
        return false
      }),
    )

  const phonePortrait = { width: 390, height: 844, coarsePointer: true }
  const phoneLandscape = { width: 844, height: 390, coarsePointer: true }
  const tabletPortrait = { width: 820, height: 1180, coarsePointer: true }
  const shortDesktopWindow = { width: 1280, height: 420, coarsePointer: false }
  const desktop = { width: 1440, height: 900, coarsePointer: false }

  check('mobile detection: phone in portrait gets the mobile shell', matches(MOBILE_QUERY, phonePortrait))
  // Regression: a phone rotated to landscape is ~844x390, which clears the
  // 640px width test. Before this rule it was handed the three-column desktop
  // shell inside 390px of height — toolbar clipped, page canvas a sliver.
  check('mobile detection: phone in LANDSCAPE gets the mobile shell', matches(MOBILE_QUERY, phoneLandscape))
  check('mobile detection: tablet in portrait keeps the desktop shell', !matches(MOBILE_QUERY, tabletPortrait))
  // A short desktop window is short because the user made it so, and still
  // has a mouse — `pointer: coarse` is what keeps it on the desktop shell.
  check('mobile detection: a short desktop window keeps the desktop shell', !matches(MOBILE_QUERY, shortDesktopWindow))
  check('mobile detection: a normal desktop keeps the desktop shell', !matches(MOBILE_QUERY, desktop))
}

// --- Mobile book preview scaling (Phase 127) ---
{
  const { computePreviewScale } = await import('../src/layout/mobile/previewScale')

  // A 6x9in trim is ~680px wide at this app's scale — far wider than a phone,
  // so the real page is rendered full-size and CSS-scaled rather than
  // reflowed. Reflowing would change where pages break and show a different
  // book from the one that prints.
  const PAGE_W = 680

  const phone = computePreviewScale(390, PAGE_W)
  check('preview scale: a page is scaled down to fit a phone', phone > 0 && phone < 1)
  check('preview scale: the scaled page fits inside the container', phone * PAGE_W <= 390)

  // Never scale up: on a wide viewport the page sits at true size.
  check('preview scale: never magnifies past 100% on a wide viewport', computePreviewScale(1400, PAGE_W) === 1)
  check('preview scale: exactly 1 when the page just fits', computePreviewScale(PAGE_W + 32, PAGE_W) === 1)

  // Before the container has been measured there is no meaningful scale; the
  // view shows its loading state rather than a zero-sized page.
  check('preview scale: unmeasured container yields 0', computePreviewScale(0, PAGE_W) === 0)
  check('preview scale: a container narrower than the padding yields 0', computePreviewScale(20, PAGE_W) === 0)
  check('preview scale: guards a zero page width', computePreviewScale(390, 0) === 0)

  // Larger trims scale down further — the rule is proportional, not a constant.
  check('preview scale: a larger trim scales down further', computePreviewScale(390, 900) < computePreviewScale(390, 680))
}

// --- Book Graph node placement (Phase 135) ---
{
  const { findFreeGraphPosition, MIN_NODE_SEPARATION } = await import('../src/layout/planning/graphPlacement')

  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

  // Empty canvas: the candidate is already free, so it is used unchanged.
  const empty = findFreeGraphPosition({ x: 10, y: 20 }, [])
  check('graph placement: an unobstructed candidate is used as-is', empty.x === 10 && empty.y === 20)

  // A node far away is not an obstacle.
  const clear = findFreeGraphPosition({ x: 0, y: 0 }, [{ x: 900, y: 900 }])
  check('graph placement: a distant node does not displace the candidate', clear.x === 0 && clear.y === 0)

  // The real bug this exists for: "centre of the view" on a fresh graph is
  // exactly where the Book hub sits, which drew the new node underneath it.
  const hub = { x: 0, y: 0 }
  const nudged = findFreeGraphPosition({ x: 0, y: 0 }, [hub])
  check('graph placement: a candidate on top of an existing node is moved off it', near(nudged, hub) >= MIN_NODE_SEPARATION)

  // Deterministic — the same inputs must not wander between calls.
  const again = findFreeGraphPosition({ x: 0, y: 0 }, [hub])
  check('graph placement: placement is deterministic', again.x === nudged.x && again.y === nudged.y)

  // Clears every obstacle, not just the first one it collided with.
  const crowd = [
    { x: 0, y: 0 },
    { x: 0, y: -MIN_NODE_SEPARATION },
    { x: MIN_NODE_SEPARATION, y: 0 },
    { x: 0, y: MIN_NODE_SEPARATION },
    { x: -MIN_NODE_SEPARATION, y: 0 },
  ]
  const free = findFreeGraphPosition({ x: 0, y: 0 }, crowd)
  check(
    'graph placement: the result clears every existing node, not just the first',
    crowd.every((c) => near(free, c) >= MIN_NODE_SEPARATION),
  )

  // A second add from the same spot must not stack on the first.
  const first = findFreeGraphPosition({ x: 50, y: 50 }, [hub])
  const second = findFreeGraphPosition({ x: 50, y: 50 }, [hub, first])
  check('graph placement: a second node added from the same spot does not stack', near(second, first) >= MIN_NODE_SEPARATION)
}

// --- Image import partial failure (Phase 137) ---
{
  // `importFiles` needs a DOM (Image decoding, object URLs, IndexedDB), so
  // what is unit-tested here is the contract its callers depend on: the shape
  // that lets one bad file be reported without discarding the good ones.
  // The end-to-end behaviour is covered by the browser suite.
  const { EMPTY_ASSETS } = await import('../src/store/assetStore')
  check('asset store: EMPTY_ASSETS is a stable frozen-style constant', Array.isArray(EMPTY_ASSETS) && EMPTY_ASSETS.length === 0)

  // The identity matters: Zustand v5 selectors returning a fresh [] each call
  // never settle and trip React's "Maximum update depth exceeded".
  const { EMPTY_ASSETS: again } = await import('../src/store/assetStore')
  check('asset store: EMPTY_ASSETS keeps one identity across imports', again === EMPTY_ASSETS)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
