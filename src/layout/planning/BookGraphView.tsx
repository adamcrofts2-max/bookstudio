import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Waypoints } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/contentStore'
import { useLayer0Store } from '@/store/layer0Store'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
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

const CHAPTER_RADIUS = 24
const NODE_RADIUS = 16

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
 */
function computeGraphLayout(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const points = new Map<string, Point>()
  const n = nodes.length
  nodes.forEach((node, i) => {
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
      const c = centroids.get(node.kind)!
      if (c.count < 2) continue
      const p = points.get(node.id)!
      p.vx += (c.x / c.count - p.x) * 0.006
      p.vy += (c.y / c.count - p.y) * 0.006
    }
    for (const node of nodes) {
      const p = points.get(node.id)!
      p.vx += -p.x * 0.002
      p.vy += -p.y * 0.002
    }
    for (const node of nodes) {
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
  const pad = 80
  return { positions, bounds: { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 } }
}

/**
 * Book Graph (Idea System Milestone 3, `docs/ROADMAP.md`) — the mind-map
 * concept from `IdeaMindMapView.tsx` extended past Ideas to the whole book:
 * chapters, every Layer 0 entity kind, and Ideas, all in one connected,
 * icon-coded graph, filterable by kind. Built now at the user's explicit
 * request (2026-08-02: "map view should be better") rather than left gated
 * on "watch a first-time author's reaction to Milestone 2 first" — the
 * data-model prerequisite (`linkedChapterId` on every kind) shipped in
 * Phase 90, so this was always just the UI layer away.
 *
 * Node kind is legible from its icon alone (`graphIcons.ts`) — colour stays
 * reserved for the chapter/entity distinction (chapters get an accent ring,
 * everything else a neutral one), not an invented ten-colour categorical
 * palette, per `CLAUDE.md`'s design-token discipline. Edges are real
 * relationships only: an entity/idea's `linkedChapterId` (where it was
 * captured from, or was manually assigned, for Timeline Events), an idea's
 * `relatedIdeaIds`, and an idea's `promotedTo` (the entity it became). A
 * same-kind centroid attraction (see `computeGraphLayout`) loosely clusters
 * same-kind nodes spatially, so the whole graph reads as "regions of
 * characters / regions of locations" even before you look at a single icon.
 */
export function BookGraphView({ projectId, bookForm, onFocusKind }: BookGraphViewProps) {
  const chapters = useContentStore((s) => s.getManuscript(projectId))?.chapters ?? []
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const setAppMode = useUiStore((s) => s.setAppMode)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)

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

  const depKey = useMemo(
    () => visibleNodes.map((n) => n.id).join('|') + '::' + visibleEdges.map((e) => `${e.a}-${e.b}`).join('|'),
    [visibleNodes, visibleEdges],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => computeGraphLayout(visibleNodes, visibleEdges), [depKey])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

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
        <p className="text-sm text-text-secondary">Every chapter, entity, and idea, connected — click a kind below to hide or show it.</p>
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
          viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
          className="size-full touch-none select-none"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerLeave={onBackgroundPointerUp}
        >
          {visibleEdges.map(({ a, b }) => {
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
                strokeOpacity={highlighted ? 0.7 : 0.28}
              />
            )
          })}

          {visibleNodes.map((node) => {
            const p = layout.positions.get(node.id)
            if (!p) return null
            const Icon = GRAPH_NODE_ICONS[node.kind]
            const isChapter = node.kind === 'chapter'
            const isHovered = hoveredId === node.id
            const r = isChapter ? CHAPTER_RADIUS : NODE_RADIUS
            return (
              <g
                key={node.id}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleSelect(node)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId((v) => (v === node.id ? null : v))}
                className="cursor-pointer"
              >
                <circle
                  r={isHovered ? r + 3 : r}
                  fill={isChapter ? 'var(--color-accent)' : 'var(--color-panel)'}
                  fillOpacity={isChapter ? 0.12 : 1}
                  stroke={isChapter ? 'var(--color-accent)' : 'var(--color-border)'}
                  strokeWidth={isChapter ? 2 : 1.5}
                  className="transition-[r] duration-150"
                />
                <foreignObject x={-9} y={-9} width={18} height={18} style={{ pointerEvents: 'none' }}>
                  <Icon
                    className="size-[18px]"
                    style={{ color: isChapter ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
                  />
                </foreignObject>
                <foreignObject x={-56} y={r + 5} width={112} height={34}>
                  <div className="line-clamp-2 text-center text-[10px] leading-tight text-text-secondary" style={{ pointerEvents: 'none' }}>
                    {node.label}
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
      </div>

      {selectedIdeaId && (
        <IdeaDetailDialog projectId={projectId} ideaId={selectedIdeaId} open onOpenChange={(open) => !open && setSelectedIdeaId(null)} />
      )}
    </div>
  )
}
