import { useRef } from 'react'

import { cn } from '@/lib/utils'
import {
  visibleGraphRect,
  type CanvasSize,
  type GraphRect,
  type GraphTransform,
} from '@/layout/planning/graphMinimapGeometry'

export interface MinimapNode {
  id: string
  x: number
  y: number
  /** Drawn a size up and in the accent colour — the book hub and whatever is
   * selected are the two things you navigate *by*. */
  emphasis: 'hub' | 'selected' | 'normal'
}

interface GraphMinimapProps {
  bounds: GraphRect
  canvas: CanvasSize
  transform: GraphTransform
  nodes: MinimapNode[]
  onCentreOn: (point: { x: number; y: number }) => void
}

const WIDTH = 148
const HEIGHT = 104

/**
 * An overview of the whole graph with the current viewport drawn on it,
 * parked in the canvas's bottom-right corner. Click or drag anywhere on it
 * to centre the canvas there.
 *
 * Phase 102 deliberately did not build this, and the reasoning was right at
 * the time: the canvas's `viewBox` auto-fits every node, so at 100% zoom the
 * whole graph is on screen and an overview of it would be an overview of
 * what you are already looking at. "Reset view" was the better answer.
 *
 * What changed is not the graph's size but the zoom controls that shipped
 * alongside it. Past 100% the canvas is a window onto something larger than
 * itself, and the only ways back were to zoom out (losing the detail you
 * zoomed in for) or to drag blindly. That is the gap a minimap fills, so
 * this one appears **only when it has something to say** — `BookGraphView`
 * mounts it only above 100% zoom. At or below that, "Reset view" still is
 * the answer and there is no extra furniture on the canvas.
 *
 * The viewport rectangle is computed arithmetically in
 * `graphMinimapGeometry.ts` rather than read back off the DOM, because a ref
 * read during render is a frame stale and a lagging rectangle is precisely
 * what makes a minimap feel broken while you drag.
 */
export function GraphMinimap({ bounds, canvas, transform, nodes, onCentreOn }: GraphMinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const view = visibleGraphRect(bounds, canvas, transform)
  // Dot radii are given in *graph* units, and the whole graph is squeezed
  // into 148px, so a fixed radius would be a smudge on a large graph and a
  // blob on a small one. Convert from the pixel size we actually want.
  const unitsPerPixel = Math.max(bounds.width / WIDTH, bounds.height / HEIGHT)

  /** Where a pointer at these screen coordinates sits in graph space. */
  function pointAt(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    // The minimap uses the same `viewBox` and default `preserveAspectRatio`
    // as the canvas, so the fit maths is identical — reuse it by asking for
    // the transform that would centre on the fraction of the box clicked.
    const scale = Math.min(box.width / bounds.width, box.height / bounds.height)
    const offsetX = (box.width - bounds.width * scale) / 2
    const offsetY = (box.height - bounds.height * scale) / 2
    return {
      x: bounds.minX + (clientX - box.left - offsetX) / scale,
      y: bounds.minY + (clientY - box.top - offsetY) / scale,
    }
  }

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const point = pointAt(e.clientX, e.clientY)
    if (point) onCentreOn(point)
  }

  return (
    <div
      className={cn(
        'absolute bottom-3 right-3 overflow-hidden rounded-[var(--radius-preview)] border border-border',
        'bg-panel/90 shadow-[var(--shadow-sm)] backdrop-blur-sm',
      )}
      // The canvas below listens for pan and connect gestures; the minimap
      // is a sibling overlay, so nothing bubbles into it, but a stray
      // double-click shouldn't reach the page behind it either.
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        className="block cursor-pointer touch-none"
        aria-label="Graph overview — click to move the view"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) handlePointer(e)
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {nodes.map((node) => (
          <circle
            key={node.id}
            cx={node.x}
            cy={node.y}
            r={unitsPerPixel * (node.emphasis === 'normal' ? 2 : 3.5)}
            fill={node.emphasis === 'normal' ? 'var(--color-text-secondary)' : 'var(--color-accent)'}
            fillOpacity={node.emphasis === 'normal' ? 0.7 : 1}
          />
        ))}
        <rect
          x={view.minX}
          y={view.minY}
          width={Math.max(view.width, 1)}
          height={Math.max(view.height, 1)}
          fill="var(--color-accent)"
          fillOpacity={0.1}
          stroke="var(--color-accent)"
          // `vectorEffect` keeps this in screen pixels, so it stays a hairline
          // however far the graph's own units are squeezed to fit.
          strokeWidth={1.5}
          // Nothing is clipped to the box, so a viewport dragged past the
          // graph's own bounds still draws — which is the honest picture.
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
