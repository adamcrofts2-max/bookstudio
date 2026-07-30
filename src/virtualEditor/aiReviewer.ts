/**
 * Virtual Editor — AI reviewer stub.
 *
 * No real model call exists in this milestone. `createNullAiReviewer`
 * is the only implementation of the `AiReviewer` interface today; it
 * always reports itself unavailable and returns no findings. This is what
 * lets `runPipeline`/the dashboard tell the truth ("Not yet analysed")
 * instead of fabricating a score for categories like readability or
 * developmental editing that genuinely need model judgement.
 *
 * When a real reviewer is built (see docs/VIRTUAL_EDITOR.md § AI Workflow
 * and § Future Extensibility), it implements this exact interface and is
 * registered alongside these stubs — no other layer needs to change.
 */

import type { AiReviewer, CheckerContext, Finding, IssueCategory } from '@/virtualEditor/types'

export function createNullAiReviewer(category: IssueCategory, label: string): AiReviewer {
  return {
    id: `ai.null.${category}`,
    category,
    label,
    description: 'Designed, not yet implemented in this milestone — no model call is made.',
    isAvailable: () => false,
    run: async (_ctx: CheckerContext): Promise<Finding[]> => [],
  }
}

/** One stub per category the spec describes as AI-reserved (developmental
 * editing, readability judgement, layout/design critique, field-guide
 * completeness, commercial-quality critique, etc.). Registering them here
 * — even though none are available yet — is what makes the dashboard's
 * "Not yet analysed" tiles a deliberate design statement rather than a
 * missing feature. */
export const AI_REVIEWER_STUBS: AiReviewer[] = [
  createNullAiReviewer('copyEditing', 'Copy Editing (AI)'),
  createNullAiReviewer('developmental', 'Developmental Editing (AI)'),
  createNullAiReviewer('publishingStandards', 'Publishing Standards (AI)'),
  createNullAiReviewer('readability', 'Readability Analysis (AI)'),
  createNullAiReviewer('consistency', 'Consistency (AI)'),
  createNullAiReviewer('fieldGuide', 'Field Guide Intelligence (AI)'),
  createNullAiReviewer('layout', 'Layout Intelligence (AI)'),
  createNullAiReviewer('typography', 'Typography Intelligence (AI)'),
  createNullAiReviewer('accessibility', 'Accessibility Review (AI)'),
  createNullAiReviewer('print', 'Print Review (AI)'),
  createNullAiReviewer('commercial', 'Commercial Publishing Review (AI)'),
]
