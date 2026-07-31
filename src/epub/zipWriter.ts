import { crc32 } from '@/epub/crc32'

/**
 * Minimal, dependency-free ZIP writer — built specifically so EPUB export
 * doesn't need a new npm package. This sandbox has no network access to
 * `npm install` a zip library, but a real Vercel deployment build does —
 * the decision to write this from scratch instead was made anyway, because
 * it's fully verifiable with the one tool actually available here
 * (`tsc -b`, no `node_modules` round-trip needed) and avoids taking on an
 * unaudited dependency for what the ZIP spec's core (STORE + DEFLATE,
 * local header + central directory + end-of-central-directory record) is a
 * genuinely small, well-defined format. See docs/STATUS.md Phase 40.
 *
 * Compression uses the Web platform's built-in `CompressionStream`
 * (`'deflate-raw'`) — supported in every evergreen browser this app
 * already targets (Chrome/Edge 80+, Firefox 113+, Safari 16.4+) — so this
 * carries no dependency at all, just a browser-API version floor
 * consistent with the rest of the app's use of modern CSS/JS features.
 */

export interface ZipEntry {
  /** Path inside the archive, e.g. `'OEBPS/chapter-1.xhtml'`. Always
   * forward-slash separated per the ZIP spec, regardless of host OS. */
  name: string
  data: Uint8Array
  /** `true` disables compression (method 0, "stored"). EPUB requires its
   * `mimetype` entry to be stored, not deflated — see `exportEpub.ts`. */
  store?: boolean
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  // Deliberately not awaited before `close()` — `CompressionStream`
  // buffers internally; the reader loop below drains everything written by
  // the time it sees `done`, regardless of write/close ordering.
  // Cast needed because TS's stream typings pin the writable side to
  // `Uint8Array<ArrayBuffer>` specifically (excluding the more general
  // `Uint8Array<ArrayBufferLike>` this function's own parameter accepts) —
  // safe here since every caller's bytes come from `TextEncoder.encode` or
  // canvas PNG export, never a `SharedArrayBuffer`-backed view.
  void writer.write(data as Uint8Array<ArrayBuffer>)
  void writer.close()

  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  return out
}

/** Packs a JS `Date` into the DOS date/time pair every ZIP header field
 * requires (5-bit seconds/2, 6-bit minute, 5-bit hour; 5-bit day, 4-bit
 * month, 7-bit year-since-1980) — cosmetic only (file manager "modified"
 * column), never affects whether the archive is valid. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosYear = Math.max(0, date.getFullYear() - 1980)
  const dateField = (dosYear << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: dateField }
}

interface PreparedEntry {
  nameBytes: Uint8Array
  compressed: Uint8Array
  crc: number
  method: number
  time: number
  date: number
  uncompressedSize: number
  localHeaderOffset: number
}

/**
 * Builds a real ZIP archive (STORE + DEFLATE, version-20 headers, standard
 * central directory) from a flat list of entries, in the order given —
 * order matters for EPUB, whose `mimetype` entry must be first and stored
 * uncompressed. Returns a `Blob` ready to save or hand to
 * `URL.createObjectURL`.
 */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const now = new Date()
  const { time, date } = dosDateTime(now)

  const prepared: PreparedEntry[] = []
  const localChunks: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const useStore = entry.store === true
    const compressed = useStore ? entry.data : await deflateRaw(entry.data)
    const method = useStore ? 0 : 8

    const header = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true) // version needed to extract
    view.setUint16(6, 0, true) // general purpose flag
    view.setUint16(8, method, true)
    view.setUint16(10, time, true)
    view.setUint16(12, date, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, compressed.length, true)
    view.setUint32(22, entry.data.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true) // extra field length
    header.set(nameBytes, 30)

    prepared.push({
      nameBytes,
      compressed,
      crc,
      method,
      time,
      date,
      uncompressedSize: entry.data.length,
      localHeaderOffset: offset,
    })
    localChunks.push(header, compressed)
    offset += header.length + compressed.length
  }

  const centralDirStart = offset
  const centralChunks: Uint8Array[] = []
  for (const p of prepared) {
    const record = new Uint8Array(46 + p.nameBytes.length)
    const view = new DataView(record.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true) // version made by
    view.setUint16(6, 20, true) // version needed to extract
    view.setUint16(8, 0, true) // general purpose flag
    view.setUint16(10, p.method, true)
    view.setUint16(12, p.time, true)
    view.setUint16(14, p.date, true)
    view.setUint32(16, p.crc, true)
    view.setUint32(20, p.compressed.length, true)
    view.setUint32(24, p.uncompressedSize, true)
    view.setUint16(28, p.nameBytes.length, true)
    view.setUint16(30, 0, true) // extra field length
    view.setUint16(32, 0, true) // comment length
    view.setUint16(34, 0, true) // disk number start
    view.setUint16(36, 0, true) // internal file attributes
    view.setUint32(38, 0, true) // external file attributes
    view.setUint32(42, p.localHeaderOffset, true)
    record.set(p.nameBytes, 46)
    centralChunks.push(record)
    offset += record.length
  }
  const centralDirSize = offset - centralDirStart

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(4, 0, true) // disk number
  eocdView.setUint16(6, 0, true) // disk with central dir start
  eocdView.setUint16(8, prepared.length, true) // entries on this disk
  eocdView.setUint16(10, prepared.length, true) // total entries
  eocdView.setUint32(12, centralDirSize, true)
  eocdView.setUint32(16, centralDirStart, true)
  eocdView.setUint16(20, 0, true) // comment length

  return new Blob([...localChunks, ...centralChunks, eocd] as BlobPart[], { type: 'application/epub+zip' })
}
