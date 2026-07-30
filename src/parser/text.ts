import type { Chapter } from '@/types/content'
import { generateId } from '@/utils'

const CHAPTER_PATTERN = /^\s*(chapter|part|prologue|epilogue)\b.*$/i

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Parses plain text into chapters. Blank lines separate paragraphs; lines
 * starting with "Chapter", "Part", "Prologue" or "Epilogue" start a new chapter. */
export function parseText(source: string, fallbackTitle: string): Chapter[] {
  const normalised = source.replace(/\r\n?/g, '\n')
  const blocks = normalised.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)

  const chapters: Chapter[] = []
  let current: Chapter = { id: generateId('ch'), title: fallbackTitle, order: 0, blocks: [] }

  for (const block of blocks) {
    if (CHAPTER_PATTERN.test(block) && block.split('\n').length === 1 && block.length < 80) {
      if (current.blocks.length > 0 || chapters.length > 0) chapters.push(current)
      current = { id: generateId('ch'), title: block.trim(), order: chapters.length, blocks: [] }
      continue
    }
    current.blocks.push({
      id: generateId('blk'),
      type: 'paragraph',
      html: escapeHtml(block.replace(/\n/g, ' ')),
    })
  }
  chapters.push(current)

  return chapters.filter((c) => c.blocks.length > 0).map((c, i) => ({ ...c, order: i }))
}
