/**
 * Virtual Editor — Layer: shared types
 *
 * See docs/VIRTUAL_EDITOR.md for the full design. This layer is read-only
 * with respect to the manuscript: `Checker`s and `AiReviewer`s receive a
 * `Manuscript` and return `Finding[]` — they never mutate anything.
 * Only `src/store/virtualEditorStore.ts` is allowed to turn a `Finding`
 * into a real edit, and it only ever does so through `contentStore`'s own
 * published actions (`updateBlock`, `renameChapter`).
 */

import type { ContentBlock, Manuscript } from '@/types/content'
import type { LaidOutPage } from '@/renderer/paginate'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'

/**
 * The full editorial taxonomy from the product spec. Every `Finding` is
 * tagged with exactly one of these. Not every category has a dashboard
 * score tile (see `SCORE_TILES` in `scoring.ts`) and not every category has
 * a real checker yet (see `docs/VIRTUAL_EDITOR.md` "What's real" table).
 */
export type IssueCategory =
  | 'proofreading'
  | 'copyEditing'
  | 'developmental'
  | 'publishingStandards'
  | 'readability'
  | 'consistency'
  | 'fieldGuide'
  | 'layout'
  | 'typography'
  | 'accessibility'
  | 'print'
  | 'commercial'
  | 'continuity'

export const ISSUE_CATEGORIES: IssueCategory[] = [
  'proofreading',
  'copyEditing',
  'developmental',
  'publishingStandards',
  'readability',
  'consistency',
  'fieldGuide',
  'layout',
  'typography',
  'accessibility',
  'print',
  'commercial',
  'continuity',
]

/**
 * Severity drives both sort order in the dashboard and the score-deduction
 * weight in `scoring.ts`. `suggestion` is a style/polish nit; `critical` is
 * something that would embarrass a professional publisher.
 */
export type Severity = 'critical' | 'major' | 'minor' | 'suggestion'

/** Where in the manuscript a finding points. `blockId` is omitted for
 * findings that describe a chapter- or book-level pattern rather than one
 * exact block (e.g. "quotation style is inconsistent across the book"). */
export interface FindingLocation {
  chapterId: string
  blockId?: string
}

/**
 * A concrete, mechanically-derivable fix. Only present when a checker can
 * compute the exact replacement value with confidence — proofreading fixes
 * like collapsing a double space, never a rewrite. `apply` is a pure
 * function: `newBlock = { ...block, ...apply(block) }`.
 */
export interface SuggestedFix {
  /** Short human-readable description shown next to the Accept button. */
  summary: string
  apply: (block: ContentBlock) => Partial<ContentBlock>
}

/**
 * One editorial observation. Every finding must be able to answer "what is
 * wrong" (`message`) and "why it matters" (`whyItMatters`) per the
 * non-negotiable in the product spec — the Virtual Editor never behaves
 * like a black box.
 */
export interface Finding {
  id: string
  checkerId: string
  category: IssueCategory
  /** Machine-readable issue type, e.g. "double-space", "unmatched-quote".
   * Used for "Ignore Similar" grouping. */
  issueType: string
  severity: Severity
  /** 0–1. Deterministic checkers use this to express certainty (e.g. a
   * mismatched bracket count is 1.0 certain; "paragraph doesn't end in
   * punctuation" is softer because some sentences legitimately don't).
   * AI-sourced findings (future) will carry the model's own estimate. */
  confidence: number
  location: FindingLocation
  /** What is wrong, in one sentence. */
  message: string
  /** Why it matters to a reader/publisher — required, never omitted. */
  whyItMatters: string
  suggestedFix?: SuggestedFix
  /** Where this finding came from — surfaced in the UI so the hybrid
   * approach stays honest and legible, per CLAUDE.md. */
  source: 'deterministic' | 'ai'
}

/** Read-only view of the manuscript (and, later, project/theme/layout
 * context) a checker is allowed to inspect.
 *
 * `pages` is the real, fully-measured pagination output — the exact same
 * `LaidOutPage[]` `BookRenderer.tsx` publishes into `useExportStore` after
 * composing front/back matter with the chapter flow, and the exact same data
 * PDF export reads. It's optional and genuinely **absent** whenever the
 * manuscript workspace hasn't rendered at least once this session (there is
 * no second pagination pipeline here — see `docs/VIRTUAL_EDITOR.md` §
 * Publishing Standards & Layout checkers for why re-deriving it would be
 * unnecessary duplication of `HeightMeasurer`'s expensive, React-only,
 * off-screen DOM measurement). Checkers that need real page geometry
 * (publishing-standards, layout) must declare `isApplicable` and return `[]`
 * immediately when `pages` is `undefined`. */
export interface CheckerContext {
  manuscript: Manuscript
  styleGuide?: StyleGuide
  pages?: LaidOutPage[]
  /**
   * Added for the Typography/Print Readiness/Commercial Quality/Field-guide
   * checkers (docs/STATUS.md Phase 36). `project` exposes trim size/margins/
   * bleed/themeId/category (a pure read of Layer 1, and — via
   * `resolveTheme(project.settings.themeId)` — Layer 3); `structuralPages`
   * exposes front-/back-matter content (title page, copyright, ISBN, back
   * cover) that never lives on `Manuscript`; `assets` exposes each image's
   * real pixel dimensions for print-resolution checks. All three are
   * optional and simply forwarded by the caller (`VirtualEditorWorkspace.tsx`,
   * which already holds `project` and reads the other two stores) — this
   * layer still never reaches into `projectStore`/`structuralPageStore`/
   * `assetStore` itself, per CLAUDE.md's layer-separation rule. Checkers that
   * depend on one of these must declare `isApplicable` (or check for
   * `undefined` inline), exactly like the existing `pages`-dependent checkers,
   * so the dashboard can honestly report "Not yet analysed" instead of a
   * fake 100.
   */
  project?: Project
  structuralPages?: StructuralPage[]
  assets?: ImageAsset[]
  /**
   * Layer 0's story bible (`docs/AI_WORKSPACE_VISION.md`) — added for the
   * Continuity checker (docs/STATUS.md Phase 74). Optional and simply
   * forwarded by the caller (`VirtualEditorWorkspace.tsx`, which reads
   * `useLayer0Store` itself), same pattern as `structuralPages`/`assets`
   * above: this layer never reaches into `layer0Store` itself, per
   * CLAUDE.md's layer-separation rule, and `types/layer0.ts`'s own "no Layer
   * 2 code may import this file" note doesn't apply here — the Virtual
   * Editor is an independent layer, not Layer 2 (see
   * `docs/VIRTUAL_EDITOR.md`). Checkers that depend on it must declare
   * `isApplicable` and return `[]` when it's `undefined` or empty, exactly
   * like the existing optional context fields.
   */
  layer0Bible?: Layer0Bible
}

/**
 * A deterministic, synchronous editorial check. Pure function: same input,
 * same findings, every time. This is the "fast, cheap, predictable" half of
 * the hybrid approach described in docs/VIRTUAL_EDITOR.md.
 */
export interface Checker {
  id: string
  category: IssueCategory
  label: string
  description: string
  run: (ctx: CheckerContext) => Finding[]
  /**
   * Whether this checker can actually run against the given context —
   * distinct from "ran and found nothing." Defaults to "always applicable"
   * when omitted, so every checker written before this field existed
   * (proofreading/consistency/readability/copyEditing) keeps working with
   * zero changes. Checkers that depend on `ctx.pages` (publishingStandards,
   * layout) declare `isApplicable: (ctx) => !!ctx.pages` so `runPipeline` can
   * honestly report "Not yet analysed" for that category instead of a fake
   * 100 when the manuscript view hasn't rendered yet this session — see
   * `pipeline.ts`'s `analysedCategories` computation.
   */
  isApplicable?: (ctx: CheckerContext) => boolean
}

/**
 * The "reserve AI for higher-level judgement" half of the hybrid approach.
 * Not implemented in this milestone — no real network/LLM call exists yet.
 * `NullAiReviewer` in `aiReviewer.ts` is the only implementation today, and
 * it always reports itself unavailable so the dashboard can honestly show
 * "Not yet analysed" instead of a fabricated score. Future modules
 * (developmental editing critique, readability judgement, design critique,
 * contextual style learning) implement this same interface.
 */
export interface AiReviewer {
  id: string
  category: IssueCategory
  label: string
  description: string
  isAvailable: () => boolean
  run: (ctx: CheckerContext) => Promise<Finding[]>
}

/**
 * Project-level editorial preferences (Style Guide). Designed now, not
 * enforced yet — see docs/VIRTUAL_EDITOR.md § Style Guide. Checkers accept
 * it as optional context so it can be wired in incrementally without
 * breaking the `Checker` interface.
 */
export interface StyleGuide {
  englishVariant: 'british' | 'american'
  oxfordComma: 'require' | 'forbid' | 'no-preference'
  quoteStyle: 'curly' | 'straight' | 'no-preference'
  headingCapitalisation: 'title-case' | 'sentence-case' | 'no-preference'
  measurementUnits: 'metric' | 'imperial' | 'no-preference'
  dateFormat: 'day-month-year' | 'month-day-year' | 'no-preference'
}

export const DEFAULT_STYLE_GUIDE: StyleGuide = {
  englishVariant: 'british',
  oxfordComma: 'no-preference',
  quoteStyle: 'no-preference',
  headingCapitalisation: 'no-preference',
  measurementUnits: 'no-preference',
  dateFormat: 'no-preference',
}

/** Per-category score, or `null` when no checker/reviewer exists yet for
 * that category — the dashboard renders `null` as "Not yet analysed"
 * rather than fabricating a number. */
export interface CategoryScore {
  category: IssueCategory
  score: number
  findingCount: number
}

export interface EditorialReport {
  id: string
  projectId: string
  generatedAt: string
  findings: Finding[]
  /** One entry per `IssueCategory`; `null` where not yet analysed. */
  categoryScores: Record<IssueCategory, CategoryScore | null>
  /** Mean of analysed category scores only — see scoring.ts. `null` if
   * nothing has been analysed at all. */
  overallScore: number | null
}

/** The user's decision on a single finding. `new` is the initial state
 * immediately after a review run. */
export type FindingStatus = 'new' | 'accepted' | 'rejected' | 'ignored' | 'ignoredSimilar'

/** Action verbs from the product spec. `applyToChapter` / `applyToBook`
 * are modelled here for forward-compatibility but are not wired to real
 * batch-apply logic in this milestone — see docs/VIRTUAL_EDITOR.md. */
export type SuggestionAction =
  | 'accept'
  | 'reject'
  | 'edit'
  | 'ignore'
  | 'ignoreSimilar'
  | 'applyToChapter'
  | 'applyToBook'
