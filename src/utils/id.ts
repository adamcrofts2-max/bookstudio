/** Generates a collision-resistant id for projects, chapters, blocks, etc. */
export function generateId(prefix?: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${id}` : id
}
