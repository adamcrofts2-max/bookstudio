import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ContentBlock } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useAssetStore } from '@/store/assetStore'
import { sanitiseInline } from '@/parser/html'
import { cn } from '@/lib/utils'

interface BlockContentProps {
  block: ContentBlock
  theme: ResolvedBookTheme
  dropCap?: boolean
  selected?: boolean
  onSelect?: () => void
  /**
   * Opt-in inline text editing. Only ever passed `true` from `Page.tsx`'s
   * real rendering path — `HeightMeasurer.tsx` never passes this prop, so
   * its off-screen measurement instances stay inert and pixel-identical to
   * how they render when nothing is being edited.
   */
  editable?: boolean
  /** Called with a `Partial<ContentBlock>` patch when an edit is committed.
   * `Page.tsx` wires this straight to `contentStore.updateBlock` — this
   * component never touches the store itself. */
  onCommit?: (updates: Partial<ContentBlock>) => void
  /** One-shot signal (e.g. from the Virtual Editor's "Edit" action) to enter
   * edit mode immediately once this block is selected, rather than waiting
   * for a double-click. */
  autoEdit?: boolean
  /** Called once autoEdit has been acted on, so the requester (selectionStore)
   * can clear the pending request and avoid re-triggering. */
  onAutoEditHandled?: () => void
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Enter commits (blurs to trigger the commit handler), Escape cancels
 * without committing. Shared by every inline-editable field in this file. */
function useEditableField(options: { mode: 'text' | 'html'; initialValue: string; onCommit: (value: string) => void }) {
  const { mode, initialValue, onCommit } = options
  const [isEditing, setIsEditing] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  const skipCommitRef = useRef(false)

  useLayoutEffect(() => {
    if (!isEditing || !ref.current) return
    if (mode === 'html') ref.current.innerHTML = initialValue
    else ref.current.textContent = initialValue
    ref.current.focus()
    placeCaretAtEnd(ref.current)
    // Only re-run when entering/leaving edit mode — re-syncing on every
    // keystroke would fight the user's in-progress, uncontrolled DOM edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const startEditing = () => setIsEditing(true)

  const handleBlur = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      setIsEditing(false)
      return
    }
    if (ref.current) {
      const value = mode === 'html' ? sanitiseInline(ref.current) : (ref.current.textContent ?? '')
      onCommit(value)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      skipCommitRef.current = true
      ;(e.currentTarget as HTMLElement).blur()
    }
  }

  return { ref, isEditing, startEditing, handleBlur, handleKeyDown }
}

function outlineClass(selected: boolean, editing: boolean) {
  if (editing) return 'outline outline-2 outline-[var(--color-warning)] rounded-sm'
  if (selected) return 'outline outline-2 outline-[var(--color-accent)] rounded-sm'
  return 'outline outline-2 outline-transparent'
}

interface ListItemFieldProps {
  text: string
  editable?: boolean
  onCommit: (value: string) => void
}

/** One `<li>` — its own component so hooks stay unconditional regardless of
 * how many items a list has (see Rules of Hooks). */
function ListItemField({ text, editable, onCommit }: ListItemFieldProps) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit })
  return (
    <li
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? field.startEditing : undefined}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn('pb-1', field.isEditing && 'outline outline-2 outline-offset-2 outline-[var(--color-warning)] rounded-sm')}
    >
      {!field.isEditing ? text : null}
    </li>
  )
}

interface TableCellFieldProps {
  as: 'td' | 'th'
  text: string
  editable?: boolean
  onCommit: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

/** One `<td>`/`<th>` — its own component for the same reason as `ListItemField`. */
function TableCellField({ as: Tag, text, editable, onCommit, className, style }: TableCellFieldProps) {
  const field = useEditableField({ mode: 'text', initialValue: text, onCommit })
  return (
    <Tag
      ref={(el) => {
        field.ref.current = el
      }}
      contentEditable={field.isEditing}
      suppressContentEditableWarning
      onDoubleClick={editable ? field.startEditing : undefined}
      onBlur={field.isEditing ? field.handleBlur : undefined}
      onKeyDown={field.isEditing ? field.handleKeyDown : undefined}
      className={cn(className, field.isEditing && 'outline outline-2 outline-offset-2 outline-[var(--color-warning)] rounded-sm')}
      style={style}
    >
      {!field.isEditing ? text : null}
    </Tag>
  )
}

/**
 * Renders a single manuscript block using the active theme's typography.
 * Used both for real page display and for off-screen height measurement —
 * the two must stay pixel-identical, so there is exactly one implementation.
 *
 * Inline editing (`editable`/`onCommit`) is opt-in and only ever wired from
 * `Page.tsx`'s real rendering path. Paragraph HTML is sanitised back down to
 * the same allowed-tag set the import-time sanitiser enforces, via the
 * shared `sanitiseInline` from `src/parser/html.ts` — no second sanitiser.
 */
export function BlockContent({ block, theme, dropCap, selected, onSelect, editable, onCommit, autoEdit, onAutoEditHandled }: BlockContentProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)

  const primary = useEditableField({
    mode: block.type === 'paragraph' ? 'html' : 'text',
    initialValue:
      block.type === 'heading' ? block.text
      : block.type === 'paragraph' ? block.html
      : block.type === 'quote' ? block.text
      : '',
    onCommit: (value) => {
      if (block.type === 'heading') onCommit?.({ text: value })
      else if (block.type === 'paragraph') onCommit?.({ html: value })
      else if (block.type === 'quote') onCommit?.({ text: value })
    },
  })

  const attribution = useEditableField({
    mode: 'text',
    initialValue: block.type === 'quote' ? (block.attribution ?? '') : '',
    onCommit: (value) => {
      if (block.type === 'quote') onCommit?.({ attribution: value.trim() || undefined })
    },
  })

  useEffect(() => {
    if (autoEdit && editable) {
      primary.startEditing()
      onAutoEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  const wrapperClass = cn('outline-offset-4 transition-[outline-color] duration-150', outlineClass(!!selected, false))

  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3'
      return (
        <Tag
          ref={(el) => {
            primary.ref.current = el
          }}
          onClick={!primary.isEditing ? onSelect : undefined}
          onDoubleClick={editable ? primary.startEditing : undefined}
          contentEditable={primary.isEditing}
          suppressContentEditableWarning
          onBlur={primary.isEditing ? primary.handleBlur : undefined}
          onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
          className={cn(
            'outline-offset-4 transition-[outline-color] duration-150',
            outlineClass(!!selected, primary.isEditing),
            'cursor-pointer pt-8 pb-2.5',
          )}
          style={{
            fontFamily: theme.fonts.heading,
            fontWeight: theme.typography.headingWeight,
            fontSize: block.level === 2 ? '1.5em' : '1.2em',
            lineHeight: 1.25,
            color: theme.page.ink,
          }}
        >
          {!primary.isEditing ? block.text : null}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p
          ref={(el) => {
            primary.ref.current = el
          }}
          onClick={!primary.isEditing ? onSelect : undefined}
          onDoubleClick={editable ? primary.startEditing : undefined}
          contentEditable={primary.isEditing}
          suppressContentEditableWarning
          onBlur={primary.isEditing ? primary.handleBlur : undefined}
          onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
          className={cn(
            'outline-offset-4 transition-[outline-color] duration-150',
            outlineClass(!!selected, primary.isEditing),
            'cursor-pointer pb-3.5',
            dropCap && 'book-drop-cap',
          )}
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.typography.bodySize,
            lineHeight: theme.typography.lineHeight,
            color: theme.page.ink,
            textAlign: theme.typography.justify ? 'justify' : 'left',
            hyphens: 'auto',
            fontVariantLigatures: 'common-ligatures',
            wordBreak: 'normal',
            overflowWrap: 'break-word',
          }}
          {...(!primary.isEditing ? { dangerouslySetInnerHTML: { __html: block.html } } : {})}
        />
      )
    case 'quote':
      return (
        <blockquote
          onClick={!primary.isEditing && !attribution.isEditing ? onSelect : undefined}
          className={cn(
            'outline-offset-4 transition-[outline-color] duration-150',
            outlineClass(!!selected, primary.isEditing || attribution.isEditing),
            'cursor-pointer py-6 pl-5',
          )}
          style={{
            fontFamily: theme.fonts.heading,
            fontSize: theme.typography.bodySize * 1.15,
            lineHeight: 1.5,
            color: theme.page.accent,
            borderLeft: `2px solid ${theme.page.ruleColor}`,
          }}
        >
          <p
            ref={(el) => {
              primary.ref.current = el
            }}
            className="italic"
            onDoubleClick={
              editable
                ? (e) => {
                    e.stopPropagation()
                    primary.startEditing()
                  }
                : undefined
            }
            contentEditable={primary.isEditing}
            suppressContentEditableWarning
            onBlur={primary.isEditing ? primary.handleBlur : undefined}
            onKeyDown={primary.isEditing ? primary.handleKeyDown : undefined}
          >
            {!primary.isEditing ? <>&ldquo;{block.text}&rdquo;</> : null}
          </p>
          {(block.attribution || attribution.isEditing || editable) && (
            <footer
              ref={(el) => {
                attribution.ref.current = el
              }}
              className="mt-2 text-[0.7em] not-italic"
              style={{ color: theme.page.mutedInk }}
              onDoubleClick={
                editable
                  ? (e) => {
                      e.stopPropagation()
                      attribution.startEditing()
                    }
                  : undefined
              }
              contentEditable={attribution.isEditing}
              suppressContentEditableWarning
              onBlur={attribution.isEditing ? attribution.handleBlur : undefined}
              onKeyDown={attribution.isEditing ? attribution.handleKeyDown : undefined}
            >
              {!attribution.isEditing ? (block.attribution ? `— ${block.attribution}` : editable ? 'Add attribution…' : '') : null}
            </footer>
          )}
        </blockquote>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          onClick={onSelect}
          className={cn(wrapperClass, 'cursor-pointer pb-4 pl-6', block.ordered ? 'list-decimal' : 'list-disc')}
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.typography.bodySize,
            lineHeight: theme.typography.lineHeight,
            color: theme.page.ink,
          }}
        >
          {block.items.map((item, i) => (
            <ListItemField
              key={i}
              text={item}
              editable={editable}
              onCommit={(value) => {
                const items = block.items.slice()
                items[i] = value
                onCommit?.({ items })
              }}
            />
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <table
          onClick={onSelect}
          className={cn(wrapperClass, 'w-full cursor-pointer border-collapse pb-5 text-[0.85em]')}
          style={{ fontFamily: theme.fonts.body, color: theme.page.ink }}
        >
          <thead>
            <tr>
              {block.header.map((cell, i) => (
                <TableCellField
                  as="th"
                  key={i}
                  text={cell}
                  editable={editable}
                  className="border-b py-1.5 text-left font-semibold"
                  style={{ borderColor: theme.page.ruleColor }}
                  onCommit={(value) => {
                    const header = block.header.slice()
                    header[i] = value
                    onCommit?.({ header })
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <TableCellField
                    as="td"
                    key={ci}
                    text={cell}
                    editable={editable}
                    className="border-b py-1.5"
                    style={{ borderColor: theme.page.ruleColor }}
                    onCommit={(value) => {
                      const rows = block.rows.map((r) => r.slice())
                      rows[ri][ci] = value
                      onCommit?.({ rows })
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'image': {
      const url = getObjectUrl(block.assetId)
      // Optional field — manuscripts persisted before `widthPercent` existed
      // don't have it; always default to 100 here rather than migrating.
      const widthPercent = block.widthPercent ?? 100
      return (
        <figure onClick={onSelect} className={cn(wrapperClass, 'cursor-pointer pb-5')}>
          <div
            className="mx-auto overflow-hidden rounded-[var(--radius-image)]"
            style={{ background: theme.page.ruleColor, width: `${widthPercent}%` }}
          >
            {url ? (
              <img
                src={url}
                alt={block.caption ?? ''}
                className="w-full object-cover"
                style={{ transform: `rotate(${block.rotation}deg)` }}
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-xs" style={{ color: theme.page.mutedInk }}>
                Image unavailable
              </div>
            )}
          </div>
          {block.caption && (
            <figcaption
              className="mx-auto pt-2 text-[0.75em] italic"
              style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk, width: `${widthPercent}%` }}
            >
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    }
    default:
      return null
  }
}
