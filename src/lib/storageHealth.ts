/**
 * How safe is the work on this device, and does the browser agree?
 *
 * Everything Book Studio holds — projects, the manuscript, image assets,
 * and the version snapshots that exist to protect all three — lives in one
 * browser profile's `localStorage` and IndexedDB. That storage is, by
 * default, *evictable*: a browser under disk pressure may clear it, and
 * some engines expire unvisited origins outright. The safety net is stored
 * inside the thing it protects against, which is the one genuinely
 * catastrophic failure mode left in the app (Phase 158).
 *
 * Two small standard APIs make that a lot less likely, and this module is
 * the app's only contact with either:
 *
 * - `navigator.storage.persist()` asks the browser to exempt this origin
 *   from automatic eviction. Chromium grants it silently on an engaged
 *   origin, Firefox prompts, Safari doesn't implement it. Asking costs
 *   nothing and can only improve matters.
 * - `navigator.storage.estimate()` reports usage against quota, which is
 *   what lets the app warn *before* a write fails rather than after.
 *
 * Neither replaces a copy on real disk — see `useAutoBackup.ts` for that.
 * Every function here degrades to a clear "unsupported" rather than
 * throwing: these APIs are absent in more browsers than they're present in.
 */

export type PersistenceState = 'persisted' | 'denied' | 'unsupported'

interface StorageManagerish {
  persist?: () => Promise<boolean>
  persisted?: () => Promise<boolean>
  estimate?: () => Promise<{ usage?: number; quota?: number }>
}

function storageManager(): StorageManagerish | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator.storage as StorageManagerish | undefined)
}

/** Whether this origin is *already* exempt from eviction, without asking. */
export async function readPersistenceState(): Promise<PersistenceState> {
  const storage = storageManager()
  if (!storage?.persisted) return 'unsupported'
  try {
    return (await storage.persisted()) ? 'persisted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/**
 * Asks the browser to keep this origin's data. Safe to call repeatedly —
 * an origin that already has permission short-circuits — but the app only
 * calls it once per install (see `useAutoBackup.ts`), because in Firefox
 * this is a visible permission prompt and a prompt on every launch would
 * be its own kind of rude.
 */
export async function requestPersistentStorage(): Promise<PersistenceState> {
  const storage = storageManager()
  if (!storage?.persist) return 'unsupported'
  try {
    return (await storage.persist()) ? 'persisted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

export interface StorageEstimate {
  usageBytes: number
  quotaBytes: number
  /** 0..1. `quota` of 0 (or absent) reports 0 rather than dividing by zero. */
  ratio: number
}

export async function readStorageEstimate(): Promise<StorageEstimate | null> {
  const storage = storageManager()
  if (!storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await storage.estimate()
    return { usageBytes: usage, quotaBytes: quota, ratio: quota > 0 ? usage / quota : 0 }
  } catch {
    return null
  }
}

/**
 * The point at which the app starts saying something. Deliberately well
 * short of full: the failure this exists to prevent is a write that can't
 * complete, and by the time a quota is actually exhausted the useful
 * remedies (save a copy, delete a finished project) are the ones that need
 * room to run.
 */
export const STORAGE_WARNING_RATIO = 0.8

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
