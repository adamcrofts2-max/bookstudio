/**
 * The Book Graph's hand-rolled force-directed layout — pulled out of
 * `BookGraphView.tsx` (Phase 108, 2026-08-02) into its own dependency-free
 * module so the exact same algorithm can run either on the main thread or
 * inside `graphLayout.worker.ts`, with zero risk of the two drifting apart.
 *
 * Generalised from `IdeaMindMapView.tsx`'s original version (same no-graph-
 * library constraint — this sandbox has no npm registry access, confirmed
 * while scoping Phase 93/94). Nodes carry a `kind` string, so the cheap
 * per-group centroid attraction clusters same-kind nodes near each other
 * (all Characters drift together, etc.) — see `computeGraphLayout`'s own
 * comment for the physics themselves.
 *
 * Deliberately typed narrower than `BookGraphView.tsx`'s own `GraphNode`/
 * `GraphEdge` (which also carry `label`/`sequence`/a specific `GraphNodeKind`
 * union) — this module only ever reads `id`/`kind`/`a`/`b`, so it accepts
 * anything structurally compatible rather than importing UI-layer types into
 * a pure computation module.
 */

export interface LayoutNode {
  id: string
  kind: string
}

export interface LayoutEdge {
  a: string
  b: string
}

interface Point {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Layout {
  positions: Map<string, { x: number; y: number }>
  bounds: { minX: number; minY: number; width: number; height: number }
}

/**
 * `pinned` is Phase 98's addition (user, 2026-08-02: "they should be
 * dragable on the page to make a mind map") — a node the user has manually
 * dragged is excluded from position *integration* every iteration (it never
 * moves on its own) but still fully participates in the physics otherwise:
 * it still repels every other node and still pulls its edge-connected
 * neighbours toward it. That's what makes this a real mind map rather than
 * just a fixed auto-layout with an escape hatch — drag the two or three
 * nodes that matter into place, and everything else still arranges itself
 * sensibly around them instead of ignoring them.
 *
 * Profiled 2026-08-02 (docs/ROADMAP.md's long-deferred "Book Graph layout-
 * performance profiling" item): a single call at "100+ chapter novel with a
 * full Layer 0 bible" scale (~340 nodes) takes ~180-290ms; a stress case
 * (~510 nodes) takes ~440ms. Both are squarely into "blocks the main thread
 * long enough to feel like a freeze" territory — confirming the lag that
 * item speculated about but never measured, rather than leaving it an
 * unconfirmed worry. The fix wasn't changing this algorithm (still O(n²) per
 * iteration × 260 iterations, unchanged) — it was moving the exact same call
 * off the main thread into `graphLayout.worker.ts`, so the numbers stay
 * identical and only *where* they run changed. See that file and
 * `BookGraphView.tsx`'s layout-effect for the async wiring.
 */
export function computeGraphLayout(nodes: LayoutNode[], edges: LayoutEdge[], pinned: Map<string, { x: number; y: number }>): Layout {
  const points = new Map<string, Point>()
  const n = nodes.length
  nodes.forEach((node, i) => {
    const fixed = pinned.get(node.id)
    if (fixed) {
      points.set(node.id, { x: fixed.x, y: fixed.y, vx: 0, vy: 0 })
      return
    }
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    const radius = 200 + (i % 3) * 35
    points.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 })
  })

  const iterations = n > 1 ? 260 : 0
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = points.get(nodes[i].id)!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = points.get(nodes[j].id)!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = Math.max(dx * dx + dy * dy, 1)
        const dist = Math.sqrt(distSq)
        const force = 6000 / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }
    for (const { a: aId, b: bId } of edges) {
      const a = points.get(aId)
      const b = points.get(bId)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - 150) * 0.018
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
    const centroids = new Map<string, { x: number; y: number; count: number }>()
    for (const node of nodes) {
      const p = points.get(node.id)!
      const c = centroids.get(node.kind) ?? { x: 0, y: 0, count: 0 }
      c.x += p.x
      c.y += p.y
      c.count += 1
      centroids.set(node.kind, c)
    }
    for (const node of nodes) {
      if (pinned.has(node.id)) continue
      const c = centroids.get(node.kind)!
      if (c.count < 2) continue
      const p = points.get(node.id)!
      p.vx += (c.x / c.count - p.x) * 0.006
      p.vy += (c.y / c.count - p.y) * 0.006
    }
    for (const node of nodes) {
      if (pinned.has(node.id)) continue
      const p = points.get(node.id)!
      p.vx += -p.x * 0.002
      p.vy += -p.y * 0.002
    }
    for (const node of nodes) {
      if (pinned.has(node.id)) continue
      const p = points.get(node.id)!
      p.vx *= 0.82
      p.vy *= 0.82
      p.x += p.vx
      p.y += p.vy
    }
  }

  const positions = new Map<string, { x: number; y: number }>()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const p = points.get(node.id)!
    positions.set(node.id, { x: p.x, y: p.y })
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  if (!isFinite(minX)) {
    minX = -140
    maxX = 140
    minY = -140
    maxY = 140
  }
  const pad = 90
  return { positions, bounds: { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 } }
}
