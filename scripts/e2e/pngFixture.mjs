/**
 * Builds a real PNG of a given size and colour, for suites that need image
 * assets the app will actually decode.
 *
 * The 1×1 PNG constant these suites have carried since Phase 39 proves an
 * image round-trips, but every one of them is the same square, so nothing
 * that depends on an image's *shape* — a gallery row's height, an aspect
 * ratio carried into the PDF — is exercised by it. Generating the bytes
 * here is a dozen lines (PNG's chunk framing plus `zlib`) and needs no
 * dependency, which is why the gallery block went unmeasured until Phase
 * 168: it was recorded in `docs/ROADMAP.md` as needing "an asset-seeding
 * path", and this is the whole of it.
 */
import { deflateSync, crc32 } from 'node:zlib'

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, checksum])
}

/** A solid-colour 8-bit RGB PNG, uncompressed rows, no interlacing. */
export function makePng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  const pixel = Buffer.from([r, g, b])
  // Each scanline is prefixed with its filter type (0 = none).
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: width }, () => pixel)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
