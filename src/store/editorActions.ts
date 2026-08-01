import { useAssetStore } from '@/store/assetStore'
import { getAssetBlob } from '@/store/assetDb'
import { useContentStore } from '@/store/contentStore'
import { useHistoryStore } from '@/store/historyStore'
import { useStructuralPageStore } from '@/store/structuralPageStore'
import { useNotesStore, type Note } from '@/store/notesStore'
import { useLayer0Store } from '@/store/layer0Store'
import { generateId } from '@/utils'
import type { Chapter, ContentBlock } from '@/types/content'
import type { StructuralPage, StructuralPageCategory, StructuralPageType } from '@/types/structuralPage'
import type { Layer0Bible } from '@/types/layer0'
import { patchTextField } from '@/virtualEditor/textPatch'
import type { SearchMatch } from '@/search/manuscriptSearch'
import { replaceAllOccurrences, replaceOccurrence } from '@/search/manuscriptSearch'

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
 * current block before mutating so undo can restore it exactly.
 *
 * Undo calls `contentStore.replaceBlock` (a full, non-merging replacement),
 * NOT `updateBlock` — mirroring `updatePageContentWithHistory`'s
 * `replacePageContent` fix (see docs/STATUS.md's Phase 20 entry) exactly,
 * for the identical reason: `updateBlock`'s shallow merge is correct for a
 * live edit (typing into one field must never clobber sibling fields), but
 * that same merge silently fails to restore a field from present back to
 * *absent* on undo — spreading `oldBlock` back in as `updates` only
 * "restores" keys `oldBlock` actually has; an optional field `oldBlock`
 * never had at all (e.g. a Gallery's `caption`, or a Pull Quote's
 * `attribution`, before either was ever set) can't be cleared by a merge,
 * since a merge only ever adds/overwrites keys, never deletes them. This
 * was a real latent bug (present since Phase 17, for every optional field
 * on every block type, not just the 8 new Milestone 5 types) — found while
 * verifying Milestone 5's new array-shaped fields per the milestone's own
 * brief, fixed here the same way Phase 20 fixed the structural-page
 * equivalent. Redo is unaffected: it re-applies `updates` as a merge on top
 * of the now-fully-restored old block, exactly reproducing the original
 * forward edit.
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
    () => useContentStore.getState().replaceBlock(projectId, chapterId, blockId, oldBlock),
    () => useContentStore.getState().updateBlock(projectId, chapterId, blockId, updates),
  )
}

/**
 * Replaces one Search-panel match (`src/search/manuscriptSearch.ts`) — reads
 * the affected block's current raw field text via `virtualEditor/textPatch
 * .ts`'s `getRawFieldText` (indirectly, via `patchTextField`), replaces just
 * that match's occurrence, and applies it through `editBlock` above so it's
 * undoable exactly like any other content edit. No-op if the block can no
 * longer be found (e.g. deleted since the search results were computed).
 */
export function replaceMatchWithHistory(
  projectId: string,
  match: SearchMatch,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const chapter = manuscript?.chapters.find((c) => c.id === match.chapterId)
  const block = chapter?.blocks.find((b) => b.id === match.blockId)
  if (!block) return

  const patch = patchTextField(block, match.field, (text) =>
    replaceOccurrence(text, query, match.occurrenceIndexInField, replacement, caseSensitive),
  )
  editBlock(projectId, match.chapterId, match.blockId, patch)
}

/**
 * Replaces every current Search-panel match at once (Replace All). Groups
 * matches by their `(blockId, field)` pair first so a field with several
 * occurrences gets exactly one `editBlock` call — one history entry, one
 * undo step — rather than one per occurrence.
 */
export function replaceAllMatchesWithHistory(
  projectId: string,
  matches: SearchMatch[],
  query: string,
  replacement: string,
  caseSensitive: boolean,
): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  if (!manuscript) return

  const seenFields = new Set<string>()
  for (const match of matches) {
    const fieldKey = `${match.blockId}:${match.field}`
    if (seenFields.has(fieldKey)) continue
    seenFields.add(fieldKey)

    const chapter = manuscript.chapters.find((c) => c.id === match.chapterId)
    const block = chapter?.blocks.find((b) => b.id === match.blockId)
    if (!block) continue

    const patch = patchTextField(block, match.field, (text) => replaceAllOccurrences(text, query, replacement, caseSensitive))
    editBlock(projectId, match.chapterId, match.blockId, patch)
  }
}

/**
 * History-aware replacement for `contentStore.replaceBlock` — swaps a block
 * for a wholly different one at the same position, e.g. converting an
 * image-kind placeholder into a real `ImageBlock` once the user uploads a
 * photo (Phase 51). Deliberately a separate wrapper from `editBlock`, which
 * only ever patches fields *within* the same block type — a type change
 * needs the full non-merging replace `editBlock`'s own undo path already
 * uses, not a merge.
 */
export function replaceBlockWithHistory(
  projectId: string,
  chapterId: string,
  blockId: string,
  newBlock: ContentBlock,
): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
  const oldBlock = chapter?.blocks.find((b) => b.id === blockId)

  useContentStore.getState().replaceBlock(projectId, chapterId, blockId, newBlock)

  if (!oldBlock) return

  useHistoryStore.getState().record(
    projectId,
    'Replace block',
    () => useContentStore.getState().replaceBlock(projectId, chapterId, blockId, oldBlock),
    () => useContentStore.getState().replaceBlock(projectId, chapterId, blockId, newBlock),
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

/**
 * History-aware "delete this page" for chapter-content/chapter-start pages.
 * Unlike a structural page (`deletePageWithHistory` below), a content page
 * has no single stored object to delete — it's whichever blocks
 * `paginate.ts` happened to flow onto it. Deleting "the page" here means
 * bulk-deleting exactly those blocks via `contentStore.deleteBlocks`, in one
 * commit. Snapshots the chapter's full block list BEFORE deleting so undo
 * restores the exact original array in one commit
 * (`replaceChapterBlocks`) regardless of how many blocks were removed;
 * redo re-runs the same bulk delete. A no-op if `blockIds` is empty (a
 * chapter-start page with no body blocks yet) or the chapter can't be found.
 */
export function deletePageBlocksWithHistory(projectId: string, chapterId: string, blockIds: string[]): void {
  if (blockIds.length === 0) return
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const chapter = manuscript?.chapters.find((c) => c.id === chapterId)
  if (!chapter) return
  const snapshot = chapter.blocks

  useContentStore.getState().deleteBlocks(projectId, chapterId, blockIds)

  useHistoryStore.getState().record(
    projectId,
    'Delete page',
    () => useContentStore.getState().replaceChapterBlocks(projectId, chapterId, snapshot),
    () => useContentStore.getState().deleteBlocks(projectId, chapterId, blockIds),
  )
}

/**
 * History-aware replacement for `contentStore.duplicateBlock`. Mirrors
 * `duplicatePageWithHistory`'s exact shape: perform the real (id-generating)
 * duplicate first, then look up the freshly-created block so undo/redo can
 * reference it directly (`deleteBlock` to undo, `insertBlock` with the exact
 * same object to redo) rather than re-deriving a new id a second time.
 */
export function duplicateBlockWithHistory(projectId: string, chapterId: string, blockId: string): string | undefined {
  const newId = useContentStore.getState().duplicateBlock(projectId, chapterId, blockId)
  if (!newId) return undefined
  const manuscript = useContentStore.getState().getManuscript(projectId)
  const created = manuscript?.chapters.find((c) => c.id === chapterId)?.blocks.find((b) => b.id === newId)

  if (created) {
    useHistoryStore.getState().record(
      projectId,
      'Duplicate block',
      () => useContentStore.getState().deleteBlock(projectId, chapterId, newId),
      () => useContentStore.getState().insertBlock(projectId, chapterId, blockId, created),
    )
  }

  return newId
}

/**
 * History-aware replacement for `contentStore.moveBlock`. A simple
 * adjacent-swap reorder is its own inverse — undo just moves the same block
 * one step the opposite direction. Mirrors `movePageWithHistory` exactly.
 */
export function moveBlockWithHistory(projectId: string, chapterId: string, blockId: string, direction: 'up' | 'down'): void {
  useContentStore.getState().moveBlock(projectId, chapterId, blockId, direction)
  const opposite = direction === 'up' ? 'down' : 'up'
  useHistoryStore.getState().record(
    projectId,
    'Reorder block',
    () => useContentStore.getState().moveBlock(projectId, chapterId, blockId, opposite),
    () => useContentStore.getState().moveBlock(projectId, chapterId, blockId, direction),
  )
}

/** History-aware replacement for `contentStore.moveChapter` — same shape as
 * `moveBlockWithHistory`/`movePageWithHistory` above/below. */
export function moveChapterWithHistory(projectId: string, chapterId: string, direction: 'up' | 'down'): void {
  useContentStore.getState().moveChapter(projectId, chapterId, direction)
  const opposite = direction === 'up' ? 'down' : 'up'
  useHistoryStore.getState().record(
    projectId,
    'Reorder chapter',
    () => useContentStore.getState().moveChapter(projectId, chapterId, opposite),
    () => useContentStore.getState().moveChapter(projectId, chapterId, direction),
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
 * History-aware "delete this chapter" — title AND every block it contains.
 * A distinct, larger action from `deletePageBlocksWithHistory` on purpose:
 * that one only ever clears a page's *body* blocks, deliberately leaving the
 * chapter title (and the chapter itself) untouched, since a "page" a user
 * sees on screen is just whichever blocks pagination flowed onto it this
 * pass — the title is the one piece of a chapter-opener page that isn't
 * page-scoped content. A user reported this exact gap: page content could
 * be deleted but "no way of deleting chapter titles" — this closes it by
 * giving chapter deletion its own explicit action, rather than overloading
 * the page-content delete button with ambiguous "does this also nuke the
 * title?" behaviour. See docs/STATUS.md Phase 34.
 *
 * Snapshots the full `manuscript.chapters` array BEFORE deleting so undo
 * restores it in one commit via `replaceChapters`, mirroring
 * `deletePageBlocksWithHistory`'s "snapshot the whole list" pattern — this
 * is a bigger, easier-to-regret action than most, but the app's established
 * pattern everywhere else is "no confirm dialog, undo covers it" (structural
 * pages, blocks, assets); a chapter delete is no less undoable than any of
 * those, just bigger, so there's no reason to special-case a confirm
 * prompt here.
 */
/**
 * History-aware "add a new chapter" — the counterpart to
 * `deleteChapterWithHistory` below, closing the "add" half of the gap a
 * user reported ("there should be a way to add/remove new chapters"; delete
 * already existed, add didn't). Always appends after `afterChapterId` (the
 * `Sidebar.tsx` "+" button always passes the current last chapter's id, so
 * a new chapter lands at the end of the book — the position a user expects
 * without having to reorder afterward); `null` also works for the
 * zero-chapters case, which starts a brand-new manuscript via
 * `contentStore.insertChapter`'s own fallback. The new chapter starts with
 * an empty `blocks` array — `title` is the chapter's own metadata field,
 * never duplicated as an in-body heading block, matching every
 * parser-created chapter's shape (see `parser/markdown.ts`). Returns the
 * new chapter's id so the caller can immediately enter rename mode on it.
 */
export function addChapterWithHistory(projectId: string, afterChapterId: string | null, title: string): string {
  const chapter: Chapter = { id: generateId('ch'), title, order: 0, blocks: [] }

  useContentStore.getState().insertChapter(projectId, afterChapterId, chapter)

  useHistoryStore.getState().record(
    projectId,
    'Add chapter',
    () => useContentStore.getState().deleteChapter(projectId, chapter.id),
    () => useContentStore.getState().insertChapter(projectId, afterChapterId, chapter),
  )

  return chapter.id
}

export function deleteChapterWithHistory(projectId: string, chapterId: string): void {
  const manuscript = useContentStore.getState().getManuscript(projectId)
  if (!manuscript) return
  const snapshot = manuscript.chapters
  const chapter = snapshot.find((c) => c.id === chapterId)
  if (!chapter) return

  useContentStore.getState().deleteChapter(projectId, chapterId)

  useHistoryStore.getState().record(
    projectId,
    'Delete chapter',
    () => useContentStore.getState().replaceChapters(projectId, snapshot),
    () => useContentStore.getState().deleteChapter(projectId, chapterId),
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

/**
 * History-aware wrappers around `structuralPageStore`'s CRUD actions (see
 * docs/MODULAR_PAGE_SYSTEM_PLAN.md, Milestone 2). Same rationale as every
 * wrapper above: never reach into `structuralPageStore`'s internals, always
 * mutate via its own published actions, then `record` a command so
 * Ctrl/Cmd+Z covers this new editing surface too — shipping a new mutable
 * surface that undo silently doesn't cover would be a regression, not a
 * missing nice-to-have.
 */

/**
 * History-aware replacement for `structuralPageStore.insertPage`. Undo
 * removes the just-created page; redo re-inserts the *exact same*
 * (already-fresh-id'd) page object via `insertPageAt` rather than calling
 * `insertPage` again — calling `insertPage` a second time would mint yet
 * another new id and silently orphan the first undo/redo pairing.
 */
export function insertPageWithHistory(
  projectId: string,
  category: StructuralPageCategory,
  type: StructuralPageType,
  afterPageId: string | null,
): string {
  const newId = useStructuralPageStore.getState().insertPage(projectId, category, type, afterPageId)
  const created = useStructuralPageStore.getState().getPages(projectId).find((p) => p.id === newId)

  if (created) {
    useHistoryStore.getState().record(
      projectId,
      'Insert page',
      () => useStructuralPageStore.getState().deletePage(projectId, newId),
      () => useStructuralPageStore.getState().insertPageAt(projectId, category, created, afterPageId),
    )
  }

  return newId
}

/** History-aware replacement for `structuralPageStore.duplicatePage`. Same
 * undo/redo shape as `insertPageWithHistory` above. */
export function duplicatePageWithHistory(projectId: string, pageId: string): string | undefined {
  const newId = useStructuralPageStore.getState().duplicatePage(projectId, pageId)
  if (!newId) return undefined
  const created = useStructuralPageStore.getState().getPages(projectId).find((p) => p.id === newId)

  if (created) {
    useHistoryStore.getState().record(
      projectId,
      'Duplicate page',
      () => useStructuralPageStore.getState().deletePage(projectId, newId),
      () => useStructuralPageStore.getState().insertPageAt(projectId, created.category, created, pageId),
    )
  }

  return newId
}

/**
 * History-aware replacement for `structuralPageStore.deletePage`. Captures
 * the page's full snapshot and its immediate predecessor's id within its
 * own category (or `null` if it was first) BEFORE deleting, so undo can
 * re-`insertPageAt` it back in the exact same spot — mirrors
 * `deleteBlockWithHistory`'s precedingBlockId approach exactly.
 */
export function deletePageWithHistory(projectId: string, pageId: string): void {
  const pages = useStructuralPageStore.getState().getPages(projectId)
  const page = pages.find((p) => p.id === pageId)
  if (!page) return

  const sameCategory = pages.filter((p) => p.category === page.category)
  const idx = sameCategory.findIndex((p) => p.id === pageId)
  const precedingPageId = idx > 0 ? sameCategory[idx - 1].id : null

  useStructuralPageStore.getState().deletePage(projectId, pageId)

  useHistoryStore.getState().record(
    projectId,
    'Delete page',
    () => useStructuralPageStore.getState().insertPageAt(projectId, page.category, page, precedingPageId),
    () => useStructuralPageStore.getState().deletePage(projectId, pageId),
  )
}

/**
 * History-aware replacement for `structuralPageStore.movePage`. A simple
 * adjacent-swap reorder is its own inverse — undo just moves the same page
 * one step the opposite direction.
 */
export function movePageWithHistory(projectId: string, pageId: string, direction: 'up' | 'down'): void {
  useStructuralPageStore.getState().movePage(projectId, pageId, direction)
  const opposite = direction === 'up' ? 'down' : 'up'
  useHistoryStore.getState().record(
    projectId,
    'Reorder page',
    () => useStructuralPageStore.getState().movePage(projectId, pageId, opposite),
    () => useStructuralPageStore.getState().movePage(projectId, pageId, direction),
  )
}

/**
 * History-aware replacement for `structuralPageStore.updatePageContent`.
 * Same shape as `editBlock` above: snapshots the full old `content` object
 * before mutating, so undo can restore it exactly. Undo deliberately calls
 * `replacePageContent` (a full, non-merging replacement), not
 * `updatePageContent` — merging the old content back in would silently fail
 * to clear any field that the edit had newly *set* (merging `{}` into
 * `{ text: 'x' }` leaves `text: 'x'` untouched, since a merge only ever
 * adds/overwrites keys, never deletes them). Redo re-applies `updates` as a
 * merge on top of that now-restored old content, exactly reproducing the
 * original forward edit.
 */
export function updatePageContentWithHistory(
  projectId: string,
  pageId: string,
  updates: Partial<StructuralPage['content']>,
): void {
  const oldPage = useStructuralPageStore.getState().getPages(projectId).find((p) => p.id === pageId)

  useStructuralPageStore.getState().updatePageContent(projectId, pageId, updates)

  if (!oldPage) return

  useHistoryStore.getState().record(
    projectId,
    'Edit page',
    () => useStructuralPageStore.getState().replacePageContent(projectId, pageId, oldPage.content),
    () => useStructuralPageStore.getState().updatePageContent(projectId, pageId, updates),
  )
}

/**
 * History-aware note actions (`notesStore.ts`). Notes are a side-channel
 * annotation layer, not manuscript content, but "support undo/redo
 * throughout the application" applies here exactly as it does everywhere
 * else in this codebase — same reasoning, same `historyStore.record`
 * pattern as every wrapper above.
 */

/** Creates a note on a block or a structural page (exactly one of
 * `target.blockId`/`target.structuralPageId` should be set). Returns the
 * new note's id. */
export function addNoteWithHistory(
  projectId: string,
  target: { chapterId?: string; blockId?: string; structuralPageId?: string },
  text: string,
): string {
  const now = new Date().toISOString()
  const note: Note = { id: generateId('note'), ...target, text, resolved: false, createdAt: now, updatedAt: now }

  useNotesStore.getState().addNote(projectId, note)

  useHistoryStore.getState().record(
    projectId,
    'Add note',
    () => useNotesStore.getState().deleteNote(projectId, note.id),
    () => useNotesStore.getState().addNote(projectId, note),
  )
  return note.id
}

/** Edits a note's text — snapshots the old text so undo restores it
 * exactly, same shape as `editBlock`/`updatePageContentWithHistory`
 * above. Intended to be called once per edit session (e.g. on the note
 * textarea's blur), not per keystroke, so one edit is one undo step. */
export function updateNoteTextWithHistory(projectId: string, noteId: string, text: string): void {
  const oldNote = useNotesStore.getState().getNotes(projectId).find((n) => n.id === noteId)
  if (!oldNote || oldNote.text === text) return

  useNotesStore.getState().updateNoteText(projectId, noteId, text)

  useHistoryStore.getState().record(
    projectId,
    'Edit note',
    () => useNotesStore.getState().updateNoteText(projectId, noteId, oldNote.text),
    () => useNotesStore.getState().updateNoteText(projectId, noteId, text),
  )
}

export function setNoteResolvedWithHistory(projectId: string, noteId: string, resolved: boolean): void {
  useNotesStore.getState().setNoteResolved(projectId, noteId, resolved)

  useHistoryStore.getState().record(
    projectId,
    resolved ? 'Resolve note' : 'Reopen note',
    () => useNotesStore.getState().setNoteResolved(projectId, noteId, !resolved),
    () => useNotesStore.getState().setNoteResolved(projectId, noteId, resolved),
  )
}

/** Snapshots the full note before deleting so undo can re-`addNote` it back
 * byte-for-byte, same pattern as `deleteBlockWithHistory`. */
export function deleteNoteWithHistory(projectId: string, noteId: string): void {
  const snapshot = useNotesStore.getState().getNotes(projectId).find((n) => n.id === noteId)
  if (!snapshot) return

  useNotesStore.getState().deleteNote(projectId, noteId)

  useHistoryStore.getState().record(
    projectId,
    'Delete note',
    () => useNotesStore.getState().addNote(projectId, snapshot),
    () => useNotesStore.getState().deleteNote(projectId, noteId),
  )
}

// --- Layer 0 (Planning) -----------------------------------------------------
//
// One generic add/update/delete triplet covering all eight entity kinds —
// same "generic over `collection`, not eight near-identical wrappers" call
// `layer0Store.ts` already makes, extended through the history layer. Every
// wrapper below follows the exact snapshot → mutate-via-published-action →
// `historyStore.record` shape every wrapper above it does.

/** Adds a fully-formed entity (id/timestamps already set by the caller —
 * see `LAYER0_KIND_TO_COLLECTION`/`generateId` at the call site, same
 * division of responsibility as `addNoteWithHistory`) to one collection.
 * `label` is the undo-stack's display string (e.g. "Add character"),
 * supplied by the caller since only it knows which entity kind this is in
 * human terms. */
export function addLayer0EntityWithHistory<K extends keyof Layer0Bible>(
  projectId: string,
  collection: K,
  entity: Layer0Bible[K][number],
  label: string,
): void {
  useLayer0Store.getState().addEntity(projectId, collection, entity)

  useHistoryStore.getState().record(
    projectId,
    label,
    () => useLayer0Store.getState().deleteEntity(projectId, collection, entity.id),
    () => useLayer0Store.getState().addEntity(projectId, collection, entity),
  )
}

/** Edits one entity — snapshots the old value so undo restores it exactly,
 * same shape as `updateNoteTextWithHistory`. Intended to be called once per
 * edit session (a form's save/blur), not per keystroke. */
export function updateLayer0EntityWithHistory<K extends keyof Layer0Bible>(
  projectId: string,
  collection: K,
  id: string,
  updates: Partial<Layer0Bible[K][number]>,
  label: string,
): void {
  const oldEntity = useLayer0Store
    .getState()
    .getBible(projectId)
    [collection].find((e) => e.id === id)
  if (!oldEntity) return

  useLayer0Store.getState().updateEntity(projectId, collection, id, updates)

  useHistoryStore.getState().record(
    projectId,
    label,
    () => useLayer0Store.getState().updateEntity(projectId, collection, id, oldEntity),
    () => useLayer0Store.getState().updateEntity(projectId, collection, id, updates),
  )
}

/** Snapshots the full entity before deleting so undo can re-`addEntity` it
 * back byte-for-byte, same pattern as `deleteNoteWithHistory`. */
export function deleteLayer0EntityWithHistory<K extends keyof Layer0Bible>(
  projectId: string,
  collection: K,
  id: string,
  label: string,
): void {
  const snapshot = useLayer0Store
    .getState()
    .getBible(projectId)
    [collection].find((e) => e.id === id)
  if (!snapshot) return

  useLayer0Store.getState().deleteEntity(projectId, collection, id)

  useHistoryStore.getState().record(
    projectId,
    label,
    () => useLayer0Store.getState().addEntity(projectId, collection, snapshot),
    () => useLayer0Store.getState().deleteEntity(projectId, collection, id),
  )
}

/** History-aware wrapper for `layer0Store.moveTimelineEvent` — same
 * symmetric-opposite-direction shape as `movePageWithHistory`/
 * `moveChapterWithHistory` above: the adjacent-swap primitive is its own
 * inverse, so undo/redo are just the same call with `direction` flipped
 * (undo) or repeated (redo), with no snapshot needed. */
export function moveTimelineEventWithHistory(projectId: string, id: string, direction: 'up' | 'down'): void {
  useLayer0Store.getState().moveTimelineEvent(projectId, id, direction)
  const opposite = direction === 'up' ? 'down' : 'up'
  useHistoryStore.getState().record(
    projectId,
    'Reorder timeline event',
    () => useLayer0Store.getState().moveTimelineEvent(projectId, id, opposite),
    () => useLayer0Store.getState().moveTimelineEvent(projectId, id, direction),
  )
}
