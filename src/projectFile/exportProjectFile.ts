import { buildZip, type ZipEntry } from '@/epub/zipWriter'
import { PROJECT_FILE_VERSION, type ProjectFileManifest } from '@/types/projectFile'
import type { Project } from '@/types/project'
import type { Manuscript } from '@/types/content'
import type { StructuralPage } from '@/types/structuralPage'
import type { Note } from '@/store/notesStore'
import type { CustomTheme } from '@/store/customThemeStore'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'
import type { Idea } from '@/types/idea'

export interface ProjectFileSource {
  project: Project
  manuscript: Manuscript
  structuralPages: StructuralPage[]
  notes: Note[]
  /** `null` when `project.settings.themeId` isn't a custom theme (i.e. it's
   * one of the built-in presets, which every install already has — nothing
   * to bundle). */
  customTheme: CustomTheme | null
  assets: ImageAsset[]
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>
  /** Layer 0's planning bible for this project — see `types/projectFile.ts`'s
   * `ProjectFileBundle.layer0Bible` doc comment for why this doesn't need a
   * format-version bump. */
  layer0Bible: Layer0Bible
  /** The Idea System's captured thoughts for this project — see
   * `types/projectFile.ts`'s `ProjectFileBundle.ideas` doc comment. */
  ideas: Idea[]
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/svg+xml') return 'svg'
  return 'bin'
}

/**
 * Packs everything one project owns into a single ZIP archive: manuscript,
 * structural pages, notes, the project's custom theme (if it uses one) and
 * every image asset's actual bytes — not just a reference to them, since
 * IndexedDB blobs don't travel with the project on their own. Reuses
 * `epub/zipWriter.ts` (a generic ZIP writer, not EPUB-specific — see that
 * file's own doc comment) rather than a second archive implementation.
 *
 * A missing asset blob (shouldn't happen, but IndexedDB access can fail)
 * skips that one image rather than aborting the whole export — a project
 * file missing one photo is far better than a user who can't save at all.
 */
export async function buildProjectFile(source: ProjectFileSource): Promise<Blob> {
  const { project, manuscript, structuralPages, notes, customTheme, assets, getAssetBlob, layer0Bible, ideas } = source
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = []
  const json = (value: unknown) => encoder.encode(JSON.stringify(value, null, 2))

  const manifest: ProjectFileManifest = {
    formatVersion: PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: project.name, category: project.category, settings: project.settings },
  }

  entries.push({ name: 'manifest.json', data: json(manifest) })
  entries.push({ name: 'manuscript.json', data: json(manuscript) })
  entries.push({ name: 'structuralPages.json', data: json(structuralPages) })
  entries.push({ name: 'notes.json', data: json(notes) })
  entries.push({ name: 'customTheme.json', data: json(customTheme) })
  entries.push({ name: 'assets/manifest.json', data: json(assets) })
  entries.push({ name: 'layer0.json', data: json(layer0Bible) })
  entries.push({ name: 'ideas.json', data: json(ideas) })

  for (const asset of assets) {
    const blob = await getAssetBlob(asset.id)
    if (!blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    entries.push({ name: `assets/${asset.id}.${extensionForMimeType(asset.mimeType)}`, data: bytes })
  }

  return buildZip(entries)
}
