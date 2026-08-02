import type { Layer0EntityKind } from '@/types/layer0'

/**
 * The Idea System — Develop Milestone 1 (`docs/IDEA_SYSTEM_PLAN.md`). One
 * captured thought, deliberately the only object this milestone introduces.
 * Upstream of, and structurally separate from, Layer 0 exactly the way
 * Layer 0 itself is upstream of Layer 2 (Content) — see `types/layer0.ts`'s
 * own doc comment for the identical one-way-boundary reasoning. An Idea is
 * a front door to Layer 0 data (via `promotedTo`), not a replacement for
 * it: nothing about `Layer0Bible`, the continuity checker, prompt
 * generation, or any export path changes because Ideas exist.
 */
export type IdeaStatus = 'new' | 'in-progress' | 'used' | 'archived'

/** Display metadata for each status — the one place a status pill/filter
 * needs to read from, mirroring `LAYER0_KIND_LABELS`'s own role for entity
 * kinds. Order matches the union's natural progression. */
export const IDEA_STATUSES: IdeaStatus[] = ['new', 'in-progress', 'used', 'archived']

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  new: 'New',
  'in-progress': 'In Progress',
  used: 'Used',
  archived: 'Archived',
}

/**
 * One captured thought. Deliberately has exactly one required field —
 * everything else is something an author can add later, never something
 * capture is gated on. `text` is genuinely freeform: a stray idea, a name,
 * a link, a half sentence — same shape regardless of what it turns out to
 * be.
 */
export interface Idea {
  id: string
  text: string
  createdAt: string
  updatedAt: string
  status: IdeaStatus
  tags?: string[]
  /** Other Ideas this one connects to, picked by hand from Idea detail —
   * not a graph view, not automatic, just a "related to" list kept in sync
   * both directions by `updateIdeaWithHistory`'s callers (see
   * `IdeaDetailDialog.tsx`). */
  relatedIdeaIds?: string[]
  /** Where in the manuscript this was captured, if anywhere — set
   * automatically when the capture affordance is used from an open
   * chapter, absent for an Idea captured from Develop directly. Not used
   * for anything beyond "jump back to where I was" in Milestone 1. */
  linkedChapterId?: string
  /** The specific block this was captured against, if a block was selected
   * at the time (Phase 83) — mirrors `Note.blockId`. Strictly more precise
   * than `linkedChapterId`, which stays set alongside it (same "keep the
   * parent id alongside the child id" convention `Note.chapterId` already
   * uses) since a chapter-level link still means something once a block is
   * deleted or the idea is captured with no block in focus. Powers
   * `IdeaIndicatorBadge` — the small margin marker on the block itself. */
  linkedBlockId?: string
  /** Set once, the moment an Idea is promoted — never cleared, never
   * overwritten. A promoted Idea stays visible in the inbox (filtered into
   * the Archived bucket by default) as a record of where that structured
   * entity came from, not deleted or hidden outright. */
  promotedTo?: { kind: Layer0EntityKind; entityId: string }
  /**
   * Reference/inspiration images attached to this Idea (Phase 93, user:
   * "theres no place for example ideas/images think pintrest") — ids into
   * the existing `assetStore`/IndexedDB asset library, exactly like
   * `IllustrationBrief.referenceAssetId` already does for a single image,
   * generalised to a list since a mood-board entry often wants several. No
   * new storage: these are the same assets a manuscript `ImageBlock` could
   * point at, just referenced rather than duplicated. First image (if any)
   * is the card's cover in the Ideas Board view (`IdeaInboxPanel.tsx`);
   * absent or empty means a plain text card, same as every Idea today.
   */
  imageAssetIds?: string[]
}
