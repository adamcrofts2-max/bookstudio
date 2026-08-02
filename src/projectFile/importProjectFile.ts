import { readZip } from '@/epub/zipReader'
import { PROJECT_FILE_VERSION, type ProjectFileBundle, type ProjectFileManifest } from '@/types/projectFile'
import type { Manuscript } from '@/types/content'
import type { StructuralPage } from '@/types/structuralPage'
import type { Note } from '@/store/notesStore'
import type { CustomTheme } from '@/store/customThemeStore'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'
import { EMPTY_LAYER0_BIBLE } from '@/store/layer0Store'
import type { Idea } from '@/types/idea'

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

/**
 * Parses a `.bookstudio` archive's raw bytes back into a `ProjectFileBundle`
 * — the read-side counterpart to `exportProjectFile.ts`'s `buildProjectFile`.
 * Deliberately validates every required entry exists and the manifest's
 * `formatVersion` is one this build understands, so a corrupt or
 * from-the-future file surfaces a clear error rather than a confusing
 * half-imported project — see `useImportProjectFile.ts`, the only caller,
 * for how that error reaches the user.
 */
export async function parseProjectFile(bytes: Uint8Array): Promise<ProjectFileBundle> {
  const entries = await readZip(bytes)
  const byName = new Map(entries.map((e) => [e.name, e.data]))
  const decoder = new TextDecoder()
  const json = <T,>(name: string): T => {
    const data = byName.get(name)
    if (!data) throw new Error(`This project file is missing "${name}" — it may be corrupt or from an unsupported source.`)
    return JSON.parse(decoder.decode(data)) as T
  }
  /** Same as `json` but tolerant of a missing entry — for fields added
   * after a project file was already saved (see `ProjectFileBundle
   * .layer0Bible`'s doc comment). A file from before that field existed
   * simply has no matching entry; that's not corruption, just an older
   * export. */
  const optionalJson = <T,>(name: string, fallback: T): T => {
    const data = byName.get(name)
    return data ? (JSON.parse(decoder.decode(data)) as T) : fallback
  }

  const manifest = json<ProjectFileManifest>('manifest.json')
  if (manifest.formatVersion > PROJECT_FILE_VERSION) {
    throw new Error('This project file was saved by a newer version of Book Studio. Please update the app and try again.')
  }

  const manuscript = json<Manuscript>('manuscript.json')
  const structuralPages = json<StructuralPage[]>('structuralPages.json')
  const notes = json<Note[]>('notes.json')
  const customTheme = json<CustomTheme | null>('customTheme.json')
  const assetMetadata = json<ImageAsset[]>('assets/manifest.json')
  const layer0Bible = optionalJson<Layer0Bible>('layer0.json', EMPTY_LAYER0_BIBLE)
  const ideas = optionalJson<Idea[]>('ideas.json', [])

  const assets: ProjectFileBundle['assets'] = []
  for (const asset of assetMetadata) {
    const entry = entries.find((e) => e.name.startsWith(`assets/${asset.id}.`))
    if (!entry) continue // same "skip, don't abort" tolerance exportProjectFile.ts's own missing-blob case uses
    const extension = entry.name.split('.').pop() ?? ''
    const mimeType = MIME_BY_EXTENSION[extension] ?? asset.mimeType
    assets.push({ asset, blob: new Blob([entry.data as BlobPart], { type: mimeType }) })
  }

  return { manifest, manuscript, structuralPages, notes, customTheme, assets, layer0Bible, ideas }
}
