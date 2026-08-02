import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Maximize2, Minus, Plus, RotateCcw, Search, Waypoints, X, ZoomIn, ZoomOut } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/contentStore'
import { useLayer0Store } from '@/store/layer0Store'
import { useIdeaStore, EMPTY_IDEAS } from '@/store/ideaStore'
import { useUiStore } from '@/store/uiStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useGraphLayoutStore } from '@/store/graphLayoutStore'
import { addLayer0EntityWithHistory } from '@/store/editorActions'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IdeaDetailDialog } from '@/layout/planning/IdeaDetailDialog'
import { GRAPH_NODE_ICONS, type GraphNodeKind } from '@/layout/planning/graphIcons'
import type { Layout } from '@/layout/planning/graphLayoutEngine'
import LayoutWorker from '@/layout/planning/graphLayout.worker?worker'
import { LAYER0_ENTITY_KINDS, LAYER0_KIND_TO_COLLECTION, getLayer0KindLabel, type Layer0EntityKind } from '@/types/layer0'
import { LAYER0_FORM_CONFIG } from '@/layout/planning/layer0FormConfig'
import { extractTextSpans } from '@/virtualEditor/textExtract'
import { wordCount } from '@/utils/format'
import { generateId } from '@/utils'
import type { BookForm } from '@/types'

interface BookGraphViewProps {
  projectId: string
  bookForm?: BookForm
  /** The project's own title — used as the label on the central "Book" hub
   * node (Phase 99, user 2026-08-02: "in the center should be the book?"). */
  bookTitle: string
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
  /** Present only for edges sourced from `Layer0Relationship` — rendered as
   * a small captioned pill at the edge's midpoint (e.g. "mother / daughter",
   * user 2026-08-02). Every other edge kind (chapter links, related ideas,
   * promotions, the book's own spine to each chapter) stays a plain
   * unlabeled line, exactly as before. */
  label?: string
  /** True for a chapter→next-chapter edge (Phase 105, user 2026-08-02:
   * "should chapters link in order"). `a` is always the earlier chapter,
   * `b` the one right after it — direction matters here (unlike every other
   * edge kind, which is symmetric), so it's rendered with an arrowhead
   * rather than a plain line. See the doc comment above `BookGraphView`. */
  sequence?: boolean
}

/** Sentinel id for the synthetic "Book" hub node — deliberately not a real
 * entity/chapter id (those all come from `generateId(prefix)`, which always
 * contains an underscore-joined prefix + random suffix and never produces
 * this exact literal), so it can never collide with a real node. */
const BOOK_NODE_ID = '__book__'

/** Every kind order the graph's legend/filter row presents, in — chapters
 * first (the spine everything else hangs off), then the eight Layer 0 kinds
 * in their canonical order, Ideas last (the least "settled" kind, most
 * likely to still be loose ends). */
const GRAPH_KIND_ORDER: GraphNodeKind[] = ['chapter', ...LAYER0_ENTITY_KINDS, 'idea']

/** A pointer that moved less than this many screen pixels between down and
 * up is a click, not a drag — the standard "click vs. drag" threshold every
 * draggable-canvas tool uses (Miro, Figma, etc.), so a quick tap to open a
 * node still works reliably even though the same pointer-down also arms a
 * potential drag. Also used to tell a background "click" (deselect / cancel
 * a pending connection) from a background "drag" (pan) — see
 * `onBackgroundPointerUp` below. */
const DRAG_THRESHOLD_PX = 4

const BOOK_RADIUS = 40
const CHAPTER_RADIUS = 28
const NODE_RADIUS = 22

/** Node-size multiplier range (Phase 102, user 2026-08-02: "make each node
 * larger/smaller") — wide enough to matter (70% reads noticeably denser,
 * 160% noticeably roomier) without ever shrinking a node's icon past
 * legibility or ballooning it into overlap-guaranteed territory. */
const NODE_SCALE_MIN = 0.7
const NODE_SCALE_MAX = 1.6
const NODE_SCALE_STEP = 0.15

const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.15

/** Stable empty fallbacks for the per-node colour/size maps — same reason
 * `graphLayoutStore.ts`'s own `EMPTY_POSITIONS` exists: a fresh `{}` literal
 * on every selector call would be a new reference every render, which
 * defeats Zustand's default `Object.is` equality check and re-renders this
 * whole (potentially 100+ node) view on every unrelated store change. */
const EMPTY_NODE_COLORS: Record<string, string> = {}
const EMPTY_NODE_SIZES: Record<string, number> = {}

/** Native `<input type="color">` needs *some* starting hex value even
 * before a user has picked one — this is only ever the picker's opening
 * position, not a claim about what the node currently renders as (that's
 * still the kind's own accent/neutral colour until an override is set).
 * Matches `--accent`'s light-theme value in `index.css`. */
const DEFAULT_COLOR_SWATCH = '#4f8a5b'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
 * icon-coded graph, filterable by kind, a real mind map you can rearrange by
 * hand (Phase 98), and — as of Phase 102 (this pass, user 2026-08-02: "make
 * book graph better, should be able to zoom in zoom out, make each node
 * larger/smaller, connect easily by clicking one node to another") —
 * zoomable with visible controls, resizable nodes, and click-to-connect
 * relationship creation, all backed by one right-hand panel instead of a
 * scatter of overlay widgets.
 *
 * **Interaction model, decided this pass** (the user also pasted a
 * professional-UX-review mockup and asked several direct design questions —
 * answered here, in the code, rather than only in chat, so the reasoning
 * survives):
 *
 * - *Chapter-centric by default* — yes, already true structurally (every
 *   chapter chains back to the central Book node, Phase 99/106) and
 *   reinforced here: chapters keep the largest non-book radius and the
 *   accent fill, so the
 *   manuscript's spine reads as the graph's backbone at a glance even before
 *   anything is clicked.
 * - *Selecting a node shows its direct connections; the panel shows details;
 *   nothing selected shows book-wide stats* — implemented exactly as asked.
 *   `selectedNodeId` drives a dim-everything-else focus effect (see the node/
 *   edge render loops below), and the right panel is single-purpose per
 *   state: a node selected → that node's details + connection list; nothing
 *   selected (or the Book node itself clicked) → whole-book stats. One panel,
 *   one job at a time — not a fixed-layout dashboard with empty sections.
 * - *What was simplified* — the old model was "single click always
 *   immediately navigates away" (to the editor / Develop / an Idea dialog).
 *   That's fast for a *known* graph but actively hostile to a *first look* at
 *   an unfamiliar or 100-chapter one: every exploratory click was a full
 *   context switch away from the graph. Click now selects (cheap, reversible,
 *   answers "what is this and what does it touch"); the panel's explicit
 *   "Open" button (or a double-click, kept as the power-user accelerator for
 *   anyone with the old muscle memory) is the deliberate, second action that
 *   actually navigates away.
 * - *Missing features worth adding* — zoom controls with a visible
 *   percentage (wheel-zoom existed but was undiscoverable — nothing on
 *   screen even hinted a graph this size could be zoomed), a node-size
 *   control (small clusters want big legible nodes, a 100-chapter graph
 *   wants small dense ones — one project's right answer isn't another's), and
 *   click-to-connect (a labeled relationship previously required leaving the
 *   graph for the entity's own edit dialog, which is backwards for a tool
 *   whose entire premise is "connect things visually").
 * - *Deliberately not built* — a minimap (the mockup shows one). Reasonable
 *   at real scale, but this graph's `viewBox` already auto-fits every node
 *   into view any time the pan/zoom is reset (see "Reset view" below), which
 *   covers the minimap's actual job — "where am I relative to everything" —
 *   for the sizes this app targets (tens, not thousands, of nodes). Flagged
 *   in `docs/ROADMAP.md` as a real candidate if a genuinely huge project ever
 *   makes "reset view" an unsatisfying answer, rather than built speculatively
 *   now. Likewise no inline editing inside the graph itself (title, notes,
 *   fields) — the panel shows and links out, it never becomes a second copy
 *   of `EntityListPanel`'s form; one editing surface per field stays true.
 *
 * Every node is an icon-in-a-circle badge (`graphIcons.ts`'s per-kind icon)
 * — kind is legible from the icon alone, colour stays reserved for the
 * chapter/entity distinction (chapters get a larger, accent-ringed circle
 * as the graph's spine; everything else shares one neutral ring), not an
 * invented ten-colour categorical palette, per `CLAUDE.md`'s design-token
 * discipline. Edges are real relationships only: an entity/idea's
 * `linkedChapterId`, an idea's `relatedIdeaIds`, an idea's `promotedTo`, and
 * user-authored `Layer0Relationship`s (from here, or from the entity's own
 * edit dialog — both write the same underlying record).
 *
 * **Phase 103 additions** (user, 2026-08-02: "change colour of individual
 * nodes and make individual nodes larger and smaller. And connect chapters
 * to nodes. Primary and secondary nodes?"):
 *
 * - *Per-node colour and size* — `graphLayoutStore.ts`'s `nodeColorByProject`
 *   / `nodeSizeByProject`, editable from the node detail panel once
 *   something is selected. Size stacks with Phase 102's *global* node-size
 *   control (`finalRadius = kindBaseRadius * globalScale * perNodeSize`),
 *   it doesn't replace it — the global control is "the whole graph reads
 *   too dense/sparse," the per-node one is "this specific character matters
 *   more than that one."
 * - *"Primary and secondary nodes?"* — deliberately answered with the
 *   per-node size control above, not a new boolean/tag field. A dedicated
 *   `isPrimary` flag would need its own UI, its own meaning to define
 *   (bigger? bolder? a badge?), and would inevitably just end up meaning
 *   "render this one bigger" anyway — which the resize control already
 *   does, today, for any reason a user has, not just protagonist-vs-
 *   minor-character. One mechanism, not two that overlap.
 * - *Chapters are connectable* — click-to-connect (Phase 102) never actually
 *   excluded chapters (only the synthetic Book node), but
 *   `Layer0RelationshipsSection.tsx`'s dialog-based "Connect to…" dropdown
 *   did — an inconsistency between the graph's own connect flow and the
 *   entity-dialog's, now closed by adding chapters to that picker too. Both
 *   entry points write the same `Layer0Relationship` record either way.
 * - *A node's existing "role" surfaces automatically* — `LAYER0_FORM_CONFIG`
 *   already has a per-kind `secondaryKey` (Character's is literally called
 *   `role`, free text like "Protagonist" or "mentor" — exactly what the
 *   pasted mockup showed as a subtitle under each character). The detail
 *   panel shows it next to the kind label ("Character · Protagonist") when
 *   set. No new field, no new form — this was already-entered data with
 *   nowhere to show inside the graph itself until now.
 * - *Node search* — a "find a node" box pinned at the top of the right
 *   panel (not the crowded top toolbar row) that dims every non-matching
 *   node/edge, reusing the exact same dim/highlight mechanism selection
 *   already uses. Aimed squarely at the "100-chapter novel" scalability
 *   case from the earlier design review: visually finding one specific
 *   character among a hundred nodes by scanning alone stops working well
 *   before search does.
 *
 * **Phase 105** (user, 2026-08-02: "should chapters link in order in the
 * book graph"):
 *
 * - *Yes* — chapters now connect to each other in reading order, not just
 *   to the Book hub. This is a genuine second edge, not a restyled spine:
 *   a chapter was previously only ever pulled toward the Book in the force
 *   layout, so its position relative to *other chapters* was arbitrary
 *   (whatever the initial angle/iteration happened to settle on). The
 *   sequence edges feed the same edge-spring physics every edge already
 *   uses, so the layout now also pulls each chapter toward its neighbours
 *   — the auto-arrangement itself gets better, not just the information
 *   on screen. Rendered distinctly (thin, muted, arrowheaded) from the
 *   spine (thick accent) and relationships (dashed, labeled) so three edge
 *   kinds stay visually unambiguous — see the new one-line legend under
 *   the header. Chapter node labels also gained a number prefix ("1. The
 *   Whispering Forest") so order reads instantly even without tracing an
 *   edge, which matters once a book has enough chapters that scanning
 *   layout position alone stops being reliable.
 * - *Considered and left alone*: forcing chapters into a literal straight
 *   line/timeline layout instead of the free-form force graph. Rejected —
 *   it would fight the "drag anywhere to build your own mind map" premise
 *   this whole view is built on (Phase 98), and a straight timeline is
 *   already exactly what the Chapters sidebar list is for. The sequence
 *   edges give order *within* the mind map without turning the mind map
 *   into a second, worse copy of the sidebar.
 * - *Considered and deferred, not built*: the force layout is O(n²) per
 *   iteration × 260 iterations, recomputed on most graph-shape changes.
 *   Fine at today's scale (tested reasoning only, not profiled against a
 *   real 100+ chapter project with a full Layer 0 bible) but a real
 *   candidate to eventually need a Web Worker or an incremental layout
 *   instead of a synchronous main-thread recompute. Flagged in
 *   `docs/ROADMAP.md` rather than pre-optimised against a problem not yet
 *   confirmed to exist.
 */
export function BookGraphView({ projectId, bookForm, bookTitle, onFocusKind }: BookGraphViewProps) {
  const manuscript = useContentStore((s) => s.getManuscript(projectId))
  const chapters = manuscript?.chapters ?? []
  const bible = useLayer0Store((s) => s.getBible(projectId))
  const ideas = useIdeaStore((s) => s.byProject[projectId]) ?? EMPTY_IDEAS
  const setAppMode = useUiStore((s) => s.setAppMode)
  const requestScrollToChapter = useSelectionStore((s) => s.requestScrollToChapter)
  const savedPositions = useGraphLayoutStore((s) => s.getPositions(projectId))
  const setSavedPosition = useGraphLayoutStore((s) => s.setPosition)
  const clearSavedPositions = useGraphLayoutStore((s) => s.clearPositions)
  const nodeScale = useGraphLayoutStore((s) => s.getNodeScale(projectId))
  const setNodeScale = useGraphLayoutStore((s) => s.setNodeScale)
  const nodeColors = useGraphLayoutStore((s) => s.nodeColorByProject[projectId]) ?? EMPTY_NODE_COLORS
  const nodeSizes = useGraphLayoutStore((s) => s.nodeSizeByProject[projectId]) ?? EMPTY_NODE_SIZES
  const setNodeColorAction = useGraphLayoutStore((s) => s.setNodeColor)
  const setNodeSizeAction = useGraphLayoutStore((s) => s.setNodeSize)

  const [hiddenKinds, setHiddenKinds] = useState<Set<GraphNodeKind>>(new Set())
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Persistent selection (distinct from hover) — the node whose connections
  // are highlighted and whose details show in the right panel. `null` means
  // "show whole-book stats instead" (see the panel render logic near the
  // bottom of this component).
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Click-to-connect (Phase 102). `connectMode` is a real mode switch, not a
  // modifier key — while it's on, clicking a node never navigates or selects
  // for the details panel, it only participates in building a connection;
  // this keeps click semantics unambiguous instead of overloading one click
  // with two different meanings depending on hidden state.
  const [connectMode, setConnectMode] = useState(false)
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] = useState<{ aId: string; bId: string } | null>(null)
  const [connectLabel, setConnectLabel] = useState('')

  const { allNodes, allEdges, countByKind, secondaryByNodeId } = useMemo(() => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()
    const count: Partial<Record<GraphNodeKind, number>> = {}
    // A Layer 0 entity's existing `secondaryKey` field value (Character's
    // is `role` — "Protagonist", "mentor", etc.), keyed by node id, for the
    // detail panel's subtitle (Phase 103). Built here rather than a second
    // pass over `bible` since this loop already visits every entity once.
    const secondary = new Map<string, string>()

    // The book itself — always present, always the first node, so Chapter 1
    // below has something to chain to. Not counted in `countByKind`/
    // `GRAPH_KIND_ORDER`'s filter chips: it's not a toggleable category,
    // it's the one fixed anchor everything else is drawn relative to.
    nodes.push({ id: BOOK_NODE_ID, kind: 'book', label: bookTitle || 'Untitled book' })
    nodeIds.add(BOOK_NODE_ID)

    chapters.forEach((chapter, index) => {
      // Numbered ("1. The Whispering Forest") rather than just the title
      // (Phase 105) — reading order is core structural information a graph
      // like this should never require tracing an edge to learn, especially
      // once a manuscript has enough chapters that the auto-layout's
      // clustering no longer happens to match reading order visually.
      nodes.push({ id: chapter.id, kind: 'chapter', label: `${index + 1}. ${chapter.title || 'Untitled chapter'}` })
      nodeIds.add(chapter.id)
      count.chapter = (count.chapter ?? 0) + 1
      // The spine attaches only to Chapter 1 (Phase 106, user 2026-08-02:
      // "i think only the first chapter should attach to the central book
      // by default") — every other chapter reaches the Book transitively,
      // through the reading-order chain below (Book → Ch.1 → Ch.2 → …), not
      // through its own separate spoke. Phase 99–105 had every chapter
      // spoke off the Book directly *and* chain to its neighbour, which was
      // redundant for every chapter but the first once the chain existed,
      // and, worse, visually undersold "spine": a burst of N lines radiating
      // from one point doesn't read as a spine the way one continuous chain
      // running through the Book does.
      if (index === 0) {
        edges.push({ a: BOOK_NODE_ID, b: chapter.id })
      }
    })

    // Reading-order edges (Phase 105, user 2026-08-02: "should chapters
    // link in order in the book graph") — now the *only* thing connecting
    // Chapter 2 onward back to the Book (see the `index === 0` guard
    // above), not an addition alongside a redundant direct spoke. Beyond
    // just being visible information, these feed the same edge-spring
    // physics every other edge already does (see `computeGraphLayout`'s
    // doc comment): each chapter is pulled toward its neighbours in
    // sequence, and the whole chain is pulled toward the Book only through
    // Chapter 1 — so the auto-layout strings chapters out into one
    // continuous line running through the Book, an actual spine, rather
    // than a burst of individual spokes. Rendered with a small arrowhead
    // (the one edge kind here where direction actually matters) rather than
    // reusing the plain spine or dashed-relationship styles — see the
    // render loop below.
    for (let i = 0; i < chapters.length - 1; i++) {
      edges.push({ a: chapters[i].id, b: chapters[i + 1].id, sequence: true })
    }

    for (const kind of LAYER0_ENTITY_KINDS) {
      const collection = LAYER0_KIND_TO_COLLECTION[kind]
      const config = LAYER0_FORM_CONFIG[kind]
      const entities = bible[collection] as unknown as (Record<string, unknown> & { id: string; linkedChapterId?: string })[]
      for (const entity of entities) {
        nodes.push({ id: entity.id, kind, label: (entity[config.primaryKey] as string | undefined)?.trim() || 'Untitled' })
        nodeIds.add(entity.id)
        count[kind] = (count[kind] ?? 0) + 1
        if (entity.linkedChapterId && nodeIds.has(entity.linkedChapterId)) {
          edges.push({ a: entity.id, b: entity.linkedChapterId })
        }
        if (config.secondaryKey) {
          const secondaryValue = (entity[config.secondaryKey] as string | undefined)?.trim()
          if (secondaryValue) secondary.set(entity.id, secondaryValue)
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

    // Labeled relationship edges (Phase 99, user 2026-08-02: "if the
    // characters are related it could show what that is with the line
    // connection eg daughter/mother") — the one edge kind that carries a
    // caption. Written either from `Layer0RelationshipsSection.tsx`'s add
    // control inside an entity's edit dialog, or (as of Phase 102) directly
    // from this graph's own click-to-connect flow — both paths write the
    // same `Layer0Relationship` record, read here exactly as stored:
    // cross-kind by design, so a Character-to-Location relationship
    // ("childhood home") draws the same way a Character-to-Character one
    // does.
    for (const rel of bible.relationships ?? []) {
      edges.push({ a: rel.aId, b: rel.bId, label: rel.label })
    }

    // Second pass for chapter links above already required both ends
    // present via `linkedChapterId`/`nodeIds.has` checks — `promotedTo`,
    // `relatedIdeaIds`, and `relationships` are all added optimistically
    // above since their target may not have been visited yet in single-pass
    // order (or may since have been deleted); drop any edge whose far end
    // never actually turned up as a node.
    const validEdges = edges.filter((e) => nodeIds.has(e.a) && nodeIds.has(e.b))

    return { allNodes: nodes, allEdges: validEdges, countByKind: count, secondaryByNodeId: secondary }
  }, [chapters, bible, ideas, bookTitle])

  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes])

  // Whole-manuscript + per-chapter word counts for the panel's "nothing
  // selected" stats view and a selected chapter's own detail row. Reuses
  // `extractTextSpans` (the Virtual Editor's own text-flattening helper —
  // see `useManuscriptWordCount.ts`'s doc comment for why this codebase has
  // exactly one place that knows how to pull plain text out of a block)
  // rather than calling that hook *and* re-deriving a second, parallel
  // per-chapter breakdown from scratch.
  const { wordCountByChapter, totalWordCount } = useMemo(() => {
    const byChapter = new Map<string, number>()
    let total = 0
    if (manuscript) {
      for (const span of extractTextSpans(manuscript)) {
        const w = wordCount(span.text)
        byChapter.set(span.chapterId, (byChapter.get(span.chapterId) ?? 0) + w)
        total += w
      }
    }
    return { wordCountByChapter: byChapter, totalWordCount: total }
  }, [manuscript])

  const visibleNodes = useMemo(() => allNodes.filter((n) => !hiddenKinds.has(n.kind)), [allNodes, hiddenKinds])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => allEdges.filter((e) => visibleIds.has(e.a) && visibleIds.has(e.b)), [allEdges, visibleIds])

  const pinnedPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of visibleNodes) {
      const saved = savedPositions[node.id]
      if (saved) map.set(node.id, saved)
    }
    // The book node is permanently pinned at the origin — never written to
    // `graphLayoutStore` (it has no drag handlers at all, see the node
    // render branch below), so this is the only place its position is ever
    // set. Chapter 1 chains directly to `BOOK_NODE_ID`, and every later
    // chapter chains to it transitively (see the edge-building memo above),
    // so pinning the book at (0,0) is what actually keeps it
    // visually central rather than just "a node with more edges."
    if (visibleNodes.some((n) => n.id === BOOK_NODE_ID)) map.set(BOOK_NODE_ID, { x: 0, y: 0 })
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
  // Layout runs in a persistent Web Worker (`graphLayout.worker.ts`), not a
  // synchronous `useMemo`, as of Phase 108 (2026-08-02) — profiling showed a
  // single recompute at "100+ chapter novel with a full Layer 0 bible" scale
  // takes ~180-450ms of pure main-thread CPU (see `graphLayoutEngine.ts`'s
  // doc comment for the numbers), which is long enough to freeze the whole
  // app's UI mid-recompute if run inline. One worker instance lives for the
  // component's lifetime rather than one-per-request — spinning up a new
  // worker (loading its module, running top-level init) costs more than the
  // computation itself does at small graph sizes, which would make the
  // common case slower to "fix" the rare large-graph case.
  const [layoutWorker] = useState(() => new LayoutWorker())
  useEffect(() => () => layoutWorker.terminate(), [layoutWorker])

  const [layout, setLayout] = useState<Layout>(() => ({
    positions: new Map(),
    bounds: { minX: -140, minY: -140, width: 280, height: 280 },
  }))
  // `requestId` guards against a stale response overwriting a fresher one:
  // the worker processes requests in the order it receives them, but nothing
  // guarantees they *finish* in that order is safe to assume forever, and a
  // user toggling a kind filter twice in quick succession fires this effect
  // twice before either response comes back. Only the response matching the
  // most recently sent request is applied; an earlier one arriving late is
  // silently dropped rather than flashing the graph back to a superseded
  // arrangement.
  const layoutRequestIdRef = useRef(0)
  useEffect(() => {
    const requestId = ++layoutRequestIdRef.current
    layoutWorker.postMessage({ requestId, nodes: visibleNodes, edges: visibleEdges, pinned: pinnedPositions })
    const handleMessage = (event: MessageEvent<{ requestId: number; positions: Map<string, { x: number; y: number }>; bounds: Layout['bounds'] }>) => {
      if (event.data.requestId !== layoutRequestIdRef.current) return
      setLayout({ positions: event.data.positions, bounds: event.data.bounds })
    }
    layoutWorker.addEventListener('message', handleMessage)
    return () => layoutWorker.removeEventListener('message', handleMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, layoutWorker])

  // Every node id directly reachable from `selectedNodeId` in one hop — the
  // "direct connections" the design review asked for. `null` when nothing
  // is selected, which every render site below treats as "don't dim
  // anything" rather than "dim everything."
  const highlightedIds = useMemo(() => {
    if (!selectedNodeId) return null
    const set = new Set<string>([selectedNodeId])
    for (const e of visibleEdges) {
      if (e.a === selectedNodeId) set.add(e.b)
      if (e.b === selectedNodeId) set.add(e.a)
    }
    return set
  }, [selectedNodeId, visibleEdges])

  // Node search (Phase 103) — "which nodes match" as its own independent
  // set from `highlightedIds` above. `null` when the search box is empty,
  // same "don't dim anything" convention. The Book node never matches (it's
  // not really a searchable "thing," and would otherwise get dimmed by
  // every non-empty query that doesn't happen to match the book's title).
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    const set = new Set<string>()
    for (const node of visibleNodes) {
      if (node.kind !== 'book' && node.label.toLowerCase().includes(q)) set.add(node.id)
    }
    return set
  }, [searchQuery, visibleNodes])

  // What actually drives the dim/highlight render pass below: a persistent
  // selection wins if one exists (it has real "these are direct
  // connections" semantics an edge-highlight needs); otherwise an active
  // search query dims everything that doesn't match; otherwise nothing is
  // dimmed at all. Both `highlightedIds` and `searchMatchIds` are "ids to
  // keep at full opacity" sets, so this can be one shared variable.
  const emphasizedIds = highlightedIds ?? searchMatchIds

  // The selected node's own direct connections, resolved to full nodes (for
  // the panel's connection list) with whichever relationship label (if any)
  // applies to that specific edge.
  const selectedConnections = useMemo(() => {
    if (!selectedNodeId) return []
    const rows: { node: GraphNode; label?: string }[] = []
    for (const e of visibleEdges) {
      const otherId = e.a === selectedNodeId ? e.b : e.b === selectedNodeId ? e.a : null
      if (!otherId) continue
      const other = nodeById.get(otherId)
      if (other) rows.push({ node: other, label: e.label })
    }
    return rows
  }, [selectedNodeId, visibleEdges, nodeById])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

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
      setTransform((t) => ({ ...t, k: clamp(t.k - e.deltaY * 0.001, ZOOM_MIN, ZOOM_MAX) }))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Escape is the universal "back out one step" key: cancel a pending
  // connection first (it's the most transient state), then a chosen source
  // with nothing picked yet, then connect mode itself, then a plain
  // selection — never more than one step at a time, so it's never
  // surprising which state disappears.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pendingConnection) {
        setPendingConnection(null)
        setConnectLabel('')
      } else if (connectSourceId) {
        setConnectSourceId(null)
      } else if (connectMode) {
        setConnectMode(false)
      } else if (selectedNodeId) {
        setSelectedNodeId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingConnection, connectSourceId, connectMode, selectedNodeId])

  const resetView = () => setTransform({ x: 0, y: 0, k: 1 })
  const resetLayout = () => clearSavedPositions(projectId)
  const zoomIn = () => setTransform((t) => ({ ...t, k: clamp(t.k + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) }))
  const zoomOut = () => setTransform((t) => ({ ...t, k: clamp(t.k - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) }))
  const adjustNodeScale = (delta: number) => setNodeScale(projectId, clamp(Math.round((nodeScale + delta) * 100) / 100, NODE_SCALE_MIN, NODE_SCALE_MAX))
  const adjustPerNodeSize = (nodeId: string, delta: number) =>
    setNodeSizeAction(projectId, nodeId, clamp(Math.round(((nodeSizes[nodeId] ?? 1) + delta) * 100) / 100, NODE_SCALE_MIN, NODE_SCALE_MAX))

  function toggleConnectMode() {
    setConnectMode((v) => !v)
    setConnectSourceId(null)
    setPendingConnection(null)
    setConnectLabel('')
    setSelectedNodeId(null)
  }

  function cancelPendingConnection() {
    setPendingConnection(null)
    setConnectSourceId(null)
    setConnectLabel('')
  }

  function submitPendingConnection() {
    if (!pendingConnection || !connectLabel.trim()) return
    const now = new Date().toISOString()
    addLayer0EntityWithHistory(
      projectId,
      'relationships',
      { id: generateId('rel'), aId: pendingConnection.aId, bId: pendingConnection.bId, label: connectLabel.trim(), createdAt: now, updatedAt: now } as never,
      'Add relationship',
    )
    setPendingConnection(null)
    setConnectLabel('')
    // Deliberately stays in connect mode with no source chosen — chaining
    // several connections in a row (e.g. building out one character's whole
    // family tree) shouldn't require re-clicking "Connect" each time.
  }

  const onBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    panState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y, moved: false }
    setIsPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onBackgroundPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panState.current) return
    const dx = e.clientX - panState.current.startX
    const dy = e.clientY - panState.current.startY
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) panState.current.moved = true
    setTransform((t) => ({ ...t, x: panState.current!.origX + dx, y: panState.current!.origY + dy }))
  }
  const onBackgroundPointerUp = () => {
    const state = panState.current
    panState.current = null
    setIsPanning(false)
    if (state && !state.moved) {
      // A real click on empty canvas, not a pan — Miro/Figma's "click empty
      // space to deselect" convention, plus (in Connect mode) a way to bail
      // out of a half-made connection without reaching for Escape.
      if (pendingConnection || connectSourceId) cancelPendingConnection()
      else if (selectedNodeId) setSelectedNodeId(null)
    }
  }

  function onNodePointerDown(e: React.PointerEvent<SVGGElement>, node: GraphNode) {
    e.stopPropagation()
    if (connectMode) return // handled as a plain click on pointer-up, no drag tracking needed
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
    if (connectMode) {
      handleConnectClick(node)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // No capture was taken in Connect mode — nothing to release.
      }
      return
    }
    const drag = nodeDragState.current
    nodeDragState.current = null
    setDraggingNodeId(null)
    if (drag && drag.nodeId === node.id && drag.moved && dragPosition) {
      setSavedPosition(projectId, node.id, dragPosition)
    } else {
      // Never actually moved past the threshold — a click, not a drag.
      handleNodeClick(node)
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

  /** Single click on a node in the default (non-Connect) mode: select it —
   * highlights its direct connections and shows its details in the right
   * panel. Clicking the Book node, or clicking an already-selected node
   * again, clears the selection back to the whole-book stats view. Actually
   * navigating away is a separate, explicit action — see `handleOpen`. */
  function handleNodeClick(node: GraphNode) {
    if (node.kind === 'book') {
      setSelectedNodeId(null)
      return
    }
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
  }

  /** The deliberate "go there" action (Phase 102's panel Open button, or a
   * double-click as the accelerator for the old single-click-opens muscle
   * memory) — unchanged from what a plain click used to do before this
   * pass. */
  function handleOpen(node: GraphNode) {
    if (node.kind === 'book') return
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

  function handleConnectClick(node: GraphNode) {
    if (node.kind === 'book') return // the Book is the project itself, not a real entity to relate things to
    if (pendingConnection) return // a label is already being entered for a prior pair — ignore further node clicks until resolved
    if (!connectSourceId) {
      setConnectSourceId(node.id)
      return
    }
    if (connectSourceId === node.id) {
      setConnectSourceId(null) // clicked the source again — cancel and start over
      return
    }
    setPendingConnection({ aId: connectSourceId, bId: node.id })
    setConnectSourceId(null)
    setConnectLabel('')
  }

  function kindLabel(kind: GraphNodeKind): string {
    if (kind === 'chapter') return 'Chapters'
    if (kind === 'idea') return 'Ideas'
    if (kind === 'book') return 'Book'
    return getLayer0KindLabel(kind, bookForm).plural
  }

  function kindSingularLabel(kind: GraphNodeKind): string {
    if (kind === 'chapter') return 'Chapter'
    if (kind === 'idea') return 'Idea'
    if (kind === 'book') return 'Book'
    return getLayer0KindLabel(kind, bookForm).singular
  }

  /** Whole-book stats — the panel's default content whenever nothing is
   * selected (design review, user 2026-08-02: "show overall book statistics
   * when nothing selected"). Also what clicking the Book node itself shows,
   * since selecting "the whole book" and selecting "nothing in particular"
   * mean the same thing here. */
  function renderStatsPanel() {
    const kindsWithCounts = GRAPH_KIND_ORDER.filter((k) => k !== 'chapter' && k !== 'idea' && (countByKind[k] ?? 0) > 0)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Book overview</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Nothing selected — click any node to see its connections.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[var(--radius-button)] border border-border bg-background-secondary p-2.5">
            <div className="text-lg font-semibold text-text-primary">{chapters.length}</div>
            <div className="text-[11px] text-text-secondary">Chapters</div>
          </div>
          <div className="rounded-[var(--radius-button)] border border-border bg-background-secondary p-2.5">
            <div className="text-lg font-semibold text-text-primary">{totalWordCount.toLocaleString()}</div>
            <div className="text-[11px] text-text-secondary">Words</div>
          </div>
          <div className="rounded-[var(--radius-button)] border border-border bg-background-secondary p-2.5">
            <div className="text-lg font-semibold text-text-primary">{countByKind.idea ?? 0}</div>
            <div className="text-[11px] text-text-secondary">Ideas</div>
          </div>
          <div className="rounded-[var(--radius-button)] border border-border bg-background-secondary p-2.5">
            <div className="text-lg font-semibold text-text-primary">{bible.relationships?.length ?? 0}</div>
            <div className="text-[11px] text-text-secondary">Connections</div>
          </div>
        </div>
        {kindsWithCounts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Layer 0 entities</span>
            {kindsWithCounts.map((kind) => {
              const Icon = GRAPH_NODE_ICONS[kind]
              return (
                <div key={kind} className="flex items-center gap-2 text-xs text-text-primary">
                  <Icon className="size-3.5 shrink-0 text-text-secondary" />
                  <span className="flex-1">{kindLabel(kind)}</span>
                  <span className="text-text-secondary">{countByKind[kind]}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderNodeDetailPanel(node: GraphNode) {
    const Icon = GRAPH_NODE_ICONS[node.kind]
    const openLabel = node.kind === 'chapter' ? 'Open in editor' : node.kind === 'idea' ? 'Open idea' : `Open in Develop`
    const secondary = secondaryByNodeId.get(node.id)
    const customColor = nodeColors[node.id]
    const perNodeSize = nodeSizes[node.id] ?? 1
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: customColor ?? 'var(--color-border)', backgroundColor: customColor ? `${customColor}29` : 'var(--color-background-secondary)' }}
          >
            <Icon className="size-4" style={{ color: customColor ?? 'var(--color-text-secondary)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary">{node.label}</div>
            <div className="truncate text-xs text-text-secondary">
              {kindSingularLabel(node.kind)}
              {secondary && ` · ${secondary}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedNodeId(null)}
            aria-label="Deselect"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-hover hover:text-text-primary"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {node.kind === 'chapter' && (
          <div className="text-xs text-text-secondary">{(wordCountByChapter.get(node.id) ?? 0).toLocaleString()} words</div>
        )}

        <Button variant="secondary" size="sm" className="w-full" onClick={() => handleOpen(node)}>
          {openLabel}
        </Button>

        <div className="flex items-center gap-3 border-t border-border pt-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Colour</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                aria-label="Node colour"
                value={customColor ?? DEFAULT_COLOR_SWATCH}
                onChange={(e) => setNodeColorAction(projectId, node.id, e.target.value)}
                className="h-8 w-9 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-border"
              />
              {customColor && (
                <button
                  type="button"
                  onClick={() => setNodeColorAction(projectId, node.id, null)}
                  className="text-[11px] text-text-secondary underline decoration-dotted hover:text-text-primary"
                >
                  Use default
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Size</span>
            <div className="flex items-center gap-0.5 rounded-full border border-border px-1 py-1">
              <button
                type="button"
                onClick={() => adjustPerNodeSize(node.id, -NODE_SCALE_STEP)}
                disabled={perNodeSize <= NODE_SCALE_MIN}
                aria-label="Smaller"
                title="Smaller"
                className="flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
              >
                <Minus className="size-3" />
              </button>
              <span className="w-8 text-center text-[10px] tabular-nums text-text-secondary">{Math.round(perNodeSize * 100)}%</span>
              <button
                type="button"
                onClick={() => adjustPerNodeSize(node.id, NODE_SCALE_STEP)}
                disabled={perNodeSize >= NODE_SCALE_MAX}
                aria-label="Larger"
                title="Larger"
                className="flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Connections ({selectedConnections.length})</span>
          {selectedConnections.length === 0 ? (
            <p className="text-xs text-text-muted">Nothing linked to this yet.</p>
          ) : (
            selectedConnections.map(({ node: other, label }) => {
              const OtherIcon = GRAPH_NODE_ICONS[other.kind]
              return (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => setSelectedNodeId(other.id)}
                  className="flex items-center gap-2 rounded-[var(--radius-button)] border border-border bg-background-secondary px-2.5 py-1.5 text-left transition-colors hover:bg-hover"
                >
                  <OtherIcon className="size-3.5 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {other.label}
                    {label && <span className="text-text-secondary"> — {label}</span>}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  function renderConnectHintPanel() {
    const source = connectSourceId ? nodeById.get(connectSourceId) : null
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-text-primary">Connect mode</h3>
        </div>
        {source ? (
          <>
            <p className="text-xs text-text-secondary">
              Connecting from <span className="font-medium text-text-primary">{source.label}</span> — click another node to link to.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setConnectSourceId(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <p className="text-xs text-text-secondary">Click a node to start a connection, then click a second node to link them.</p>
        )}
        <Button variant="secondary" size="sm" onClick={toggleConnectMode}>
          Done connecting
        </Button>
      </div>
    )
  }

  function renderConnectFormPanel() {
    if (!pendingConnection) return null
    const a = nodeById.get(pendingConnection.aId)
    const b = nodeById.get(pendingConnection.bId)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-text-primary">New connection</h3>
        </div>
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{a?.label ?? 'Deleted item'}</span>
          {' ↔ '}
          <span className="font-medium text-text-primary">{b?.label ?? 'Deleted item'}</span>
        </p>
        <Input
          autoFocus
          value={connectLabel}
          onChange={(e) => setConnectLabel(e.target.value)}
          placeholder="e.g. mother / daughter"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitPendingConnection()
            }
          }}
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={cancelPendingConnection}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1" disabled={!connectLabel.trim()} onClick={submitPendingConnection}>
            Add
          </Button>
        </div>
      </div>
    )
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

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined

  return (
    <div className="flex flex-col gap-3 p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Book Graph</h2>
        <p className="text-sm text-text-secondary">
          Click a node to see its connections. Drag to rearrange. Turn on Connect to link two nodes with a label.
        </p>
        {/* A quiet key for the three edge styles now on the canvas (Phase
         * 105 added the third, arrowed one) — one line, not a boxed legend
         * widget, since it's explaining line-weight conventions, not adding
         * a new feature surface. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-[var(--color-accent)] opacity-60" />
            Book spine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-text-secondary" />
            Chapter order
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-text-primary" />
            Relationship
          </span>
        </div>
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

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-full border border-border px-1 py-1" title="Node size">
            <button
              type="button"
              onClick={() => adjustNodeScale(-NODE_SCALE_STEP)}
              disabled={nodeScale <= NODE_SCALE_MIN}
              aria-label="Smaller nodes"
              title="Smaller nodes"
              className="flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-9 text-center text-[10px] tabular-nums text-text-secondary">{Math.round(nodeScale * 100)}%</span>
            <button
              type="button"
              onClick={() => adjustNodeScale(NODE_SCALE_STEP)}
              disabled={nodeScale >= NODE_SCALE_MAX}
              aria-label="Larger nodes"
              title="Larger nodes"
              className="flex size-5 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
            >
              <Plus className="size-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={toggleConnectMode}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              connectMode ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-border text-text-secondary hover:text-text-primary',
            )}
          >
            <Link2 className="size-3" />
            {connectMode ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div
          ref={containerRef}
          className="relative h-[560px] min-w-0 flex-1 overflow-hidden rounded-[var(--radius-card)] border border-border bg-background-secondary"
        >
          <svg
            ref={svgRef}
            viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
            className="size-full touch-none select-none"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
              cursor: isPanning ? 'grabbing' : connectMode ? 'crosshair' : 'grab',
            }}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onBackgroundPointerMove}
            onPointerUp={onBackgroundPointerUp}
            onPointerLeave={onBackgroundPointerUp}
          >
            <defs>
              {/* Arrowhead for chapter reading-order edges (Phase 105) — the
               * one edge kind here where direction is actually part of the
               * meaning, so it's the one edge kind that gets a marker.
               * `auto-start-reverse` orients it along the line automatically
               * regardless of which way a chapter got dragged. */}
              <marker id="chapter-sequence-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-text-secondary)" />
              </marker>
            </defs>

            {visibleEdges.map(({ a, b, label, sequence }) => {
              const pa = a === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(a)
              const pb = b === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(b)
              if (!pa || !pb) return null
              const hoverHighlighted = hoveredId === a || hoveredId === b
              const touchesSelection = highlightedIds && (a === selectedNodeId || b === selectedNodeId)
              // Selection mode dims everything except edges that touch the
              // selected node directly (a tight "just this node's own
              // connections" focus — an edge between two of its neighbours
              // that doesn't touch it stays dimmed). Search mode is looser:
              // any edge touching *a* match stays visible, since the point
              // is tracing what a found node connects to, not just the
              // found nodes themselves.
              const dimmed = highlightedIds ? !touchesSelection : searchMatchIds ? !(searchMatchIds.has(a) || searchMatchIds.has(b)) : false
              // The book's own spine to each chapter reads as the manuscript's
              // backbone — thicker and more opaque than an ordinary structural
              // edge, but still the same accent colour (not a new hue) per
              // `CLAUDE.md`'s design-token discipline.
              const isSpine = a === BOOK_NODE_ID || b === BOOK_NODE_ID
              // A labeled relationship edge (Phase 99) gets its own colour —
              // `--color-text-primary` instead of the accent every structural
              // edge uses — and a dash pattern, so "the author explicitly
              // said these two are connected, and here's how" reads as a
              // different kind of line from "this entity happens to be linked
              // to this chapter."
              const isRelationship = !!label
              const isSequence = !!sequence
              // The arrowhead needs to land just outside the target chapter's
              // own circle, not at its exact centre — nodes render *after*
              // edges (so they paint on top), which would otherwise bury the
              // arrowhead completely underneath the node. Only sequence edges
              // need this: every other edge kind has no marker to protect.
              let lineEnd = pb
              if (isSequence) {
                const targetRadius = CHAPTER_RADIUS * nodeScale * (nodeSizes[b] ?? 1)
                const dx = pb.x - pa.x
                const dy = pb.y - pa.y
                const dist = Math.sqrt(dx * dx + dy * dy) || 1
                const inset = targetRadius + 6
                lineEnd = { x: pb.x - (dx / dist) * inset, y: pb.y - (dy / dist) * inset }
              }
              return (
                <g key={`${a}-${b}-${label ?? ''}`} className="transition-opacity duration-150" style={{ opacity: dimmed ? 0.12 : 1 }}>
                  <line
                    x1={pa.x}
                    y1={pa.y}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke={isRelationship ? 'var(--color-text-primary)' : isSequence ? 'var(--color-text-secondary)' : 'var(--color-accent)'}
                    strokeWidth={touchesSelection ? 2.5 : isSpine ? 3 : isRelationship ? 1.6 : isSequence ? 1.25 : hoverHighlighted ? 2 : 1}
                    strokeOpacity={touchesSelection ? 0.9 : isRelationship ? 0.75 : isSpine ? 0.55 : isSequence ? 0.45 : hoverHighlighted ? 0.7 : 0.28}
                    strokeDasharray={isRelationship ? '4,3' : undefined}
                    markerEnd={isSequence ? 'url(#chapter-sequence-arrow)' : undefined}
                  />
                  {label && (
                    <foreignObject
                      x={(pa.x + pb.x) / 2 - 55}
                      y={(pa.y + pb.y) / 2 - 9}
                      width={110}
                      height={18}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div className="mx-auto flex h-[18px] w-fit max-w-full items-center justify-center truncate rounded-full border border-border bg-panel px-2 text-center text-[9px] leading-none text-text-primary shadow-[var(--shadow-sm)]">
                        {label}
                      </div>
                    </foreignObject>
                  )}
                </g>
              )
            })}

            {visibleNodes.map((node) => {
              const p = node.id === draggingNodeId && dragPosition ? dragPosition : layout.positions.get(node.id)
              if (!p) return null
              const Icon = GRAPH_NODE_ICONS[node.kind]
              const isBook = node.kind === 'book'
              const isChapter = node.kind === 'chapter'
              const isHovered = hoveredId === node.id
              const isSelected = selectedNodeId === node.id
              const isConnectSource = connectSourceId === node.id
              const isPinned = pinnedPositions.has(node.id) && !isBook
              const dimmed = isBook ? false : emphasizedIds ? !emphasizedIds.has(node.id) : false
              const customColor = isBook ? undefined : nodeColors[node.id]
              const perNodeSize = isBook ? 1 : (nodeSizes[node.id] ?? 1)
              const r = (isBook ? BOOK_RADIUS : isChapter ? CHAPTER_RADIUS : NODE_RADIUS) * (isBook ? 1 : nodeScale * perNodeSize)
              const iconSize = (isBook ? 28 : isChapter ? 24 : 20) * (isBook ? 1 : nodeScale * perNodeSize)
              const tintColor = customColor ?? (isBook || isChapter ? 'var(--color-accent)' : undefined)
              // The book node is the one fixed anchor (see `pinnedPositions`'s
              // doc comment above) — no drag handlers at all, so it can never
              // be dragged, and no grab cursor, so it doesn't visually
              // promise an interaction it doesn't have. It still gets a
              // click handler (below) so clicking it can reset the panel back
              // to the whole-book stats view.
              const dragHandlers = isBook
                ? {}
                : {
                    onPointerDown: (e: React.PointerEvent<SVGGElement>) => onNodePointerDown(e, node),
                    onPointerMove: onNodePointerMove,
                    onPointerUp: (e: React.PointerEvent<SVGGElement>) => onNodePointerUp(e, node),
                  }
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x} ${p.y})`}
                  {...dragHandlers}
                  onClick={isBook ? () => handleNodeClick(node) : undefined}
                  onDoubleClick={!isBook && !connectMode ? () => handleOpen(node) : undefined}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId((v) => (v === node.id ? null : v))}
                  className={cn(
                    'transition-opacity duration-150',
                    isBook ? 'cursor-pointer' : node.id === draggingNodeId ? 'cursor-grabbing' : connectMode ? 'cursor-crosshair' : 'cursor-grab',
                  )}
                  style={{ opacity: dimmed ? 0.3 : 1 }}
                >
                  <circle
                    r={isHovered || node.id === draggingNodeId ? r + 3 : r}
                    fill={tintColor ?? 'var(--color-panel)'}
                    fillOpacity={tintColor ? (isBook ? 0.18 : 0.16) : 1}
                    stroke={isConnectSource || isSelected ? 'var(--color-accent)' : (tintColor ?? 'var(--color-border)')}
                    strokeWidth={isConnectSource || isSelected ? 3 : isBook ? 3 : isChapter ? 2.5 : isPinned ? 2 : 1.5}
                    strokeDasharray={isConnectSource ? '3,2' : isPinned ? '3,2' : undefined}
                    className={cn('transition-[r] duration-150', isConnectSource && 'animate-pulse')}
                  />
                  <foreignObject x={-iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} style={{ pointerEvents: 'none' }}>
                    <Icon className="size-full" style={{ color: tintColor ?? 'var(--color-text-secondary)' }} />
                  </foreignObject>
                  <foreignObject x={-70} y={r + 6} width={140} height={34} style={{ pointerEvents: 'none' }}>
                    <div
                      className={cn(
                        'line-clamp-2 text-center leading-tight',
                        isBook ? 'text-[11px] font-semibold text-text-primary' : 'text-[10px] text-text-secondary',
                      )}
                    >
                      {node.label}
                    </div>
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
            <div className="flex items-center rounded-[var(--radius-button)] border border-border bg-panel shadow-[var(--shadow-sm)]">
              <button
                type="button"
                onClick={zoomOut}
                disabled={transform.k <= ZOOM_MIN}
                aria-label="Zoom out"
                title="Zoom out"
                className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTransform((t) => ({ ...t, k: 1 }))}
                title="Reset zoom to 100%"
                className="w-10 text-center text-[10px] tabular-nums text-text-secondary hover:text-text-primary"
              >
                {Math.round(transform.k * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={transform.k >= ZOOM_MAX}
                aria-label="Zoom in"
                title="Zoom in"
                className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-30"
              >
                <ZoomIn className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset view"
              title="Reset pan and zoom — fits every visible node back into view"
              className="flex size-7 items-center justify-center rounded-[var(--radius-button)] border border-border bg-panel text-text-secondary shadow-[var(--shadow-sm)] transition-colors hover:bg-hover hover:text-text-primary"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex h-[560px] w-72 shrink-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-panel">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a node…"
                aria-label="Find a node"
                className="h-8 w-full rounded-[var(--radius-button)] border border-border bg-background-secondary pl-8 pr-7 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-1.5 text-[11px] text-text-secondary">
                {searchMatchIds?.size ?? 0} match{(searchMatchIds?.size ?? 0) === 1 ? '' : 'es'}
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {pendingConnection
              ? renderConnectFormPanel()
              : connectMode
                ? renderConnectHintPanel()
                : selectedNode
                  ? renderNodeDetailPanel(selectedNode)
                  : renderStatsPanel()}
          </div>
        </div>
      </div>

      {selectedIdeaId && (
        <IdeaDetailDialog projectId={projectId} ideaId={selectedIdeaId} open onOpenChange={(open) => !open && setSelectedIdeaId(null)} />
      )}
    </div>
  )
}
