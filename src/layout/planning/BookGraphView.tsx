import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, RotateCcw, Waypoints } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/contentStore'
import { useLayer0Store } from '@/store/layer0Store'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useGraphLayoutStore } from '@/store/graphLayoutStore'
import { EmptyState } from '@/components/common/EmptyState'
import { IdeaDetailDialog } from '@/layout/planning/IdeaDetailDialog'
import { GRAPH_NODE_ICONS, type GraphNodeKind } from '@/layout/planning/graphIcons'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_TO_COLLECTION, getLayer0KindLabel, type Layer0EntityKind } from '@/types/layer0'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import type { BookForm } from '@/types'

interface BookGraphViewProps {
  projectId: string
  bookForm?: BookForm
  /** Clicking a Layer 0 entity node switches `PlanningShell`'s nav to that
   * entity's own list — the graph doesn't grow its own inline edit surface;
   * "find and edit it properly" is one click away in the place that already
   * has the full form. */
  onFocusKind: (kind: Layer0EntityKind) => void
}

interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
}

interface GraphEdge {
  a: string
  b: string
}

interface Point {
  x: number
  y: number
  vx: number
  vy: number
}

interface Layout {
  positions: Map<string, { x: number; y: number }>
  bounds: { minX: number; minY: number; width: number; height: number }
}

/** Every kind order the graph's legend/filter row presents, in — chapters
 * first (the spine everything else hangs off), then the eight Layer 0 kinds
 * in their canonical order, Ideas last (the least "settled" kind, most
 * likely to still be loose ends). */
const GRAPH_KIND_ORDER: GraphNodeKind[] = ['chapter', ...LAYER0_ENTITY_KINDS, 'idea']

/** A pointer that moved less than this many screen pixels between down and
 * up is a click, not a drag — the standard "click vs. drag" threshold every
 * draggable-canvas tool uses (Miro, Figma, etc.), so a quick tap to open a
 * node still works reliably even though the same pointer-down also arms a
 * potential drag. */
const DRAG_THRESHOLD_PX = 4

const CHAPTER_RADIUS = 28
const NODE_RADIUS = 22

/**
 * A hand-rolled force-directed layout generalised from `IdeaMindMapView.tsx`'s
 * (same no-graph-library constraint — this sandbox has no npm registry
 * access, confirmed while scoping Phase 93/94). Two differences from that
 * one: nodes carry a `kind` instead of `tags`, so the cheap per-group
 * centroid attraction clusters by *kind* (all Characters drift near each
 * other) rather than by tag, and every edge here is a real, meaningful
 * connection (chapter links, related ideas, promotions) — never a stand-in
 * for "shares a tag" — so every edge here is drawn as a line, no separate
 * "cluster vs. line" distinction needed.
 *
 * `pinned` is Phase 98's addition (user, 2026-08-02: "they should be
 * dragable on the page to make a mind map") — a node the user has manually
 * dragged is excluded from position *integration* every iteration (it never
 * moves on its own) but still fully participates in the physics otherwise:
 * it still repels every other node and still pulls its edge-connected
 * neighbours toward it. That's what makes this a real mind map rather than
 * just a fixed auto-layout with an escape hatch — drag the two or three
 * nodes that matter into place, and everything else still arranges itself
 * sensibly around them instead of ignoring them.
 */
function computeGraphLayout(nodes: GraphNode[], edges: GraphEdge[], pinned: Map<string, { x: number; y: number }>): Layout {
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
    const centroids = new Map<GraphNodeKind, { x: number; y: number; count: number }>()
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

/** Converts a pointer event's screen coordinates into the SVG's own user-
 * space (the same coordinate system `node.x`/`node.y` live in), accounting
 * for both the `viewBox` and the CSS `transform: translate(...) scale(...)`
 * pan/zoom already applied to the element — `getScreenCTM()` folds in every
 * transform between the element and the screen, so this stays correct at
 * any zoom level without hand-deriving the math. */
function screenToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = pt.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}

/**
 * Book Graph (Idea System Milestone 3, `docs/ROADMAP.md`) — the mind-map
 * concept from `IdeaMindMapView.tsx` extended past Ideas to the whole book:
 * chapters, every Layer 0 entity kind, and Ideas, all in one connected,
 * icon-coded graph, filterable by kind, and — as of Phase 98 — a real mind
 * map you can rearrange by hand, not just a fixed auto-layout. Built at the
 * user's explicit request ("map view should be better... they should be
 * dragable on the page to make a mind map") rather than left gated on
 * "watch a first-time author's reaction to Milestone 2 first."
 *
 * Every node is an icon-in-a-circle badge (`graphIcons.ts`'s per-kind icon)
 * — kind is legible from the icon alone, colour stays reserved for the
 * chapter/entity distinction (chapters get a larger, accent-ringed circle
 * as the graph's spine; everything else shares one neutral ring), not an
 * invented ten-colour categorical palette, per `CLAUDE.md`'s design-token
 * discipline. Edges are real relationships only: an entity/idea's
 * `linkedChapterId`, an idea's `relatedIdeaIds`, and an idea's `promotedTo`.
 */
export function BookGraphView({ projectId, bookForm, onFocusKind }: BookGraphViewProps) {
  const chapters = useContentStore((s) => s.getManuscript(projectId))?.chapters ?? []
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const setAppMode = useUiStore((s) => s.setAppMode)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)
  const savedPositions = useGraphLayoutStore((s) => s.getPositions(projectId))
  const setSavedPosition = useGraphLayoutStore((s) => s.setPosition)
  const clearSavedPositions = useGraphLayoutStore((s) => s.clearPositions)

  const [hiddenKinds, setHiddenKinds] = useState<Set<GraphNodeKind>>(new Set())
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)

  const { allNodes, allEdges, countByKind } = useMemo(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()
    const count: Partial<Record<GraphNodeKind, number>> = {}

    for (const chapter of chapters) {
      nodes.push({ id: chapter.id, kind: 'chapter', label: chapter.title || 'Untitled chapter' })
      nodeIds.add(chapter.id)
      count.chapter = (count.chapter ?? 0) + 1
    }

    for (const kind of LAYER0_ENTITY_KINDS) {
      const collection = LAYER0_KIND_TO_COLLECTION[kind]
      const primaryKey = LAYER0_FORM_CONFIG[kind].primaryKey
      const entities = bible[collection] as unknown as (Record<string, unknown> & { id: string; linkedChapterId?: string })[]
      for (const entity of entities) {
        nodes.push({ id: entity.id, kind, label: (entity[primaryKey] as string | undefined)?.trim() || 'Untitled' })
        nodeIds.add(entity.id)
        count[kind] = (count[kind] ?? 0) + 1
        if (entity.linkedChapterId && nodeIds.has(entity.linkedChapterId)) {
          edges.push({ a: entity.id, b: entity.linkedChapterId })
        }
      }
    }

    for (const idea of ideas) {
      nodes.push({ id: idea.id, kind: 'idea', label: idea.text.trim() || '(empty)' })
      nodeIds.add(idea.id)
      count.idea = (count.idea ?? 0) + 1
      if (idea.linkedChapterId && nodeIds.has(idea.linkedChapterId)) {
        edges.push({ a: idea.id, b: idea.linkedChapterId })
      }
      for (const otherId of idea.relatedIdeaIds ?? []) {
        if (idea.id < otherId) edges.push({ a: idea.id, b: otherId })
      }
      if (idea.promotedTo) {
        edges.push({ a: idea.id, b: idea.promotedTo.entityId })
      }
    }

    // Second pass for chapter links above already required both ends
    // present via `linkedChapterId`/`nodeIds.has` checks — `promotedTo` and
    // `relatedIdeaIds` are added optimistically above since their target may
    // not have been visited yet in single-pass order; drop any edge whose
    // far end never actually turned up as a node (e.g. a promoted entity
    // since deleted).
    const validEdges = edges.filter((e) => nodeIds.has(e.a) && nodeIds.has(e.b))

    return { allNodes: nodes, allEdges: validEdges, countByKind: count }
  }, [chapters, bible, ideas])

  const visibleNodes = useMemo(() => allNodes.filter((n) => !hiddenKinds.has(n.kind)), [allNodes, hiddenKinds])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => allEdges.filter((e) => visibleIds.has(e.a) && visibleIds.has(e.b)), [allEdges, visibleIds])

  const pinnedPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of visibleNodes) {
      const saved = savedPositions[node.id]
      if (saved) map.set(node.id, saved)
    }
    return map
  }, [visibleNodes, savedPositions])

  const depKey = useMemo(
    () =>
      visibleNodes.map((n) => n.id).join('|') +
      '::' +
      visibleEdges.map((e) => `${e.a}-${e.b}`).join('|') +
      '::' +
      Array.from(pinnedPositions.entries())
        .map(([id, p]) => `${id}:${Math.round(p.x)}:${Math.round(p.y)}`)
        .join('|'),
    [visibleNodes, visibleEdges, pinnedPositions],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => computeGraphLayout(visibleNodes, visibleEdges, pinnedPositions), [depKey])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Live drag-in-progress position for whichever node is currently being
  // dragged — kept as its own bit of state (not written into
  // `graphLayoutStore` until pointer-up) so every intermediate frame is a
  // cheap re-render, not a store write + full layout recompute.
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const nodeDragState = useRef<{ nodeId: string; offsetX: number; offsetY: number; startClientX: number; startClientY: number; moved: boolean } | null>(
    null,
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setTransform((t) => ({ ...t, k: Math.min(2.5, Math.max(0.35, t.k - e.deltaY * 0.001)) }))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const resetView = () => setTransform({ x: 0, y: 0, k: 1 })
  const resetLayout = () => clearSavedPositions(projectId)

  const onBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    panState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y }
    setIsPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBackgroundPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panState.current) return
    setTransform((t) => ({
      ...t,
      x: panState.current!.origX + (e.clientX - panState.current!.startX),
      y: panState.current!.origY + (e.clientY - panState.current!.startY),
    }))
  }
  const onBackgroundPointerUp = () => {
    panState.current = null
    setIsPanning(false)
  }

  function onNodePointerDown(e: React.PointerEvent<SVGGElement>, node: GraphNode) {
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const svgPoint = screenToSvgPoint(svg, e.clientX, e.clientY)
    const current = layout.positions.get(node.id) ?? { x: 0, y: 0 }
    nodeDragState.current = {
      nodeId: node.id,
      offsetX: svgPoint.x - current.x,
      offsetY: svgPoint.y - current.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    setDraggingNodeId(node.id)
    setDragPosition(current)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onNodePointerMove(e: React.PointerEvent<SVGGElement>) {
    const drag = nodeDragState.current
    if (!drag || drag.nodeId !== draggingNodeId) return
    const svg = svgRef.current
    if (!svg) return
    const dxScreen = e.clientX - drag.startClientX
    const dyScreen = e.clientY - drag.startClientY
    if (Math.abs(dxScreen) > DRAG_THRESHOLD_PX || Math.abs(dyScreen) > DRAG_THRESHOLD_PX) drag.moved = true
    const svgPoint = screenToSvgPoint(svg, e.clientX, e.clientY)
    setDragPosition({ x: svgPoint.x - drag.offsetX, y: svgPoint.y - drag.offsetY })
  }

  function onNodePointerUp(e: React.PointerEvent<SVGGElement>, node: GraphNode) {
    const drag = nodeDragState.current
    nodeDragState.current = null
    setDraggingNodeId(null)
    if (drag && drag.nodeId === node.id && drag.moved && dragPosition) {
      setSavedPosition(projectId, node.id, dragPosition)
    } else {
      // Never actually moved past the threshold — a click, not a drag.
      handleSelect(node)
    }
    setDragPosition(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Pointer capture may already have been released — harmless either way.
    }
  }

  function toggleKind(kind: GraphNodeKind) {
    setHiddenKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  function handleSelect(node: GraphNode) {
    if (node.kind === 'chapter') {
      setAppMode('editor')
      requestScrollToChapter(node.id)
      return
    }
    if (node.kind === 'idea') {
      setSelectedIdeaId(node.id)
      return
    }
    onFocusKind(node.kind)
  }

  function kindLabel(kind: GraphNodeKind): string {
    if (kind === 'chapter') return 'Chapters'
    if (kind === 'idea') return 'Ideas'
    return getLayer0KindLabel(kind, bookForm).plural
  }

  if (allNodes.length === 0) {
    return (
      <EmptyState
        icon={Waypoints}
        title="Nothing to graph yet"
        description="Add chapters, Characters, Locations, or Ideas — this view connects them automatically as they link to each other."
        className="mt-10"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Book Graph</h2>
        <p className="text-sm text-text-secondary">
          Every chapter, entity, and idea, connected — drag a node to arrange your own mind map, or click one to open it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {GRAPH_KIND_ORDER.filter((kind) => (countByKind[kind] ?? 0) > 0).map((kind) => {
          const Icon = GRAPH_NODE_ICONS[kind]
          const hidden = hiddenKinds.has(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                hidden ? 'border-border text-text-muted' : 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
              )}
            >
              <Icon className="size-3" />
              {kindLabel(kind)} ({countByKind[kind]})
            </button>
          )
        })}
      </div>

      <div
        ref={containerRef}
        className="relative h-[560px] w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-background-secondary"
      >
        <svg
          ref={svgRef}
          viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
          className="size-full touch-none select-none"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, cursor: isPanning ? 'grabbing' : 'grab' }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerLeave={onBackgroundPointerUp}
        >
          {visibleEdges.map(({ a, b }) => {
            const pa = a === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(a)
            const pb = b === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(b)
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
                strokeOpacity={highlighted ? 0.7 : 0.28}
              />
            )
          })}

          {visibleNodes.map((node) => {
            const p = node.id === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(node.id)
            if (!p) return null
            const Icon = GRAPH_NODE_ICONS[node.kind]
            const isChapter = node.kind === 'chapter'
            const isHovered = hoveredId === node.id
            const isPinned = pinnedPositions.has(node.id)
            const r = isChapter ? CHAPTER_RADIUS : NODE_RADIUS
            const iconSize = isChapter ? 24 : 20
            return (
              <g
                key={node.id}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => onNodePointerDown(e, node)}
                onPointerMove={onNodePointerMove}
                onPointerUp={(e) => onNodePointerUp(e, node)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId((v) => (v === node.id ? null : v))}
                className={node.id === draggingNodeId ? 'cursor-grabbing' : 'cursor-grab'}
              >
                <circle
                  r={isHovered || node.id === draggingNodeId ? r + 3 : r}
                  fill={isChapter ? 'var(--color-accent)' : 'var(--color-panel)'}
                  fillOpacity={isChapter ? 0.14 : 1}
                  stroke={isChapter ? 'var(--color-accent)' : 'var(--color-border)'}
                  strokeWidth={isChapter ? 2.5 : isPinned ? 2 : 1.5}
                  strokeDasharray={isPinned && !isChapter ? '3,2' : undefined}
                  className="transition-[r] duration-150"
                />
                <foreignObject x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} style={{ pointerEvents: 'none' }}>
                  <Icon className="size-full" style={{ color: isChapter ? 'var(--color-accent)' : 'var(--color-text-secondary)' }} />
                </foreignObject>
                <foreignObject x={-60} y={r + 6} width={120} height={34} style={{ pointerEvents: 'none' }}>
                  <div className="line-clamp-2 text-center text-[10px] leading-tight text-text-secondary">{node.label}</div>
                </foreignObject>
              </g>
            )
          })}
        </svg>

        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            onClick={resetLayout}
            aria-label="Reset layout"
            title="Clear manual positions and re-arrange automatically"
            className="flex size-7 items-center justify-center rounded-[var(--radius-button)] border border-border bg-panel text-text-secondary shadow-[var(--shadow-sm)] transition-colors hover:bg-hover hover:text-text-primary"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset view"
            title="Reset pan/zoom"
            className="flex size-7 items-center justify-center rounded-[var(--radius-button)] border border-border bg-panel text-text-secondary shadow-[var(--shadow-sm)] transition-colors hover:bg-hover hover:text-text-primary"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
      </div>

      {selectedIdeaId && (
        <IdeaDetailDialog projectId={projectId} ideaId={selectedIdeaId} open onOpenChange={(open) => !open && setSelectedIdeaId(null)} />
      )}
    </div>
  )
}
