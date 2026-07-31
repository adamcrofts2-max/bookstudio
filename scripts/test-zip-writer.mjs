// Standalone reproduction of crc32.ts + zipWriter.ts's logic, used only to
// verify the hand-built ZIP format is byte-correct against a real,
// independent ZIP implementation (Python's `zipfile`) — see
// docs/STATUS.md Phase 40's verification note. Not part of the app build;
// safe to delete after verification, kept for now as a regression check
// anyone can re-run with `node scripts/test-zip-writer.mjs`.

let table
function crc32(data) {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function deflateRaw(data) {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(data)
  writer.close()
  const chunks = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosYear = Math.max(0, date.getFullYear() - 1980)
  const dateField = (dosYear << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: dateField }
}

async function buildZip(entries) {
  const encoder = new TextEncoder()
  const now = new Date()
  const { time, date } = dosDateTime(now)
  const prepared = []
  const localChunks = []
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
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, method, true)
    view.setUint16(10, time, true)
    view.setUint16(12, date, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, compressed.length, true)
    view.setUint32(22, entry.data.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true)
    header.set(nameBytes, 30)

    prepared.push({ nameBytes, compressed, crc, method, time, date, uncompressedSize: entry.data.length, localHeaderOffset: offset })
    localChunks.push(header, compressed)
    offset += header.length + compressed.length
  }

  const centralDirStart = offset
  const centralChunks = []
  for (const p of prepared) {
    const record = new Uint8Array(46 + p.nameBytes.length)
    const view = new DataView(record.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, p.method, true)
    view.setUint16(12, p.time, true)
    view.setUint16(14, p.date, true)
    view.setUint32(16, p.crc, true)
    view.setUint32(20, p.compressed.length, true)
    view.setUint32(24, p.uncompressedSize, true)
    view.setUint16(28, p.nameBytes.length, true)
    view.setUint16(30, 0, true)
    view.setUint16(32, 0, true)
    view.setUint16(34, 0, true)
    view.setUint16(36, 0, true)
    view.setUint32(38, 0, true)
    view.setUint32(42, p.localHeaderOffset, true)
    record.set(p.nameBytes, 46)
    centralChunks.push(record)
    offset += record.length
  }
  const centralDirSize = offset - centralDirStart

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(4, 0, true)
  eocdView.setUint16(6, 0, true)
  eocdView.setUint16(8, prepared.length, true)
  eocdView.setUint16(10, prepared.length, true)
  eocdView.setUint32(12, centralDirSize, true)
  eocdView.setUint32(16, centralDirStart, true)
  eocdView.setUint16(20, 0, true)

  const parts = [...localChunks, ...centralChunks, eocd]
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

const enc = new TextEncoder()
const zipBytes = await buildZip([
  { name: 'mimetype', data: enc.encode('application/epub+zip'), store: true },
  { name: 'OEBPS/chapter-1.xhtml', data: enc.encode('<html><body><h1>Hello World</h1><p>' + 'A long paragraph. '.repeat(50) + '</p></body></html>') },
  { name: 'OEBPS/styles.css', data: enc.encode('body { color: red; }') },
])

const fs = await import('node:fs')
fs.writeFileSync('/tmp/test-book.epub', zipBytes)
console.log('Wrote /tmp/test-book.epub,', zipBytes.length, 'bytes')
