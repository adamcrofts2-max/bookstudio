/**
 * The arithmetic behind `GraphMinimap.tsx`, kept pure and separate so it can
 * be reasoned about (and asserted on) without a DOM.
 *
 * The Book Graph's canvas is an `<svg>` that exactly fills its container,
 * carries a `viewBox` equal to the layout's bounds, and is then pushed
 * around with a CSS `transform: translate(x, y) scale(k)`. Two mappings
 * therefore sit between a node's graph coordinates and the pixel it lands
 * on, and the minimap needs both — forwards to draw the viewport rectangle,
 * backwards to turn a click on the minimap into a pan.
 *
 * Deriving them here rather than reading `getScreenCTM()` matters because
 * the minimap has to answer for a transform that has *just* been set: a ref
 * read during render is a frame stale, and a viewport rectangle that lags
 * the canvas by a frame is exactly the jitter that makes a minimap feel
 * broken.
 *
 * The default `preserveAspectRatio` ("xMidYMid meet") is what the `fit`
 * below reproduces: the viewBox is scaled uniformly to fit inside the
 * element and centred in whichever axis has room left over.
 */
export interface GraphRect {
  minX: number
  minY: number
  width: number
  height: number
}

export interface GraphTransform {
  x: number
  y: number
  k: number
}

export interface CanvasSize {
  width: number
  height: number
}

interface Fit {
  /** Element pixels per graph unit. */
  scale: number
  /** Letterbox offset in element pixels. */
  offsetX: number
  offsetY: number
}

function fit(bounds: GraphRect, canvas: CanvasSize): Fit {
  const scale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height)
  return {
    scale,
    offsetX: (canvas.width - bounds.width * scale) / 2,
    offsetY: (canvas.height - bounds.height * scale) / 2,
  }
}

/**
 * The graph-coordinate rectangle currently visible in the canvas.
 *
 * At `k === 1` with no pan this is the whole of `bounds` — which is the
 * reason the minimap stays hidden until the user zooms in, and why Phase 102
 * was right to defer it: "Reset view" restores exactly that state, so at
 * 100% there is nothing a minimap could tell you that the canvas isn't
 * already showing.
 */
export function visibleGraphRect(bounds: GraphRect, canvas: CanvasSize, transform: GraphTransform): GraphRect {
  if (canvas.width <= 0 || canvas.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return bounds
  const { scale, offsetX, offsetY } = fit(bounds, canvas)
  const centreX = canvas.width / 2
  const centreY = canvas.height / 2
  // Element-space coordinates of the container's own top-left and
  // bottom-right corners, undoing the CSS transform (which scales about the
  // element's centre, hence the `centre +` / `- centre`).
  const elementX0 = centreX + (0 - centreX - transform.x) / transform.k
  const elementY0 = centreY + (0 - centreY - transform.y) / transform.k
  const elementX1 = centreX + (canvas.width - centreX - transform.x) / transform.k
  const elementY1 = centreY + (canvas.height - centreY - transform.y) / transform.k
  const graphX0 = bounds.minX + (elementX0 - offsetX) / scale
  const graphY0 = bounds.minY + (elementY0 - offsetY) / scale
  const graphX1 = bounds.minX + (elementX1 - offsetX) / scale
  const graphY1 = bounds.minY + (elementY1 - offsetY) / scale
  return { minX: graphX0, minY: graphY0, width: graphX1 - graphX0, height: graphY1 - graphY0 }
}

/**
 * The pan that puts `point` in the middle of the canvas at the current zoom
 * — the inverse of the above, and the whole interaction the minimap offers:
 * click anywhere on the overview and the canvas centres there.
 */
export function transformToCentreOn(
  point: { x: number; y: number },
  bounds: GraphRect,
  canvas: CanvasSize,
  k: number,
): { x: number; y: number } {
  if (canvas.width <= 0 || canvas.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
  const { scale, offsetX, offsetY } = fit(bounds, canvas)
  const elementX = (point.x - bounds.minX) * scale + offsetX
  const elementY = (point.y - bounds.minY) * scale + offsetY
  return { x: k * (canvas.width / 2 - elementX), y: k * (canvas.height / 2 - elementY) }
}

/**
 * Keeps a requested centre inside the graph, so a click near the minimap's
 * edge lands on the nearest bit of the graph rather than on empty space
 * beside it. When the viewport is already bigger than the graph in an axis
 * there is nothing to slide along, so it centres in that axis instead.
 *
 * Without this, clicking a corner of the minimap is a legal move that shows
 * you nothing — technically correct and useless, which is the failure mode
 * a minimap exists to prevent.
 */
export function clampCentreToBounds(
  point: { x: number; y: number },
  bounds: GraphRect,
  visible: GraphRect,
): { x: number; y: number } {
  const axis = (value: number, min: number, size: number, viewSize: number) => {
    if (viewSize >= size) return min + size / 2
    const half = viewSize / 2
    return Math.min(min + size - half, Math.max(min + half, value))
  }
  return {
    x: axis(point.x, bounds.minX, bounds.width, visible.width),
    y: axis(point.y, bounds.minY, bounds.height, visible.height),
  }
}
