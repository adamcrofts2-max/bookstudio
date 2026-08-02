import type { BookForm, ProjectCategory, ProjectSettings } from '@/types/project'
import type { Manuscript } from '@/types/content'
import type { StructuralPage } from '@/types/structuralPage'
import type { Note } from '@/store/notesStore'
import type { CustomTheme } from '@/store/customThemeStore'
import type { ImageAsset } from '@/types/asset'
import type { Layer0Bible } from '@/types/layer0'
import type { Idea } from '@/types/idea'

/**
 * The ".bookstudio" project file format (Phase 51) — a portable, self-
 * contained snapshot of one project, for "save to desktop / load on another
 * machine" the way a native desktop app's own file format works. Deliberately
 * separate from `store/snapshotDb.ts`'s autosave snapshots: those live in
 * this browser's IndexedDB only (manuscript + settings, no asset blobs — see
 * that file's own doc comment for why), while this format is the one that
 * actually travels — a real ZIP archive a user can email, back up, or open
 * on a different computer, so it bundles the image assets too.
 *
 * Bump `PROJECT_FILE_VERSION` and branch on `manifest.formatVersion` in
 * `projectFile/importProjectFile.ts` if this shape ever needs a breaking
 * change — exactly the same "version the persisted shape, never assume the
 * current code's types describe an old file" discipline
 * `structuralPageStore`/`contentStore`'s zustand `persist` versions already
 * follow for localStorage.
 */
export const PROJECT_FILE_VERSION = 1
export const PROJECT_FILE_EXTENSION = '.bookstudio'

export interface ProjectFileManifest {
  formatVersion: number
  exportedAt: string
  project: {
    name: string
    category: ProjectCategory
    /** See `types/project.ts`'s `BookForm` doc comment. Additive, same
     * convention as `layer0Bible`/`ideas` below — an archive saved before
     * this existed simply has no `bookForm` key, and Develop falls back to
     * its pre-Phase-83 generic labels/templates for that project. */
    bookForm?: BookForm
    settings: ProjectSettings
  }
}

/** The fully-parsed, in-memory contents of a `.bookstudio` archive, ready to
 * be written into every store `importProjectFile.ts` touches. Asset blobs
 * are kept alongside their metadata rather than as a separate parallel
 * array, so nothing can accidentally get out of sync between the two. */
export interface ProjectFileBundle {
  manifest: ProjectFileManifest
  manuscript: Manuscript
  structuralPages: StructuralPage[]
  notes: Note[]
  customTheme: CustomTheme | null
  assets: { asset: ImageAsset; blob: Blob }[]
  /** Layer 0's planning bible (Character/Location/Timeline/etc. — see
   * `types/layer0.ts`). Added after `PROJECT_FILE_VERSION` 1 shipped, but
   * deliberately NOT a version bump — same additive-field convention every
   * other purely-additive field in this codebase uses (e.g. `CoverElement
   * .rotation`): a `.bookstudio` file saved before Layer 0 existed simply
   * has no `layer0.json` entry, and `importProjectFile.ts`'s
   * `parseProjectFile` reads that case as an empty bible rather than
   * failing to open the file at all. */
  layer0Bible: Layer0Bible
  /** The Idea System's captured thoughts (Develop Milestone 1,
   * `docs/IDEA_SYSTEM_PLAN.md`). Added after `PROJECT_FILE_VERSION` 1
   * shipped — same deliberately-not-a-version-bump, purely-additive
   * convention `layer0Bible` above already established: a `.bookstudio`
   * file saved before Ideas existed simply has no `ideas.json` entry, and
   * `importProjectFile.ts`'s `parseProjectFile` reads that case as an
   * empty list rather than failing to open the file at all. */
  ideas: Idea[]
}
