/**
 * Virtual Editor — score aggregation.
 *
 * Deterministic and documented on purpose: a professional publishing tool
 * can't have a score a user can't reconstruct by hand. See
 * docs/VIRTUAL_EDITOR.md § Confidence Scoring for the rationale.
 */

import type { CategoryScore, Finding, IssueCategory, Severity } from '@/virtualEditor/types'
import { ISSUE_CATEGORIES } from '@/virtualEditor/types'

/** Points deducted per finding, before multiplying by its confidence.
 * A single `critical` finding at full confidence costs 12 points; a
 * `suggestion` at low confidence barely moves the needle. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 12,
  major: 6,
  minor: 3,
  suggestion: 1,
}

/** Scores a flat list of findings (already filtered to one category, or
 * the whole report) down from 100. */
export function scoreFromFindings(findings: Finding[]): number {
  const deductions = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity] * f.confidence, 0)
  return Math.max(0, Math.min(100, Math.round(100 - deductions)))
}

/**
 * Produces one `CategoryScore` per `IssueCategory` — `null` for any
 * category with no checker/reviewer registered at all, so the dashboard
 * can honestly render "Not yet analysed" rather than a fabricated number.
 * A category *with* a checker but zero findings correctly scores 100.
 */
export function computeCategoryScores(
  findings: Finding[],
  analysedCategories: ReadonlySet<IssueCategory>,
): Record<IssueCategory, CategoryScore | null> {
  const result = {} as Record<IssueCategory, CategoryScore | null>

  for (const category of ISSUE_CATEGORIES) {
    if (!analysedCategories.has(category)) {
      result[category] = null
      continue
    }
    const categoryFindings = findings.filter((f) => f.category === category)
    result[category] = {
      category,
      score: scoreFromFindings(categoryFindings),
      findingCount: categoryFindings.length,
    }
  }

  return result
}

/** Simple mean of every analysed category's score. `null` when nothing has
 * been analysed yet. Deliberately not weighted by category importance in
 * this milestone — see docs/VIRTUAL_EDITOR.md for why that's a deferred
 * refinement rather than a hidden assumption. */
export function computeOverallScore(categoryScores: Record<IssueCategory, CategoryScore | null>): number | null {
  const analysed = Object.values(categoryScores).filter((c): c is CategoryScore => c !== null)
  if (analysed.length === 0) return null
  const mean = analysed.reduce((sum, c) => sum + c.score, 0) / analysed.length
  return Math.round(mean)
}

/** The 11 named scores from the product spec, in dashboard order. Two
 * taxonomy categories — `developmental` and `fieldGuide` — don't get their
 * own tile here (the spec's dashboard list doesn't name them separately)
 * but still exist for findings/checkers to use; their findings surface in
 * the report's issue list under their own category label. */
export interface ScoreTile {
  key: 'overall' | IssueCategory
  label: string
  description: string
}

export const SCORE_TILES: ScoreTile[] = [
  { key: 'overall', label: 'Overall Editorial Score', description: 'Mean of every category analysed so far.' },
  { key: 'proofreading', label: 'Proofreading Score', description: 'Spelling, punctuation, spacing, quotes, brackets.' },
  { key: 'copyEditing', label: 'Grammar Score', description: 'Grammar, sentence flow, word repetition, terminology.' },
  { key: 'typography', label: 'Typography Score', description: 'Font hierarchy, leading, tracking, hyphenation, rhythm.' },
  { key: 'layout', label: 'Layout Score', description: 'Spread balance, image placement, whitespace, hierarchy.' },
  { key: 'consistency', label: 'Consistency Score', description: 'Terminology, capitalisation, units and naming.' },
  { key: 'readability', label: 'Readability Score', description: 'Reading age, sentence complexity, reading fatigue.' },
  { key: 'accessibility', label: 'Accessibility Score', description: 'Contrast, minimum font size, line spacing.' },
  {
    key: 'publishingStandards',
    label: 'Publishing Quality Score',
    description: 'Widows, orphans, stranded titles, bad page turns.',
  },
  { key: 'print', label: 'Print Readiness Score', description: 'Bleed, crop marks, embedded fonts, image resolution.' },
  { key: 'commercial', label: 'Commercial Quality Score', description: 'Professional appearance, market readiness, premium feel.' },
]
