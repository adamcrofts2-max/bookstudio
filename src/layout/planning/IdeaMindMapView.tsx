import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Waypoints } from 'lucide-react'

import type { Idea, IdeaStatus } from '@/types/idea'

interface IdeaMindMapViewProps {
  ideas: Idea[]
  onSelect: (ideaId: string) => void
}

interface Point {
  x: number
  y: number
  vx: number
  vy: number
}

/** A node's fill — reuses the exact same semantic meaning
 * `STATUS_DOT_CLASS` in `IdeaInboxPanel.tsx` already gives each status in
 * List/Board, just as a paintable CSS var instead of a Tailwind class (SVG
 * `fill` doesn't take Tailwind's `bg-*` utilities). Keeping this in sync
 * with that map is the one thing to remember if a status is ever added. */
const STATUS_FILL_VAR: Record<IdeaStatus, string> = {
  new: 'var(--color-warning)',
  'in-progress': 'var(--color-accent)',
  used: 'var(--color-text-muted)',
  archived: 'var(--color-border)',
}

/** Only four real hues exist in this app's whole design system (accent/
 * success/warning/danger — see `src/index.css`) — deliberately not
 * inventing a bigger categorical palette just for this view, since that
 * would (a) break dark/light theme adaptation these four already get for
 * free, and (b) violate `CLAUDE.md`'s "don't invent ad-hoc values outside
 * [design] tokens." With more than four distinct tags in play, colours
 * repeat — the legend's text label is what actually disambiguates at that
 * point, colour is a secondary assist, not the only signal. */
const TAG_COLOR_VARS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)'] as const

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function tagColor(tag: string): string {
  return TAG_COLOR_VARS[hashString(tag) % TAG_COLOR_VARS.length]
}

interface Edge {
  a: string
  b: string
}

interface Layout {
  positions: Map<string, { x: number; y: number }>
  edges: Edge[]
  bounds: { minX: number; minY: number; width: number; height: number }
}

/**
 * A small hand-rolled force-directed layout — no graph/viz library: this
 * sandbox has no npm registry access at all (confirmed while scoping
 * Phase 93), so anything needing a new package simply isn't buildable here
 * regardless of merit. At the scale Ideas realistically reach (tens, maybe
 * a couple hundred), a plain O(n²) spring-embedder settles in well under a
 * frame's worth of time run synchronously — no need for a worker or
 * incremental animation.
 *
 * Deliberately does NOT draw an edge for every pair of ideas sharing a tag
 * — with even one popular tag on a dozen ideas that's dozens of crossing
 * lines, unreadable fast. Tags instead drive a cheap per-tag *centroid*
 * attraction each iteration (pull every same-tagged node toward the
 * average position of its tag-mates) — clustering shown through spatial
 * proximity and ring colour, not a literal line. Actual lines are reserved
 * for `relatedIdeaIds` — a deliberate "the author said these two are
 * connected" signal, which deserves to read as a real edge.
 */
function computeLayout(ideas: Idea[]): Layout {
  const points = new Map<string, Point>()
  const n = ideas.length
  ideas.forEach((idea, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    const radius = 180 + (i % 3) * 30 // slight stagger so a small set doesn't start in one perfect ring
    points.set(idea.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 })
  })

  const idSet = new Set(ideas.map((i) => i.id))
  const edges: Edge[] = []
  for (const idea of ideas) {
    for (const otherId of idea.relatedIdeaIds ?? []) {
      // `idea.id < otherId` keeps this a de-duplicated undirected edge list
      // even though `relatedIdeaIds` is stored on both sides (Phase Idea
      // System Milestone 1's own "kept in sync both directions" convention).
      if (idSet.has(otherId) && idea.id < otherId) edges.push({ a: idea.id, b: otherId })
    }
  }

  const iterations = n > 1 ? 240 : 0
  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion — every pair pushes apart, stronger at close range.
    for (let i = 0; i < ideas.length; i++) {
      const a = points.get(ideas[i].id)!
      for (let j = i + 1; j < ideas.length; j++) {
        const b = points.get(ideas[j].id)!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = Math.max(dx * dx + dy * dy, 1)
        const dist = Math.sqrt(distSq)
        const force = 5200 / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }
    // Edge spring — pulls explicitly-related ideas toward a comfortable rest length.
    for (const { a: aId, b: bId } of edges) {
      const a = points.get(aId)!
      const b = points.get(bId)!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - 130) * 0.02
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
    // Tag-cluster centroid attraction — cheap O(n), not O(n²): group by
    // each idea's first tag, pull each member toward that group's average
    // position rather than toward every other member individually.
    const centroids = new Map<string, { x: number; y: number; count: number }>()
    for (const idea of ideas) {
      const tag = idea.tags?.[0]
      if (!tag) continue
      const p = points.get(idea.id)!
      const c = centroids.get(tag) ?? { x: 0, y: 0, count: 0 }
      c.x += p.x
      c.y += p.y
      c.count += 1
      centroids.set(tag, c)
    }
    for (const idea of ideas) {
      const tag = idea.tags?.[0]
      if (!tag) continue
      const c = centroids.get(tag)!
      if (c.count < 2) continue
      const p = points.get(idea.id)!
      p.vx += (c.x / c.count - p.x) * 0.012
      p.vy += (c.y / c.count - p.y) * 0.012
    }
    // Centering — keeps the whole cluster from drifting off into space.
    for (const idea of ideas) {
      const p = points.get(idea.id)!
      p.vx += -p.x * 0.0025
      p.vy += -p.y * 0.0025
    }
    // Integrate with damping so the simulation actually settles.
    for (const idea of ideas) {
      const p = points.get(idea.id)!
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
  for (const idea of ideas) {
    const p = points.get(idea.id)!
    positions.set(idea.id, { x: p.x, y: p.y })
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
  const pad = 70
  return {
    positions,
    edges,
    bounds: { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 },
  }
}

const NODE_RADIUS = 20

/**
 * The Ideas mind-map view (Idea System Milestone 2, `docs/ROADMAP.md`) —
 * nodes are Ideas, coloured ring = shared tag (cluster), status dot fill
 * mirrors List/Board's own colour, lines are manual `relatedIdeaIds` links
 * only (see `computeLayout`'s doc comment for why tags cluster spatially
 * instead of drawing a line per shared tag). Click a node to open the same
 * `IdeaDetailDialog` List/Board already use — one detail surface for all
 * three views, not a fourth thing to maintain.
 *
 * Pan: drag the background. Zoom: scroll/pinch. Both are plain CSS
 * `transform` on the `<svg>` itself (not an SVG-space transform) so drag
 * deltas map 1:1 to screen pixels regardless of the fitted `viewBox`'s own
 * scale — the simpler of the two ways to implement this, and avoids a
 * whole class of "pan speed is wrong at some zoom levels" bugs.
 */
export function IdeaMindMapView({ ideas, onSelect }: IdeaMindMapViewProps) {
  const depKey = useMemo(
    () => ideas.map((i) => `${i.id}:${(i.tags ?? []).join(',')}:${(i.relatedIdeaIds ?? []).join(',')}`).join('|'),
    [ideas],
  )
  // Recomputed only when the actual ids/tags/relations change, not on every
  // unrelated re-render — otherwise the simulation would re-run (and every
  // node would visibly jump to a fresh layout) far more often than needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => computeLayout(ideas), [depKey])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Native, non-passive `wheel` listener — React's synthetic `onWheel`
  // attaches passively by default, so calling `preventDefault()` there
  // throws a console warning instead of actually stopping the page from
  // scrolling underneath the zoom.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setTransform((t) => ({ ...t, k: Math.min(2.5, Math.max(0.4, t.k - e.deltaY * 0.001)) }))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Separate from `dragState` (a ref, so mid-drag pointermove handling never
  // waits on a render) purely so the cursor can actually reflect "currently
  // dragging" — a ref mutation alone doesn't trigger a re-render, so without
  // this the grab/grabbing cursor swap would silently never show.
  const [isDragging, setIsDragging] = useState(false)

  const resetView = () => setTransform({ x: 0, y: 0, k: 1 })

  const onBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y }
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBackgroundPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState.current) return
    setTransform((t) => ({
      ...t,
      x: dragState.current!.origX + (e.clientX - dragState.current!.startX),
      y: dragState.current!.origY + (e.clientY - dragState.current!.startY),
    }))
  }
  const onBackgroundPointerUp = () => {
    dragState.current = null
    setIsDragging(false)
  }

  const tagsPresent = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const idea of ideas) {
      const tag = idea.tags?.[0]
      if (tag && !seen.has(tag)) {
        seen.add(tag)
        ordered.push(tag)
      }
    }
    return ordered
  }, [ideas])

  const hasAnyConnection = layout.edges.length > 0 || tagsPresent.length > 0

  if (ideas.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative h-[480px] w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-background-secondary"
      >
        <svg
          viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
          className="size-full touch-none select-none"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerLeave={onBackgroundPointerUp}
        >
          {layout.edges.map(({ a, b }) => {
            const pa = layout.positions.get(a)
            const pb = layout.positions.get(b)
            if (!pa || !pb) return null
            const highlighted = hoveredId === a || hoveredId === b
            return (
              <line
                key={`${a}-${b}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke="var(--color-accent)"
                strokeWidth={highlighted ? 2 : 1}
                strokeOpacity={highlighted ? 0.7 : 0.3}
              />
            )
          })}

          {ideas.map((idea) => {
            const p = layout.positions.get(idea.id)
            if (!p) return null
            const tag = idea.tags?.[0]
            const ring = tag ? tagColor(tag) : 'var(--color-border)'
            const isHovered = hoveredId === idea.id
            return (
              <g
                key={idea.id}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(idea.id)}
                onMouseEnter={() => setHoveredId(idea.id)}
                onMouseLeave={() => setHoveredId((v) => (v === idea.id ? null : v))}
                className="cursor-pointer"
              >
                <circle
                  r={isHovered ? NODE_RADIUS + 3 : NODE_RADIUS}
                  fill={STATUS_FILL_VAR[idea.status]}
                  stroke={ring}
                  strokeWidth={tag ? 3 : 1}
                  className="transition-[r] duration-150"
                />
                <foreignObject x={-52} y={NODE_RADIUS + 5} width={104} height={34}>
                  <div className="line-clamp-2 text-center text-[10px] leading-tight text-text-secondary" style={{ pointerEvents: 'none' }}>
                    {idea.text.trim() || '(empty)'}
                  </div>
                </foreignObject>
              </g>
            )
          })}
        </svg>

        <button
          type="button"
          onClick={resetView}
          aria-label="Reset view"
          title="Reset pan/zoom"
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-[var(--radius-button)] border border-border bg-panel text-text-secondary shadow-[var(--shadow-sm)] transition-colors hover:bg-hover hover:text-text-primary"
        >
          <Maximize2 className="size-3.5" />
        </button>

        {tagsPresent.length > 0 && (
          <div className="absolute bottom-2 left-2 flex max-w-[70%] flex-wrap items-center gap-1.5 rounded-[var(--radius-button)] border border-border bg-panel/90 px-2 py-1.5 backdrop-blur-sm">
            {tagsPresent.map((tag) => (
              <span key={tag} className="flex items-center gap-1 text-[11px] text-text-secondary">
                <span className="size-2 rounded-full" style={{ backgroundColor: tagColor(tag) }} />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {!hasAnyConnection && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Waypoints className="size-3.5" />
          Tag your ideas or link related ones (from an idea's detail view) to see clusters and connections here.
        </p>
      )}
    </div>
  )
}
