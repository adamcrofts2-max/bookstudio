/** Pull text-draw positions out of a PDF's own content streams. */
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from 'pdf-lib'
import { inflateSync } from 'node:zlib'

export async function readPdfGeometry(bytes) {
  const doc = await PDFDocument.load(bytes)
  const pages = doc.getPages()
  return pages.map((page, index) => {
    const mediaBox = page.node.MediaBox()?.asRectangle?.() ?? { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }
    const contents = page.node.get(PDFName.of('Contents'))
    const streams = []
    const collect = (ref) => {
      const obj = doc.context.lookup(ref)
      if (obj instanceof PDFRawStream) streams.push(obj)
      else if (obj instanceof PDFArray) obj.asArray().forEach(collect)
    }
    collect(contents)
    let text = ''
    for (const stream of streams) {
      const raw = stream.getContents()
      const filter = stream.dict.get(PDFName.of('Filter'))
      let decoded
      try {
        decoded = filter ? inflateSync(Buffer.from(raw)) : Buffer.from(raw)
      } catch {
        decoded = Buffer.from(raw)
      }
      text += decoded.toString('latin1') + '\n'
    }
    return { index, mediaBox, ops: text }
  })
}

/** Every text-drawing position on a page, in PDF points. */
export function textPositions(ops) {
  const out = []
  // pdf-lib emits: BT /F1 12 Tf 1 0 0 1 x y Tm <hex or (str)> Tj ET
  const re = /BT\b([\s\S]*?)\bET\b/g
  let block
  while ((block = re.exec(ops))) {
    const body = block[1]
    // Subset font names carry a hyphenated tag: /SourceSerif4-Medium-7572533686
    const size = /\/[^\s/]+\s+([\d.]+)\s+Tf/.exec(body)
    const tm = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/.exec(body)
    const td = /([-\d.]+)\s+([-\d.]+)\s+Td/.exec(body)
    const hasDraw = /\bT[Jj]\b/.test(body)
    if (!hasDraw) continue
    const x = tm ? parseFloat(tm[5]) : td ? parseFloat(td[1]) : null
    const y = tm ? parseFloat(tm[6]) : td ? parseFloat(td[2]) : null
    if (x === null || y === null) continue
    out.push({ x, y, size: size ? parseFloat(size[1]) : null })
  }
  return out
}

/**
 * Image placements, in PDF points.
 *
 * pdf-lib does not emit one tidy `cm` before `Do` — it emits several, a
 * translate and a scale and a couple of identities, each a separate
 * operator, so the placement is the *product* of every matrix in the `q`
 * block. Multiplying them is the only way to read the real position and
 * size (a regex looking at the matrix nearest `Do` finds `1 0 0 1 0 0` and
 * concludes the image is a point at the origin).
 */
export function imagePlacements(ops) {
  const out = []
  const blocks = ops.split(/\bq\b/)
  for (const block of blocks) {
    const doOp = /\/([A-Za-z0-9-]+)\s+Do\b/.exec(block)
    if (!doOp) continue
    const before = block.slice(0, doOp.index)
    const matrices = [...before.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/g)].map((m) =>
      m.slice(1, 7).map(Number),
    )
    if (matrices.length === 0) continue
    // [a b c d e f] as the usual 3x2 affine; later operators apply within
    // the coordinate system the earlier ones established, so multiply in
    // document order.
    let [a, b, c, d, e, f] = matrices[0]
    for (const [a2, b2, c2, d2, e2, f2] of matrices.slice(1)) {
      const na = a2 * a + b2 * c
      const nb = a2 * b + b2 * d
      const nc = c2 * a + d2 * c
      const nd = c2 * b + d2 * d
      const ne = e2 * a + f2 * c + e
      const nf = e2 * b + f2 * d + f
      ;[a, b, c, d, e, f] = [na, nb, nc, nd, ne, nf]
    }
    out.push({ name: doOp[1], x: e, y: f, width: Math.abs(a), height: Math.abs(d) })
  }
  return out
}
