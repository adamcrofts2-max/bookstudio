import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { editBlock } from '@/store/editorActions'
import { useContentStore } from '@/store/contentStore'
import type { ContentBlock } from '@/types/content'
import { cn } from '@/lib/utils'

/**
 * Editing the structured block types on a phone — list, checklist, verse,
 * table, timeline, FAQ and statistics.
 *
 * These were read-only cards on mobile since Phase 129, with "Edit on a
 * larger screen" printed on them. The reasoning at the time was sound: a
 * plain `contentEditable` cannot express a table's cells or an FAQ's
 * question/answer pairs, so the choice was a mini-form per type or nothing,
 * and nothing was the honest half-measure to ship first.
 *
 * What makes it tractable now is that six of the seven are the same shape —
 * a list of rows, where a row is one or two short text fields — so there is
 * one `RowsEditor` and two special cases rather than seven forms.
 *
 * Two decisions worth keeping:
 *
 * **Verse is a textarea, not rows.** Its lines are the author's, they are
 * short, and a blank line is a stanza break — which is exactly what typing
 * into a textarea already produces. A row per line would be seven taps to
 * write a quatrain.
 *
 * **A table is rows of labelled fields, not a grid.** A real grid on a
 * 390px screen is either unreadably small or horizontally scrolling, and
 * both are miserable to type into. Each row becomes a card whose fields
 * carry the column headings as their labels, which is the same information
 * laid out for the device actually in your hand.
 *
 * Text commits on blur, structural changes (add, delete, reorder, tick)
 * commit immediately — both through `editBlock`, the same history-recording
 * edit the desktop Inspector uses, so anything typed on a phone is undoable
 * exactly the same way.
 */
interface MobileStructuredEditorProps {
  projectId: string
  chapterId: string
  block: ContentBlock
}

/** The types this editor knows how to open. */
export function isStructuredEditable(block: ContentBlock): boolean {
  return ['list', 'checklist', 'verse', 'table', 'timeline', 'faq', 'statistics'].includes(block.type)
}

function move<T>(rows: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= rows.length) return rows
  const next = rows.slice()
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  return next
}

/** Up / down / delete, the three controls every row here needs. */
function RowControls({
  index,
  count,
  onMove,
  onDelete,
  label,
}: {
  index: number
  count: number
  onMove: (delta: number) => void
  onDelete: () => void
  label: string
}) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button variant="ghost" size="icon" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Delete ${label}`} className="hover:text-danger" onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

interface FieldSpec<T> {
  key: string
  label: string
  placeholder?: string
  multiline?: boolean
  get: (row: T) => string
  set: (row: T, value: string) => T
}

/**
 * The shared shape: a list of rows, each with one or two short fields.
 * Used by list, checklist, timeline, FAQ and statistics.
 */
function RowsEditor<T>({
  rows,
  fields,
  rowLabel,
  emptyRow,
  onChange,
  leading,
}: {
  rows: T[]
  fields: FieldSpec<T>[]
  rowLabel: string
  emptyRow: () => T
  onChange: (rows: T[]) => void
  /** A checklist's tick box — the one row control that isn't universal. */
  leading?: (row: T, index: number, update: (row: T) => void) => React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-[13px] text-text-secondary">Nothing here yet.</p>}
      {rows.map((row, index) => (
        <div key={`${rows.length}-${index}`} className="flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-2.5">
          {leading?.(row, index, (next) => onChange(rows.map((r, i) => (i === index ? next : r))))}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {fields.map((field) =>
              field.multiline ? (
                <Textarea
                  key={field.key}
                  rows={2}
                  aria-label={field.label}
                  placeholder={field.placeholder ?? field.label}
                  defaultValue={field.get(row)}
                  onBlur={(e) => onChange(rows.map((r, i) => (i === index ? field.set(r, e.target.value) : r)))}
                />
              ) : (
                <Input
                  key={field.key}
                  aria-label={field.label}
                  placeholder={field.placeholder ?? field.label}
                  defaultValue={field.get(row)}
                  onBlur={(e) => onChange(rows.map((r, i) => (i === index ? field.set(r, e.target.value) : r)))}
                />
              ),
            )}
          </div>
          <RowControls
            index={index}
            count={rows.length}
            label={rowLabel}
            onMove={(delta) => onChange(move(rows, index, delta))}
            onDelete={() => onChange(rows.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button type="button" variant="secondary" className="gap-1.5" onClick={() => onChange([...rows, emptyRow()])}>
        <Plus className="size-3.5" />
        Add {rowLabel}
      </Button>
    </div>
  )
}

export function MobileStructuredEditor({ projectId, chapterId, block: blockProp }: MobileStructuredEditorProps) {
  // Read the block from the store, not from the prop. Two commits can land
  // in one gesture — tapping "Add item" while a field is focused fires the
  // field's blur commit *and then* the button's — and a handler closing over
  // a render-time copy would rebuild the row list from the state before the
  // blur, silently throwing away what had just been typed. Caught by the
  // mobile suite, where retyping a list item and adding one in the same
  // breath left the retype undone.
  const live = useContentStore((s) => s.byProject[projectId]?.chapters.find((c) => c.id === chapterId)?.blocks.find((b) => b.id === blockProp.id))
  const block = (live ?? blockProp) as ContentBlock

  // Every commit goes through the same history-recording edit the desktop
  // Inspector uses, and reads the *current* block first for the same reason.
  const commit = (updates: Partial<ContentBlock>) => editBlock(projectId, chapterId, block.id, updates)

  if (block.type === 'list') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {([false, true] as const).map((ordered) => (
            <button
              key={String(ordered)}
              type="button"
              onClick={() => commit({ ordered })}
              className={cn(
                'rounded-[var(--radius-button)] border px-3 py-2 text-[13px] font-medium transition-colors',
                block.ordered === ordered ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-border text-text-secondary',
              )}
            >
              {ordered ? 'Numbered' : 'Bulleted'}
            </button>
          ))}
        </div>
        <RowsEditor
          rows={block.items}
          rowLabel="item"
          emptyRow={() => ''}
          fields={[{ key: 'text', label: 'List item', get: (row) => row, set: (_row, value) => value }]}
          onChange={(items) => commit({ items })}
        />
      </div>
    )
  }

  if (block.type === 'checklist') {
    return (
      <RowsEditor
        rows={block.items}
        rowLabel="item"
        emptyRow={() => ({ text: '', checked: false })}
        fields={[{ key: 'text', label: 'Checklist item', get: (row) => row.text, set: (row, value) => ({ ...row, text: value }) }]}
        leading={(row, index, update) => (
          <button
            type="button"
            role="checkbox"
            aria-checked={row.checked}
            aria-label={`Item ${index + 1} done`}
            onClick={() => update({ ...row, checked: !row.checked })}
            className={cn(
              'mt-2 size-5 shrink-0 rounded-[var(--radius-preview)] border transition-colors',
              row.checked ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-border',
            )}
          />
        )}
        onChange={(items) => commit({ items })}
      />
    )
  }

  if (block.type === 'verse') {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mobile-verse-lines">Lines</Label>
        <Textarea
          id="mobile-verse-lines"
          rows={8}
          className="font-[inherit] leading-relaxed"
          defaultValue={block.lines.join('\n')}
          placeholder={'One line per line.\n\nA blank line starts a new stanza.'}
          onBlur={(e) => commit({ lines: e.target.value.split('\n').map((line) => line.trimEnd()) })}
        />
        <p className="text-xs text-text-secondary">A blank line is a stanza break. Line breaks are kept exactly as typed.</p>
      </div>
    )
  }

  if (block.type === 'timeline') {
    return (
      <RowsEditor
        rows={block.entries}
        rowLabel="entry"
        emptyRow={() => ({ label: '', text: '' })}
        fields={[
          { key: 'label', label: 'When', placeholder: 'e.g. 1874', get: (row) => row.label, set: (row, value) => ({ ...row, label: value }) },
          { key: 'text', label: 'What happened', multiline: true, get: (row) => row.text, set: (row, value) => ({ ...row, text: value }) },
        ]}
        onChange={(entries) => commit({ entries })}
      />
    )
  }

  if (block.type === 'faq') {
    return (
      <RowsEditor
        rows={block.entries}
        rowLabel="question"
        emptyRow={() => ({ question: '', answer: '' })}
        fields={[
          { key: 'question', label: 'Question', get: (row) => row.question, set: (row, value) => ({ ...row, question: value }) },
          { key: 'answer', label: 'Answer', multiline: true, get: (row) => row.answer, set: (row, value) => ({ ...row, answer: value }) },
        ]}
        onChange={(entries) => commit({ entries })}
      />
    )
  }

  if (block.type === 'statistics') {
    return (
      <RowsEditor
        rows={block.entries}
        rowLabel="figure"
        emptyRow={() => ({ value: '', label: '' })}
        fields={[
          { key: 'value', label: 'Figure', placeholder: 'e.g. 31', get: (row) => row.value, set: (row, value) => ({ ...row, value }) },
          { key: 'label', label: 'What it counts', get: (row) => row.label, set: (row, value) => ({ ...row, label: value }) },
        ]}
        onChange={(entries) => commit({ entries })}
      />
    )
  }

  if (block.type === 'table') return <TableEditor block={block} commit={commit} />

  return null
}

/**
 * A table, laid out for a phone: the column headings first, then one card
 * per row whose fields are labelled by those headings. See this file's doc
 * comment for why this is not a grid.
 */
function TableEditor({
  block,
  commit,
}: {
  block: Extract<ContentBlock, { type: 'table' }>
  commit: (updates: Partial<ContentBlock>) => void
}) {
  // Adding a column has to widen every existing row, so the two halves are
  // always written together.
  const [columns, setColumns] = useState(block.header.length)

  const setHeaderCell = (index: number, value: string) => {
    const header = block.header.map((cell, i) => (i === index ? value : cell))
    commit({ header })
  }

  const addColumn = () => {
    commit({ header: [...block.header, ''], rows: block.rows.map((row) => [...row, '']) })
    setColumns(block.header.length + 1)
  }

  const deleteColumn = (index: number) => {
    commit({
      header: block.header.filter((_, i) => i !== index),
      rows: block.rows.map((row) => row.filter((_, i) => i !== index)),
    })
    setColumns(Math.max(1, block.header.length - 1))
  }

  const setCell = (rowIndex: number, cellIndex: number, value: string) => {
    commit({ rows: block.rows.map((row, i) => (i === rowIndex ? row.map((cell, j) => (j === cellIndex ? value : cell)) : row)) })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Columns</Label>
        {block.header.map((cell, index) => (
          <div key={`${columns}-${index}`} className="flex items-center gap-2">
            <Input
              aria-label={`Column ${index + 1} heading`}
              placeholder={`Column ${index + 1}`}
              defaultValue={cell}
              onBlur={(e) => setHeaderCell(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete column ${index + 1}`}
              className="hover:text-danger"
              disabled={block.header.length <= 1}
              onClick={() => deleteColumn(index)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" className="gap-1.5 self-start" onClick={addColumn}>
          <Plus className="size-3.5" />
          Add column
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Label>Rows</Label>
        {block.rows.length === 0 && <p className="text-[13px] text-text-secondary">No rows yet.</p>}
        {block.rows.map((row, rowIndex) => (
          <div key={`${block.rows.length}-${columns}-${rowIndex}`} className="flex items-start gap-2 rounded-[var(--radius-card)] border border-border bg-panel p-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {block.header.map((heading, cellIndex) => (
                <div key={cellIndex} className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">{heading || `Column ${cellIndex + 1}`}</span>
                  <Input
                    aria-label={`Row ${rowIndex + 1}, ${heading || `column ${cellIndex + 1}`}`}
                    defaultValue={row[cellIndex] ?? ''}
                    onBlur={(e) => setCell(rowIndex, cellIndex, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <RowControls
              index={rowIndex}
              count={block.rows.length}
              label="row"
              onMove={(delta) => commit({ rows: move(block.rows, rowIndex, delta) })}
              onDelete={() => commit({ rows: block.rows.filter((_, i) => i !== rowIndex) })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="gap-1.5 self-start"
          onClick={() => commit({ rows: [...block.rows, block.header.map(() => '')] })}
        >
          <Plus className="size-3.5" />
          Add row
        </Button>
      </div>
    </div>
  )
}
