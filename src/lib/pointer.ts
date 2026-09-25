/**
 * Whether this device can drag-and-drop and hover at all.
 *
 * Used to suppress copy and affordances that only make sense with a mouse.
 * A phone has no drag source and no hover, so a "drag this onto that" hint
 * there is an instruction the reader cannot physically follow — which
 * shipped three separate times (the cover hint, the back-cover hint, the
 * author-photo hint) before `npm run audit:copy` started catching it.
 *
 * Its own module rather than living in `structuralPages/shared.tsx`: it is a
 * device fact, not a structural-page concern, and a non-component export in
 * a component module trips the `only-export-components` lint rule.
 *
 * Defaults to `true` outside a browser so server/test rendering never hides
 * desktop affordances by accident.
 */
export function canDragOnThisDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
