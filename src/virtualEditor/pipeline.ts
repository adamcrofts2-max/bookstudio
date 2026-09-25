/**
 * Virtual Editor — review pipeline orchestrator.
 *
 * `runPipeline` is the one function the "Review Entire Book" action calls.
 * It stays synchronous: every checker it runs is deterministic, so there is
 * nothing to await. The AI read (aiReviewer.ts) is a separate, explicitly
 * requested step — it costs the author money — and `mergeAiReview` folds its
 * result into whichever deterministic report is current. The two halves
 * never wait on each other.
 */

import { generateId } from '@/utils/id'
import type { Manuscript } from '@/types/content'
import type { LaidOutPage } from '@/renderer/paginate'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'
import type { AiReviewResult, CheckerContext, EditorialReport, IssueCategory, StyleGuide } from '@/virtualEditor/types'
import { ALL_CHECKERS } from '@/virtualEditor/checkers'
import { computeCategoryScores, computeOverallScore } from '@/virtualEditor/scoring'
import { revalidateAiFindings } from '@/virtualEditor/aiReviewer'

export function runPipeline(
  projectId: string,
  manuscript: Manuscript,
  styleGuide?: StyleGuide,
  pages?: LaidOutPage[],
  project?: Project,
  structuralPages?: StructuralPage[],
  assets?: ImageAsset[],
  layer0Bible?: Layer0Bible,
): EditorialReport {
  const ctx: CheckerContext = { manuscript, styleGuide, pages, project, structuralPages, assets, layer0Bible }
  const findings = ALL_CHECKERS.flatMap((checker) => checker.run(ctx))
  // A category counts as "analysed" only when at least one of its checkers
  // could actually run against this context — not merely "is registered."
  // `isApplicable` defaults to true (see types.ts), so every pre-existing
  // checker (proofreading/consistency/readability/copyEditing) is unaffected
  // by this change: it was always "applicable" and still is. This is what
  // lets publishingStandards/layout honestly stay `null` ("Not yet
  // analysed") when `pages` is absent this run, instead of a fake 100 from a
  // registered-but-inapplicable checker finding nothing.
  const analysedCategories = new Set(
    ALL_CHECKERS.filter((checker) => (checker.isApplicable ? checker.isApplicable(ctx) : true)).map(
      (checker) => checker.category,
    ),
  )
  const categoryScores = computeCategoryScores(findings, analysedCategories)
  const overallScore = computeOverallScore(categoryScores)

  return {
    id: generateId('report'),
    projectId,
    generatedAt: new Date().toISOString(),
    findings,
    categoryScores,
    overallScore,
    deterministicCategories: Array.from(analysedCategories),
  }
}

/**
 * Folds an AI read into a report: the report's own deterministic findings,
 * plus every AI finding that still points at text in the manuscript *as it
 * is now*, rescored together.
 *
 * Re-validation is the point. An AI read is expensive and so is kept across
 * later deterministic re-runs, but the author keeps writing in between — a
 * finding quoting a sentence they have since rewritten would send them
 * looking for words that are not there, and its "Fix" would patch nothing.
 * Such findings are dropped here rather than shown stale.
 *
 * Idempotent: any AI findings already in `report` are replaced, never
 * doubled, so merging the same read twice changes nothing.
 */
export function mergeAiReview(report: EditorialReport, ai: AiReviewResult, manuscript: Manuscript): EditorialReport {
  const deterministicFindings = report.findings.filter((f) => f.source !== 'ai')
  const aiFindings = revalidateAiFindings(ai.findings, manuscript)
  const findings = [...deterministicFindings, ...aiFindings]
  const analysed = new Set<IssueCategory>([...report.deterministicCategories, ...ai.categories])
  const categoryScores = computeCategoryScores(findings, analysed)
  return {
    ...report,
    findings,
    categoryScores,
    overallScore: computeOverallScore(categoryScores),
    ai: {
      generatedAt: ai.generatedAt,
      summary: ai.summary,
      categories: ai.categories,
      coverage: ai.coverage,
      discarded: ai.discarded,
    },
  }
}
