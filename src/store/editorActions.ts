import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { useContentStore } from '@/store/contentStore'
import { useHistoryStore } from '@/store/historyStore'
import type { ContentBlock } from '@/types/content'

/**
 * History-aware wrapper functions around the real `contentStore`/
 * `assetStore` mutating actions. These are the new call sites for every
 * piece of editing UI — see `docs/STATUS.md`'s Phase 14 entry for the full
 * migration list. Each wrapper's job is: snapshot enough state to invert
 * the mutation, perform the real mutation via the store's own published
 * action (never by reaching into store internals — see CLAUDE.md's
 * "no layer directly mutates another layer's data"), then `record` a
 * command on `historyStore` so it can be undone/redone later.
 *
 * `virtualEditorStore.ts`'s `acceptFix`/`restoreRevision` are intentionally
 * NOT migrated to go through this module — that system has its own
 * parallel, non-destructive revision/restore flow and unifying the two is
 * an explicit non-goal for this milestone (see CLAUDE.md).
 */

function labelForBlock(block: ContentBlock): string {
  return block.type === 'image' ? 'Edit image' : 'Edit text'
}

/**
 * History-aware replacement for `contentStore.updateBlock`. Reads the full
 * current block before mutating so undo can restore it exactly — relies on
 * `updateBlock` shallow-merging its `updates` argument into the existing
 * block, so spreading the *entire* old block back in as the "updates"
 * fully restores every field, not just the ones this particular edit
 * touched.
 */
export function editBlock(
  projectId: string,
  chapterId: string,
  blockId: string,
  updates: Partial<ContentBlock>,
): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
  const oldBlock = chapter?.blocks.find((b) => b.id === blockId)

  useContentStore.getState().updateBlock(projectId, chapterId, blockId, updates)

  // No block found to snapshot (shouldn't happen in practice — every call
  // site resolves the block from selection/props first) — the mutation
  // above already ran, but there's nothing sensible to invert, so skip
  // recording a command rather than record one whose undo would no-op.
  if (!oldBlock) return

  useHistoryStore.getState().record(
    projectId,
    labelForBlock(oldBlock),
    () => useContentStore.getState().updateBlock(projectId, chapterId, blockId, oldBlock),
    () => useContentStore.getState().updateBlock(projectId, chapterId, blockId, updates),
  )
}

/** History-aware replacement for `contentStore.insertBlock` (drag-and-drop
 * image placement). Undo removes the just-inserted block; redo re-inserts
 * it at the same position. */
export function insertBlockWithHistory(
  projectId: string,
  chapterId: string,
  afterBlockId: string | null,
  block: ContentBlock,
): void {
  useContentStore.getState().insertBlock(projectId, chapterId, afterBlockId, block)

  useHistoryStore.getState().record(
    projectId,
    block.type === 'image' ? 'Insert image' : 'Insert block',
    () => useContentStore.getState().deleteBlock(projectId, chapterId, block.id),
    () => useContentStore.getState().insertBlock(projectId, chapterId, afterBlockId, block),
  )
}

/**
 * History-aware replacement for `contentStore.deleteBlock`. Captures the
 * block's current position (via the id of its immediate predecessor, or
 * `null` if it was first) and a full snapshot BEFORE deleting, so undo can
 * re-`insertBlock` it back in the exact same spot.
 */
export function deleteBlockWithHistory(projectId: string, chapterId: string, blockId: string): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
  const index = chapter ? chapter.blocks.findIndex((b) => b.id === blockId) : -1
  const snapshot = index >= 0 && chapter ? chapter.blocks[index] : undefined
  const precedingBlockId = index > 0 && chapter ? chapter.blocks[index - 1].id : null

  useContentStore.getState().deleteBlock(projectId, chapterId, blockId)

  // Block wasn't found (shouldn't happen in practice) — mutation above is
  // already a no-op in that case; nothing to record.
  if (!snapshot) return

  useHistoryStore.getState().record(
    projectId,
    snapshot.type === 'image' ? 'Delete image' : 'Delete block',
    () => useContentStore.getState().insertBlock(projectId, chapterId, precedingBlockId, snapshot),
    () => useContentStore.getState().deleteBlock(projectId, chapterId, blockId),
  )
}

/** History-aware replacement for `contentStore.renameChapter`. */
export function renameChapterWithHistory(projectId: string, chapterId: string, title: string): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const oldTitle = manuscript?.chapters.find((c) => c.id === chapterId)?.title

  useContentStore.getState().renameChapter(projectId, chapterId, title)

  if (oldTitle === undefined) return

  useHistoryStore.getState().record(
    projectId,
    'Rename chapter',
    () => useContentStore.getState().renameChapter(projectId, chapterId, oldTitle),
    () => useContentStore.getState().renameChapter(projectId, chapterId, title),
  )
}

/**
 * History-aware replacement for `assetStore.removeAsset` — the one
 * genuinely destructive, previously-unconfirmed action this milestone
 * closes the gap on (see CLAUDE.md's "illustrations are sacred" principle).
 * Snapshots the asset's metadata AND its blob BEFORE deleting so undo can
 * restore it byte-for-byte under the same id via `assetStore.restoreAsset`.
 * If either is missing (asset already gone / blob missing) the deletion
 * still proceeds but no history entry is recorded, since there'd be
 * nothing to restore.
 */
export async function removeAssetWithHistory(projectId: string, assetId: string): Promise<void> {
  const asset = useAssetStore.getState().byProject[projectId]?.find((a) => a.id === assetId)
  const blob = await getAssetBlob(assetId)

  await useAssetStore.getState().removeAsset(projectId, assetId)

  if (!asset || !blob) return

  useHistoryStore.getState().record(
    projectId,
    'Delete image asset',
    () => {
      void useAssetStore.getState().restoreAsset(projectId, asset, blob)
    },
    () => {
      void useAssetStore.getState().removeAsset(projectId, assetId)
    },
  )
}
