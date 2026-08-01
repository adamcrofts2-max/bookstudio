import type { Layer0EntityKind } from '@/types/layer0'

/**
 * Describes one editable text field on a Layer 0 entity form. Every field
 * across all eight entity kinds is plain text or optional plain text
 * (`TimelineEvent.order` is the one exception — deliberately not a form
 * field, see `EntityListPanel.tsx`'s save handler), so a single generic
 * `{ key, label, type }` shape covers every kind without inventing a
 * per-kind form component. This trades per-field compile-time type safety
 * inside the form (values live in a loose `Record<string, string>` while
 * being edited) for one shared, maintainable implementation instead of
 * eight near-identical ones — the same tradeoff `layer0Store.ts` already
 * makes at the store layer, just one level up in the UI.
 */
export interface Layer0FieldConfig {
  key: string
  label: string
  type: 'text' | 'textarea'
  placeholder?: string
}

export interface Layer0KindFormConfig {
  /** The field shown as an entity's title/name in the list and used as the
   * "must not be empty to save" requirement — every entity kind has
   * exactly one field that plays this role (`name`/`title`/`term`/`rule`). */
  primaryKey: string
  /** Optional second field shown as a list row's subtitle (truncated). */
  secondaryKey?: string
  /** Every editable field, in the order the form presents them —
   * `primaryKey`'s own field is always first. */
  fields: Layer0FieldConfig[]
}

export const LAYER0_FORM_CONFIG: Record<Layer0EntityKind, Layer0KindFormConfig> = {
  character: {
    primaryKey: 'name',
    secondaryKey: 'role',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Character name…' },
      { key: 'role', label: 'Role', type: 'text', placeholder: 'e.g. Protagonist, mentor, rival…' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Appearance, personality, backstory…' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Anything else worth remembering…' },
    ],
  },
  location: {
    primaryKey: 'name',
    secondaryKey: 'description',
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Location name…' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What it looks and feels like…' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  timelineEvent: {
    primaryKey: 'title',
    secondaryKey: 'when',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'What happens…' },
      { key: 'when', label: 'When', type: 'text', placeholder: 'e.g. Day 3, Spring Year 1…' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  glossaryTerm: {
    primaryKey: 'term',
    secondaryKey: 'definition',
    fields: [
      { key: 'term', label: 'Term', type: 'text', placeholder: 'Invented word or piece of jargon…' },
      { key: 'definition', label: 'Definition', type: 'textarea', placeholder: 'What it means…' },
    ],
  },
  reference: {
    primaryKey: 'title',
    secondaryKey: 'url',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://…' },
      { key: 'citation', label: 'Citation', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  illustrationBrief: {
    primaryKey: 'title',
    secondaryKey: 'description',
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'What needs illustrating…' },
      { key: 'description', label: 'Brief', type: 'textarea', placeholder: 'Describe the artwork needed…' },
    ],
  },
  styleRule: {
    primaryKey: 'rule',
    fields: [{ key: 'rule', label: 'Rule', type: 'textarea', placeholder: 'e.g. Always British spelling…' }],
  },
  researchNote: {
    primaryKey: 'title',
    secondaryKey: 'body',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'sourceUrl', label: 'Source URL', type: 'text', placeholder: 'https://…' },
      { key: 'body', label: 'Notes', type: 'textarea' },
    ],
  },
}
