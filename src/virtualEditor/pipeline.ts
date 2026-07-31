/**
 * Virtual Editor — review pipeline orchestrator.
 *
 * `runPipeline` is the one function the "Review Entire Book" action calls.
 * It is deliberately synchronous in this milestone: every registered
 * checker is deterministic, so there is nothing to await. Once real
 * `AiReviewer`s exist (see aiReviewer.ts), this becomes async — run the
 * deterministic checkers first (fast), then merge in AI findings as they
 * resolve. That change is isolated to this one file; nothing else in the
 * app needs to know the pipeline became async.
 */

import { generateId } from '@/utils/id'
import type { Manuscript } from '@/types/content'
import type { LaidOutPage } from '@/renderer/paginate'
import type { Project } from '@/types/project'
import type { StructuralPage } from '@/types/structuralPage'
import type { ImageAsset } from '@/types/asset'
import type { CheckerContext, EditorialReport, StyleGuide } from '@/virtualEditor/types'
import { ALL_CHECKERS } from '@/virtualEditor/checkers'
import { computeCategoryScores, computeOverallScore } from '@/virtualEditor/scoring'

export function runPipeline(
  projectId: string,
  manuscript: Manuscript,
  styleGuide?: StyleGuide,
  pages?: LaidOutPage[],
  project?: Project,
  structuralPages?: StructuralPage[],
  assets?: ImageAsset[],
): EditorialReport {
  const ctx: CheckerContext = { manuscript, styleGuide, pages, project, structuralPages, assets }
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
  }
}
