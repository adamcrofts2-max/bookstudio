/**
 * Virtual Editor — the AI editorial read (docs/STATUS.md Phase 179).
 *
 * The deterministic checkers can count sentence length and find a doubled
 * word; they cannot say that chapter three sags, that a narrator slips out
 * of point of view, or that the opening page gives a reader no reason to
 * turn it. This module asks a model to, and turns its answer into ordinary
 * `Finding`s the dashboard already knows how to show, score and fix.
 *
 * Three rules shape everything here:
 *
 * 1. **Every finding is anchored to real text.** The model is shown the book
 *    with a short key on every block (`b12`) and must quote the exact words
 *    it means. A finding whose key is unknown or whose quote is not in the
 *    manuscript is dropped and counted (`discarded`) rather than shown — a
 *    finding the author cannot find is worse than none.
 * 2. **A fix is offered only when it is mechanical.** When the model supplies
 *    a replacement *and* its quote occurs exactly once in one field of the
 *    block, "Fix" swaps those words and nothing else, through the same
 *    revision-logged path every other fix uses. Anything broader stays a
 *    note for the author to act on themselves.
 * 3. **This layer never talks to a network.** It builds a request and parses
 *    a reply; the `AiReviewTransport` it is handed does the sending
 *    (`src/ai/claudeReviewTransport.ts` in the app, a canned reply in tests).
 */

import type { ContentBlock, Manuscript } from '@/types/content'
import type { ProjectCategory } from '@/types/project'
import type {
  AiReviewer,
  AiReviewProgress,
  AiReviewResult,
  CheckerContext,
  Finding,
  IssueCategory,
  Severity,
  SuggestedFix,
} from '@/virtualEditor/types'
import { blockTextSpans } from '@/virtualEditor/textExtract'
import { getRawFieldText, patchTextField } from '@/virtualEditor/textPatch'
import { escapeRegExp, wordCount } from '@/utils/format'
import { generateId } from '@/utils/id'

/** The categories an editorial read scores. The rest — layout, typography,
 * print, accessibility, proofreading — are measured facts the deterministic
 * checkers already get right, and asking a model to guess at them would
 * only add noise to numbers that are currently exact. */
export const AI_REVIEW_CATEGORIES: IssueCategory[] = [
  'developmental',
  'copyEditing',
  'readability',
  'consistency',
  'commercial',
]

/**
 * How much manuscript goes into one request. Roughly 150,000 tokens — a
 * long novel fits whole; an encyclopaedia does not, and the coverage line
 * says exactly how far the read got rather than implying it was complete.
 */
export const AI_REVIEW_MAX_CHARS = 600_000

/** More than this and a report stops being read. The prompt asks for the
 * most important first, so a cap loses the least important. */
export const AI_REVIEW_MAX_FINDINGS = 40

const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  novel: 'novel',
  nonfiction: 'non-fiction',
  childrens: "children's book",
  educational: 'educational',
  'coffee-table': 'illustrated coffee-table book',
  nature: 'nature guide',
  scientific: 'scientific',
  other: 'book',
}

const CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.7, low: 0.5 }
const SEVERITIES: Severity[] = ['critical', 'major', 'minor', 'suggestion']

export interface AiReviewRequest {
  system: string
  prompt: string
  /** JSON Schema the reply must match (structured output). */
  schema: Record<string, unknown>
}

/** Sends a request and resolves with the model's raw text reply. Owns keys,
 * SDKs and error wording; the reviewer owns everything else. */
export type AiReviewTransport = (
  request: AiReviewRequest,
  options: { signal?: AbortSignal; onProgress?: (progress: AiReviewProgress) => void },
) => Promise<string>

/** Where a block key points. */
interface KeyTarget {
  chapterId: string
  blockId?: string
}

export interface BuiltAiReviewRequest extends AiReviewRequest {
  keys: Map<string, KeyTarget>
  coverage: AiReviewResult['coverage']
}

export const AI_REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'severity',
          'confidence',
          'location',
          'issueType',
          'excerpt',
          'replacement',
          'message',
          'whyItMatters',
        ],
        properties: {
          category: { type: 'string', enum: AI_REVIEW_CATEGORIES },
          severity: { type: 'string', enum: SEVERITIES },
          confidence: { type: 'string', enum: Object.keys(CONFIDENCE) },
          location: { type: 'string' },
          issueType: { type: 'string' },
          excerpt: { type: 'string' },
          replacement: { type: 'string' },
          message: { type: 'string' },
          whyItMatters: { type: 'string' },
        },
      },
    },
  },
}

const SYSTEM_PROMPT = `You are a senior editor at a respected publishing house, giving an author an editorial read of their manuscript before it goes to print. You are candid, specific and kind. You point at the exact words, explain why they matter to a reader, and never pad a report with praise or trivia to look thorough. You respect the author's voice: you flag what gets in a reader's way, not what you would have written differently.`

/** The text of a block as the model sees it — every span, in order. */
function blockText(chapterId: string, block: ContentBlock): string {
  return blockTextSpans(chapterId, block)
    .map((span) => span.text.trim())
    .filter(Boolean)
    .join(' / ')
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function describeStyle(ctx: CheckerContext): string[] {
  const guide = ctx.styleGuide
  if (!guide) return []
  const lines = [`Spelling: ${guide.englishVariant === 'british' ? 'British' : 'American'} English`]
  if (guide.oxfordComma !== 'no-preference') lines.push(`Oxford comma: ${guide.oxfordComma === 'require' ? 'always' : 'never'}`)
  if (guide.quoteStyle !== 'no-preference') lines.push(`Quotation marks: ${guide.quoteStyle}`)
  if (guide.measurementUnits !== 'no-preference') lines.push(`Units: ${guide.measurementUnits}`)
  return lines
}

/**
 * Turns the book into one request. Pure: the same context always produces
 * the same prompt and the same key table, which is what lets the parser be
 * tested against a reply without ever calling a model.
 */
export function buildAiReviewRequest(ctx: CheckerContext, maxChars = AI_REVIEW_MAX_CHARS): BuiltAiReviewRequest {
  const keys = new Map<string, KeyTarget>()
  const chapterParts: string[] = []
  const chapters = ctx.manuscript.chapters
  let used = 0
  let chaptersRead = 0
  let wordsRead = 0
  let blockCounter = 0

  for (const [chapterIndex, chapter] of chapters.entries()) {
    const chapterKey = `c${chapterIndex + 1}`
    const lines: string[] = []
    let complete = true
    for (const block of chapter.blocks) {
      const text = blockText(chapter.id, block)
      if (!text) continue
      const key = `b${blockCounter + 1}`
      const prefix = block.type === 'heading' ? '(heading) ' : block.type === 'paragraph' ? '' : `(${block.type}) `
      const line = `[${key}] ${prefix}${text}`
      if (used + line.length > maxChars) {
        complete = false
        break
      }
      blockCounter++
      keys.set(key, { chapterId: chapter.id, blockId: block.id })
      lines.push(line)
      used += line.length
      wordsRead += wordCount(text)
    }
    if (lines.length === 0 && !complete) break
    keys.set(chapterKey, { chapterId: chapter.id })
    chapterParts.push(`<chapter key="${chapterKey}" title="${escapeAttribute(chapter.title)}">\n${lines.join('\n')}\n</chapter>`)
    if (!complete) break
    chaptersRead++
  }

  const project = ctx.project
  const details = [
    project?.name ? `Title: ${project.name}` : null,
    project ? `Kind of book: ${CATEGORY_LABEL[project.category]}${project.bookForm ? ` (${project.bookForm})` : ''}` : null,
    ...describeStyle(ctx),
  ].filter((line): line is string => Boolean(line))

  const coverageNote =
    chaptersRead < chapters.length
      ? `\nThe book is too long for one read: you have the first ${chaptersRead} of ${chapters.length} chapters${chapterParts.length > chaptersRead ? ' and the start of the next' : ''}. Judge only what you have been given.\n`
      : ''

  const prompt = `<book>
${details.length ? `<details>\n${details.join('\n')}\n</details>\n` : ''}<manuscript>
${chapterParts.join('\n')}
</manuscript>
</book>
${coverageNote}
Give this book an editorial read. Every block of the manuscript is prefixed with a key in square brackets, and every chapter has a key too.

Report problems in these categories only:
- developmental: structure, pacing, stakes, a chapter that does not earn its place, an argument or plot thread that goes nowhere.
- copyEditing: grammar, ambiguous or tangled sentences, clumsy repetition, the wrong word.
- readability: passages too dense or too long-winded for the intended reader, jargon left unexplained.
- consistency: names, facts, terminology, tense or point of view that change without reason.
- commercial: whether the opening makes a reader want to continue, and whether the book delivers what its title and chapter titles promise.

Automatic checks already cover spelling mistakes, doubled words, stray spaces, unbalanced quotes or brackets, heading capitalisation, missing front matter and page layout. Do not report those.

For each finding:
- location: the key of the block where the problem is ("b12"), or of the chapter ("c3") when it is about a chapter as a whole.
- excerpt: words copied exactly, character for character, from that one block — a phrase or a sentence. Leave it empty only for a finding about a whole chapter.
- replacement: when the fix is a rewording of the excerpt alone, the exact text that should replace it, in the author's voice and changing only what the finding is about. Otherwise leave it empty.
- severity: critical (a publisher would not accept the book with this), major (a reader would notice and be put off), minor (a careful reader would notice), suggestion (polish).
- confidence: high, medium or low — how sure you are this is a real problem rather than a matter of taste.
- issueType: a short kebab-case label, reused for every instance of the same kind of problem (for example "pov-slip" or "slow-opening").
- message: what is wrong, in one sentence, addressed to the author.
- whyItMatters: why it matters to a reader, in one sentence.

Report at most ${AI_REVIEW_MAX_FINDINGS} findings, most important first. Report fewer if the writing is strong — an empty list is a good answer when it is true. In summary, give your overall read in two to four sentences: what is working, and the one or two changes that would improve the book most.`

  return { system: SYSTEM_PROMPT, prompt, schema: AI_REVIEW_SCHEMA, keys, coverage: { chaptersRead, chaptersTotal: chapters.length, wordsRead } }
}

/**
 * A pattern that finds the model's quote in the manuscript despite the
 * differences that are not the model's fault: straight vs curly quotes and
 * apostrophes, runs of whitespace, and — in paragraph HTML — characters
 * stored as entities.
 */
export function excerptPattern(excerpt: string, flags = 'g'): RegExp | null {
  const trimmed = excerpt.trim()
  if (!trimmed) return null
  let source = ''
  for (const ch of trimmed) {
    if (/\s/.test(ch)) source += '(?:\\s|&nbsp;|\\u00a0)+'
    else if (ch === "'" || ch === '‘' || ch === '’') source += "(?:'|\\u2018|\\u2019|&#39;|&rsquo;|&lsquo;)"
    else if (ch === '"' || ch === '“' || ch === '”') source += '(?:"|\\u201c|\\u201d|&quot;|&ldquo;|&rdquo;)'
    else if (ch === '&') source += '(?:&|&amp;)'
    else if (ch === '<') source += '(?:<|&lt;)'
    else if (ch === '>') source += '(?:>|&gt;)'
    else source += escapeRegExp(ch)
  }
  source = source.replace(/(\(\?:\\s\|&nbsp;\|\\u00a0\)\+)+/g, '(?:\\s|&nbsp;|\\u00a0)+')
  return new RegExp(source, flags)
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Replaces the one occurrence of `excerpt` in one field of the block —
 * recomputed at the moment the author clicks Fix, against the block as it
 * is then. Returns `{}` (a no-op) if the words are no longer there exactly
 * once, rather than guessing where they went. */
function buildReplaceFix(field: string, excerpt: string, replacement: string): SuggestedFix {
  return {
    summary: `Replace "${excerpt}" with "${replacement}"`,
    apply: (block: ContentBlock) => {
      const pattern = excerptPattern(excerpt)
      if (!pattern) return {}
      const current = getRawFieldText(block, field)
      if (countMatches(current, pattern) !== 1) return {}
      const next = field === 'html' && block.type === 'paragraph' ? escapeHtmlText(replacement) : replacement
      return patchTextField(block, field, (text) => text.replace(pattern, () => next))
    },
  }
}

/** The one field of `block` holding `excerpt` exactly once, if there is one. */
function uniqueField(chapterId: string, block: ContentBlock, excerpt: string): string | null {
  const pattern = excerptPattern(excerpt)
  if (!pattern) return null
  const fields = blockTextSpans(chapterId, block)
    .map((span) => span.field)
    .filter((field) => countMatches(getRawFieldText(block, field), pattern) > 0)
  if (fields.length !== 1) return null
  return countMatches(getRawFieldText(block, fields[0]!), pattern) === 1 ? fields[0]! : null
}

function blockContains(chapterId: string, block: ContentBlock, excerpt: string): boolean {
  const pattern = excerptPattern(excerpt, '')
  return pattern ? pattern.test(blockText(chapterId, block)) : false
}

/**
 * Resolves where a finding really is. The model's key is trusted only as far
 * as the text agrees with it: a quote that is not in the cited block but is
 * in exactly one other block of the same chapter is re-anchored there (the
 * commonest slip — citing the paragraph next door); anything else that does
 * not match is `null`, and the finding is dropped.
 */
function anchor(target: KeyTarget, excerpt: string, manuscript: Manuscript): KeyTarget | null {
  const chapter = manuscript.chapters.find((c) => c.id === target.chapterId)
  if (!chapter) return null
  if (!excerpt.trim()) return target.blockId && !chapter.blocks.some((b) => b.id === target.blockId) ? null : target

  if (target.blockId) {
    const block = chapter.blocks.find((b) => b.id === target.blockId)
    if (block && blockContains(chapter.id, block, excerpt)) return target
  }
  const holders = chapter.blocks.filter((b) => blockContains(chapter.id, b, excerpt))
  return holders.length === 1 ? { chapterId: chapter.id, blockId: holders[0]!.id } : null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Parses and validates the model's reply against the key table of the
 * request that produced it. Never throws on a bad *finding* — it drops it
 * and counts it. Throws only when the reply as a whole is not the JSON that
 * was asked for, because then there is nothing trustworthy to show.
 */
export function parseAiReview(
  replyText: string,
  request: BuiltAiReviewRequest,
  manuscript: Manuscript,
): Omit<AiReviewResult, 'generatedAt'> {
  let data: unknown
  try {
    data = JSON.parse(replyText)
  } catch {
    throw new Error('Claude replied, but not in the format the Virtual Editor asked for. Try again.')
  }
  const root = (data ?? {}) as { summary?: unknown; findings?: unknown }
  const raw = Array.isArray(root.findings) ? root.findings : []
  const findings: Finding[] = []
  let discarded = 0

  for (const item of raw.slice(0, AI_REVIEW_MAX_FINDINGS)) {
    const entry = (item ?? {}) as Record<string, unknown>
    const category = asString(entry.category) as IssueCategory
    const severity = asString(entry.severity) as Severity
    const message = asString(entry.message)
    const whyItMatters = asString(entry.whyItMatters)
    const excerpt = asString(entry.excerpt)
    const replacement = asString(entry.replacement)
    const target = request.keys.get(asString(entry.location).replace(/^\[|\]$/g, ''))

    if (!AI_REVIEW_CATEGORIES.includes(category) || !SEVERITIES.includes(severity) || !message || !target) {
      discarded++
      continue
    }
    const location = anchor(target, excerpt, manuscript)
    if (!location) {
      discarded++
      continue
    }

    let suggestedFix: SuggestedFix | undefined
    if (location.blockId && excerpt && replacement && replacement !== excerpt) {
      const block = manuscript.chapters.find((c) => c.id === location.chapterId)?.blocks.find((b) => b.id === location.blockId)
      const field = block ? uniqueField(location.chapterId, block, excerpt) : null
      if (field) suggestedFix = buildReplaceFix(field, excerpt, replacement)
    }

    findings.push({
      id: generateId('finding'),
      checkerId: 'ai.editorialRead',
      category,
      issueType: `ai-${asString(entry.issueType).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || category}`,
      severity,
      confidence: CONFIDENCE[asString(entry.confidence)] ?? CONFIDENCE.medium!,
      location,
      message,
      whyItMatters: whyItMatters || 'Flagged by Claude’s editorial read.',
      excerpt: excerpt || undefined,
      suggestedFix,
      source: 'ai',
    })
  }
  discarded += Math.max(0, raw.length - AI_REVIEW_MAX_FINDINGS)

  return {
    summary: asString(root.summary),
    findings,
    categories: AI_REVIEW_CATEGORIES,
    coverage: request.coverage,
    discarded,
  }
}

/**
 * Keeps only the AI findings that still point at the manuscript as it is
 * now — see `pipeline.ts`'s `mergeAiReview` for why. A finding whose
 * quoted words have moved to another block of the same chapter follows
 * them; one whose words are gone is dropped.
 */
export function revalidateAiFindings(findings: Finding[], manuscript: Manuscript): Finding[] {
  const kept: Finding[] = []
  for (const finding of findings) {
    const location = anchor(finding.location, finding.excerpt ?? '', manuscript)
    if (!location) continue
    kept.push(location.blockId === finding.location.blockId ? finding : { ...finding, location })
  }
  return kept
}

/** The editorial read, wired to whatever transport it is given. */
export function createAiReviewer(transport: AiReviewTransport): AiReviewer {
  return {
    id: 'ai.editorialRead',
    label: 'Editorial read by Claude',
    categories: AI_REVIEW_CATEGORIES,
    run: async (ctx, options = {}) => {
      const request = buildAiReviewRequest(ctx)
      const reply = await transport(
        { system: request.system, prompt: request.prompt, schema: request.schema },
        { signal: options.signal, onProgress: options.onProgress },
      )
      return { ...parseAiReview(reply, request, ctx.manuscript), generatedAt: new Date().toISOString() }
    },
  }
}
