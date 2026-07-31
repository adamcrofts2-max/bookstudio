import { Plus } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getBlockTypeDefinition } from '@/blocks/registry'
import { INSERTABLE_BLOCK_TYPES, type InsertableBlockType } from '@/blocks/defaultContent'

interface InsertBlockButtonProps {
  onInsert: (type: InsertableBlockType) => void
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
 */
export function InsertBlockButton({ onInsert }: InsertBlockButtonProps) {
  return (
    <div className="group/insert relative -my-1.5 flex h-3 items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border opacity-0 transition-opacity group-hover/insert:opacity-100" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Insert block"
            title="Insert block"
            className="relative z-10 flex size-5 items-center justify-center rounded-full border border-border bg-background-secondary text-text-secondary opacity-0 shadow-[var(--shadow-sm)] transition-opacity hover:text-text-primary group-hover/insert:opacity-100 data-[state=open]:opacity-100"
          >
            <Plus className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {INSERTABLE_BLOCK_TYPES.map((type) => {
            const def = getBlockTypeDefinition(type)
            if (!def) return null
            const Icon = def.icon
            return (
              <DropdownMenuItem key={type} onClick={() => onInsert(type)} className="gap-2">
                {Icon && <Icon className="size-3.5" />}
                {def.label ?? type}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
