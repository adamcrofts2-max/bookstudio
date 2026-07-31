import type { Revision } from '@/store/virtualEditorStore'
import type { ContentBlock } from '@/types/content'
import { blockPlainText } from '@/virtualEditor/textExtract'

interface RevisionCompareViewProps {
  chapterTitle: string
  /** Every revision applied to one specific block, in the order they were
   * applied (oldest first) — the caller is responsible for filtering
   * `revisionsByProject` down to a single `blockId` and preserving order,
   * since revisions are already appended chronologically by
   * `virtualEditorStore.acceptFix`. */
  revisions: Revision[]
}

/**
 * Reconstructs every intermediate state of a block across a chain of
 * revisions: `Original` (the very first revision's `before` snapshot),
 * then one state per revision after that revision's `after` patch was
 * applied. Each state is built by merging onto the *previous computed
 * state* rather than trusting each revision's own `before` — the two
 * should normally agree, but chaining off the previous computed state is
 * robust even in the edge case where the block was also edited manually
 * outside the Virtual Editor between two accepted fixes.
 *
 * `{ ...current, ...revision.after } as ContentBlock` is a safe cast: a
 * revision's `after` patch only ever changes field *values* on the same
 * block (see `SuggestedFix.apply`'s signature in `virtualEditor/types.ts`)
 * — it never changes `block.type` — so the merged result is always a
 * structurally valid `ContentBlock` of the same variant as `current`.
 */
function buildStateChain(revisions: Revision[]): ContentBlock[] {
  if (revisions.length === 0) return []
  const states: ContentBlock[] = [revisions[0]!.before]
  let current: ContentBlock = revisions[0]!.before
  for (const revision of revisions) {
    current = { ...current, ...revision.after } as ContentBlock
    states.push(current)
  }
  return states
}

/** `Original`, then `RevA`/`RevB`/`RevC`... per the product spec's naming
 * (see `docs/ROADMAP.md` Phase C). Falls back to `RevN` past the 26th
 * revision on a single block — vanishingly unlikely in practice, but
 * without a silent crash if it ever happens. */
function stateLabel(index: number): string {
  if (index === 0) return 'Original'
  const letter = String.fromCharCode('A'.charCodeAt(0) + index - 1)
  return index <= 26 ? `Rev${letter}` : `Rev${index}`
}

/**
 * Side-by-side view of every state a single block has passed through as
 * the Virtual Editor applied successive fixes to it. Read-only — comparing
 * history doesn't need its own restore action, since
 * `VirtualEditorWorkspace.tsx`'s existing flat revision list already offers
 * "Restore original" per revision; this view exists purely to let a user
 * see the whole chain at a glance, which the flat chronological list can't
 * show for a block touched more than once. Renders `null` when there's
 * only one state to show (a block with a single revision has nothing to
 * compare against beyond what "Restore original" already does).
 */
export function RevisionCompareView({ chapterTitle, revisions }: RevisionCompareViewProps) {
  const states = buildStateChain(revisions)
  if (states.length < 2) return null

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-panel p-4">
      <p className="text-xs text-text-secondary">
        {chapterTitle} · {revisions.length} revision{revisions.length === 1 ? '' : 's'} applied to this block
      </p>
      <div
        className="grid gap-3 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${states.length}, minmax(180px, 1fr))` }}
      >
        {states.map((state, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-[var(--radius-input)] border border-border bg-background-secondary p-3"
          >
            <p className="text-xs font-semibold text-text-secondary">{stateLabel(i)}</p>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{blockPlainText(state)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
