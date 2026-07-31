/**
 * Pre-export readiness check — the concrete realisation of
 * `docs/ROADMAP.md` Phase D's "Print-on-demand validation profiles
 * (Amazon KDP, IngramSpark spec checks)" item. Deliberately **not** a new
 * checker category or a duplicated rule set: this just re-runs the
 * `print`/`commercial` categories' existing checkers (Phase 36) — the KDP
 * gutter-margin table, bleed minimums, low-resolution images, missing
 * copyright/ISBN/back-cover-blurb/title-page — against whatever project
 * state exists right now, so the Export button can warn *before* a reader
 * or a print-on-demand platform's own validator finds the problem instead
 * of after.
 */

import type { Checker, CheckerContext, Finding } from '@/virtualEditor/types'
import { PRINT_READINESS_CHECKERS } from '@/virtualEditor/checkers/printReadiness'
import { COMMERCIAL_QUALITY_CHECKERS } from '@/virtualEditor/checkers/commercialQuality'

const READINESS_CHECKERS: Checker[] = [...PRINT_READINESS_CHECKERS, ...COMMERCIAL_QUALITY_CHECKERS]

/** Runs only the print-readiness/commercial-quality checkers (not the
 * whole `ALL_CHECKERS` pipeline — proofreading/consistency/etc. findings
 * aren't relevant to "is this safe to send to a printer") against the
 * given context. Same `isApplicable`-respecting shape as `runPipeline`. */
export function checkExportReadiness(ctx: CheckerContext): Finding[] {
  return READINESS_CHECKERS.filter((checker) => (checker.isApplicable ? checker.isApplicable(ctx) : true)).flatMap(
    (checker) => checker.run(ctx),
  )
}

/** A `critical`/`major` finding is treated as export-blocking (worth
 * interrupting the user for); `minor`/`suggestion` findings are shown for
 * awareness but don't themselves trigger the confirmation dialog — same
 * severity-to-attention mapping `scoring.ts`'s `SEVERITY_WEIGHT` already
 * encodes for the dashboard. */
export function hasBlockingReadinessIssues(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'critical' || f.severity === 'major')
}
