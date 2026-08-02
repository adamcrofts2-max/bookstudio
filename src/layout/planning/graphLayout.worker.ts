/**
 * Runs the Book Graph's force-directed layout (`graphLayoutEngine.ts`) off
 * the main thread — see that file's doc comment for the profiling numbers
 * that motivated this (Phase 108, 2026-08-02). A native Web Worker, not an
 * npm package: this sandbox has no npm registry access, and the browser's
 * own Worker API is exactly the "no new dependency" fix `docs/ROADMAP.md`'s
 * deferred item already named.
 *
 * Protocol is deliberately minimal — one message type in, one out, both
 * carrying a `requestId` the caller assigns and echoes back so
 * `BookGraphView.tsx` can discard a response that's been superseded by a
 * newer request (the graph's shape can change again — e.g. a second rapid
 * filter toggle — before a slow computation finishes; without the id, a
 * stale response could overwrite a newer, already-in-flight one). This
 * worker itself stays stateless and doesn't need to know about staleness at
 * all — it just echoes whatever id it was given.
 */
import { computeGraphLayout, type LayoutNode, type LayoutEdge } from '@/layout/planning/graphLayoutEngine'

interface LayoutRequest {
  requestId: number
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  pinned: Map<string, { x: number; y: number }>
}

interface LayoutResponse {
  requestId: number
  positions: Map<string, { x: number; y: number }>
  bounds: { minX: number; minY: number; width: number; height: number }
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { requestId, nodes, edges, pinned } = event.data
  const { positions, bounds } = computeGraphLayout(nodes, edges, pinned)
  const response: LayoutResponse = { requestId, positions, bounds }
  ;(self as unknown as Worker).postMessage(response)
}
