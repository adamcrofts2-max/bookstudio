/**
 * Standard CRC-32 (the exact IEEE 802.3 / zlib / PKZIP polynomial and
 * algorithm) — needed because the ZIP local-file-header and central-
 * directory records that `zipWriter.ts` writes both require each entry's
 * uncompressed-data CRC-32. No library dependency: this is ~20 lines of
 * well-known, easily-verified bit manipulation, not worth a package for.
 */

let table: Uint32Array | undefined

function getTable(): Uint32Array {
  if (table) return table
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c >>> 0
  }
  table = t
  return t
}

/** CRC-32 of `data`, as an unsigned 32-bit integer. */
export function crc32(data: Uint8Array): number {
  const t = getTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = t[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
