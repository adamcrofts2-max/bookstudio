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
import type { EditorialReport, StyleGuide } from '@/virtualEditor/types'
import { ALL_CHECKERS } from '@/virtualEditor/checkers'
import { computeCategoryScores, computeOverallScore } from '@/virtualEditor/scoring'

export function runPipeline(projectId: string, manuscript: Manuscript, styleGuide?: StyleGuide): EditorialReport {
  const findings = ALL_CHECKERS.flatMap((checker) => checker.run({ manuscript, styleGuide }))
  const analysedCategories = new Set(ALL_CHECKERS.map((checker) => checker.category))
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
