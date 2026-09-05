import { Plus, ImagePlus, Images, Sparkles } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getBlockTypeDefinition } from '@/blocks/registry'
import { INSERTABLE_BLOCK_TYPES, type InsertableBlockType } from '@/blocks/defaultContent'
import { useRef } from 'react'
import { useImageUpload, useImagesUpload } from '@/hooks/useImageUpload'
import { UploadError } from '@/components/common/UploadError'

interface InsertBlockButtonProps {
  projectId: string
  onInsert: (type: InsertableBlockType) => void
  /** Inserts a real `ImageBlock` once the user picks a photo — a separate
   * callback from `onInsert` since Image isn't one of
   * `INSERTABLE_BLOCK_TYPES` (it needs a real asset id before a valid
   * block even exists, unlike every other type's blank starting point).
   * Phase 51. */
  onInsertImage: (assetId: string) => void
  /** Inserts a `GalleryBlock` from a multi-photo pick. Same reason as
   * `onInsertImage` for being its own callback, plus one of its own: until
   * this existed, `gallery` was a block type the app could render, export
   * and inspect but that no code path anywhere could ever create. */
  onInsertGallery: (assetIds: string[]) => void
  /** Opens `AiDraftInsertDialog.tsx` scoped to this exact gap — a separate
   * callback rather than a new `InsertableBlockType`, since a pasted AI
   * draft can expand into several blocks at once, not one blank block of a
   * chosen type. Phase F (`docs/PLANNING_MODE_UX_AUDIT.md` finding #2). */
  onInsertAiDraft: () => void
  /**
   * True only for a brand-new chapter's very first block — there's no
   * existing content to hover between yet, and nothing on the page hints
   * that an (otherwise invisible-until-hover) insert point exists at all.
   * Renders as a visible, labelled "Start writing" prompt instead of the
   * compact hover-reveal dot every other gap uses, matching this app's own
   * empty-state convention elsewhere (`EmptyState`'s icon+label shape) —
   * found missing during a live first-time-author UX audit of the
   * Planning → Writing workflow (docs/STATUS.md, 2026-08-02): a fresh
   * chapter had no discoverable way to add its first paragraph at all.
   */
  emptyChapter?: boolean
}

/**
 * The "+" affordance shown in the gap between two blocks (and before the
 * first / after the last) — lets a user add a brand-new block of any type
 * at that exact position, rather than manuscript import or image
 * drag-and-drop being the only ways content ever appears. Mirrors
 * `Sidebar.tsx`'s "Add page" `DropdownMenu` pattern exactly (same
 * component, same trigger-button-plus-menu shape), reading each type's
 * `label`/`icon` from the block-type registry — see `src/blocks/registry.ts`,
 * which already documented this exact future UI as its reason for existing.
 * See docs/ROADMAP.md Phase B.
 *
 * "Image" and "Photo gallery" sit above the rest, separated, and open a
 * file picker (`useImageUpload`/`useImagesUpload`) rather than inserting a
 * blank block — the same click-to-upload flow the Cover designer and
 * placeholder-to-real-image conversion also use. Neither is an
 * `InsertableBlockType`: both need real asset ids before a valid block
 * exists at all.
 */
export function InsertBlockButton({ projectId, onInsert, onInsertImage, onInsertGallery, onInsertAiDraft, emptyChapter }: InsertBlockButtonProps) {
  const { openPicker, error: uploadError, inputProps } = useImageUpload(projectId, onInsertImage)
  const { openPicker: openGalleryPicker, error: galleryError, inputProps: galleryInputProps } = useImagesUpload(projectId, onInsertGallery)

  /**
   * The chosen type, inserted once the menu has finished closing.
   *
   * Inserting inside `onClick` put the caret in the new block and Radix then
   * took it back while tearing down the menu's focus scope — so a paragraph
   * inserted mid-document was created, focused for a moment, and abandoned,
   * and everything typed next went to the document body. Deferring to
   * `onCloseAutoFocus` removes the race instead of competing with it. Same
   * fix as the mobile "+" menu.
   */
  const pendingInsertRef = useRef<InsertableBlockType | null>(null)

  const menu = (
    <DropdownMenuContent
      align="center"
      onCloseAutoFocus={(e) => {
        const type = pendingInsertRef.current
        pendingInsertRef.current = null
        if (!type) return
        e.preventDefault()
        onInsert(type)
      }}
    >
      <DropdownMenuItem onClick={openPicker} className="gap-2">
        <ImagePlus className="size-3.5" />
        Image
      </DropdownMenuItem>
      <DropdownMenuItem onClick={openGalleryPicker} className="gap-2">
        <Images className="size-3.5" />
        Photo gallery
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onInsertAiDraft} className="gap-2">
        <Sparkles className="size-3.5" />
        AI Draft…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {INSERTABLE_BLOCK_TYPES.map((type) => {
        const def = getBlockTypeDefinition(type)
        if (!def) return null
        const Icon = def.icon
        return (
          <DropdownMenuItem
            key={type}
            onClick={() => {
              pendingInsertRef.current = type
            }}
            className="gap-2"
          >
            {Icon && <Icon className="size-3.5" />}
            {def.label ?? type}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuContent>
  )

  if (emptyChapter) {
    return (
      <div className="flex justify-center py-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-[var(--radius-button)] border border-dashed border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <Plus className="size-4" />
              Start writing
            </button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
        <input {...inputProps} />
        <input {...galleryInputProps} />
        <UploadError message={uploadError ?? galleryError} />
      </div>
    )
  }

  return (
    <div className="group/insert relative -my-1.5 flex h-3 items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border opacity-0 transition-opacity group-hover/insert:opacity-100" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Insert block"
            title="Insert block"
            // Phase 122 (2026-08-03, user: "the green plus symbol covers
            // spellings and synonyms so user cant click them") — this button
            // sits in the gap directly above a block, which can be the exact
            // screen position `FloatingFormatToolbar` renders its Fix
            // spelling/Synonyms buttons above a selection near a paragraph's
            // first line. `opacity-0` only hides it visually — an invisible
            // element still receives pointer events by default, so clicks
            // aimed at the (visually on-top, z-50) toolbar underneath it were
            // landing on this hidden button/its dropdown trigger instead.
            // `pointer-events-none` (re-enabled on hover, when it's actually
            // visible and meant to be clickable) makes it truly inert while
            // hidden, so it can never again silently steal a click from
            // whatever happens to render in the same screen position.
            className="relative z-10 flex size-5 items-center justify-center rounded-full border border-border bg-background-secondary text-text-secondary opacity-0 shadow-[var(--shadow-sm)] transition-opacity pointer-events-none hover:text-text-primary group-hover/insert:opacity-100 group-hover/insert:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto"
          >
            <Plus className="size-3" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
      <input {...inputProps} />
      <input {...galleryInputProps} />
      <UploadError message={uploadError ?? galleryError} />
    </div>
  )
}
