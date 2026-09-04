/**
 * Where a node added from the Book Graph canvas should land.
 *
 * Split out of `BookGraphView.tsx` as a pure function so the placement rule
 * is unit-testable on its own — the component around it needs a browser, a
 * Web Worker and a settled force layout before it will render a single node.
 */

export interface GraphPoint {
  x: number
  y: number
}

/** Far enough apart that two circles plus their two-line labels don't
 * collide. `BookGraphView`'s largest node (the Book hub) has a radius of 40
 * and every node carries a 140x34 label below it, so centres closer than
 * this overlap visibly even at the default node scale. */
export const MIN_NODE_SEPARATION = 120

/**
 * Nudges `candidate` off any node already sitting there, searching outward in
 * rings until it finds clear space.
 *
 * This is not a nicety. On a fresh graph "the centre of the view" is exactly
 * where the Book hub sits, so an un-nudged first node is drawn completely
 * underneath it — the user adds a character and appears to get nothing. The
 * search is deliberately deterministic (no jitter/randomness): adding the
 * same thing twice from the same view should put the second one somewhere
 * predictable, not somewhere different on every attempt.
 *
 * Falls back to the original candidate if eight rings are all occupied —
 * overlapping is better than throwing, and a graph dense enough to fill 288
 * probe points around one spot has bigger layout problems than this.
 */
export function findFreeGraphPosition(
  candidate: GraphPoint,
  taken: readonly GraphPoint[],
  minSeparation: number = MIN_NODE_SEPARATION,
): GraphPoint {
  const clashes = (p: GraphPoint) => taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < minSeparation)
  if (!clashes(candidate)) return candidate

  for (let ring = 1; ring <= 8; ring++) {
    const radius = minSeparation * ring
    const steps = 8 * ring
    for (let step = 0; step < steps; step++) {
      // Start at -90deg so the first probe is directly above the candidate,
      // then sweep clockwise — an added node appears where a reader's eye
      // already is rather than below the label of the thing it clashed with.
      const angle = -Math.PI / 2 + (step / steps) * Math.PI * 2
      const probe = { x: candidate.x + Math.cos(angle) * radius, y: candidate.y + Math.sin(angle) * radius }
      if (!clashes(probe)) return probe
    }
  }
  return candidate
}
