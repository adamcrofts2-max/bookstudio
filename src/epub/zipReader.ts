import { crc32 } from '@/epub/crc32'

/**
 * The read-side counterpart to `zipWriter.ts` — parses a ZIP archive
 * (STORE + DEFLATE, the exact two methods that writer ever produces) back
 * into a flat list of named byte arrays. Despite living next to the EPUB
 * exporter, neither this file nor `zipWriter.ts` contains anything
 * EPUB-specific — both are generic ZIP primitives, reused as-is by
 * `projectFile/importProjectFile.ts` (Phase 51, ".bookstudio" project
 * files) rather than duplicating ZIP-parsing logic a second time. Kept
 * dependency-free for the same reason `zipWriter.ts` is: this sandbox can't
 * `npm install` a library, and the format's core is small enough to
 * implement directly and verify with `tsc -b` alone.
 *
 * Reads via the End-Of-Central-Directory + Central Directory records
 * (search backward for the EOCD signature, then walk exactly as many
 * central-directory records as it reports) rather than sequentially
 * scanning local file headers — the standard, robust way to parse a ZIP,
 * and immune to any local-header padding/ordering quirks a different
 * writer might produce.
 */

export interface ZipReadEntry {
  name: string
  data: Uint8Array
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
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

/** Scans backward from the end of the file for the End-Of-Central-Directory
 * signature — it's always the last record in the archive, but may be
 * preceded by a variable-length comment field, so a fixed offset from the
 * end can't be assumed. */
function findEocd(bytes: Uint8Array): number {
  const signature = 0x06054b50
  const minEocdSize = 22
  for (let i = bytes.length - minEocdSize; i >= 0; i--) {
    if (
      bytes[i] === (signature & 0xff) &&
      bytes[i + 1] === ((signature >>> 8) & 0xff) &&
      bytes[i + 2] === ((signature >>> 16) & 0xff) &&
      bytes[i + 3] === ((signature >>> 24) & 0xff)
    ) {
      return i
    }
  }
  throw new Error('Not a valid ZIP archive: end-of-central-directory record not found.')
}

/** Parses a ZIP archive's raw bytes into its entries. Throws if the archive
 * is malformed or a CRC-32 check fails — a corrupt project file should
 * surface as a clear error, never a silently-wrong import. */
export async function readZip(bytes: Uint8Array): Promise<ZipReadEntry[]> {
  const eocdOffset = findEocd(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)

  const decoder = new TextDecoder()
  const entries: ZipReadEntry[] = []
  let pos = centralDirOffset

  for (let i = 0; i < totalEntries; i++) {
    const signature = view.getUint32(pos, true)
    if (signature !== 0x02014b50) {
      throw new Error(`Not a valid ZIP archive: expected central directory entry at byte ${pos}.`)
    }
    const method = view.getUint16(pos + 10, true)
    const crc = view.getUint32(pos + 16, true)
    const compressedSize = view.getUint32(pos + 20, true)
    const uncompressedSize = view.getUint32(pos + 24, true)
    const nameLength = view.getUint16(pos + 28, true)
    const extraLength = view.getUint16(pos + 30, true)
    const commentLength = view.getUint16(pos + 32, true)
    const localHeaderOffset = view.getUint32(pos + 42, true)
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength))

    // Jump to the local header to find where this entry's actual data
    // starts — its name/extra-field lengths can differ from the central
    // directory's own copies, so the data offset can't be derived from the
    // central directory alone.
    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)

    const data = method === 0 ? compressed.slice() : await inflateRaw(compressed)
    if (data.length !== uncompressedSize || crc32(data) !== crc) {
      throw new Error(`Corrupt ZIP entry "${name}": checksum or size mismatch.`)
    }
    entries.push({ name, data })

    pos += 46 + nameLength + extraLength + commentLength
  }

  return entries
}
