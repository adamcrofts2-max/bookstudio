import type { ContentBlock } from '@/types/content'
import type { ResolvedBookTheme } from '@/theme/presets'
import { useAssetStore } from '@/store/assetStore'
import { cn } from '@/lib/utils'

interface BlockContentProps {
  block: ContentBlock
  theme: ResolvedBookTheme
  dropCap?: boolean
  selected?: boolean
  onSelect?: () => void
}

/**
 * Renders a single manuscript block using the active theme's typography.
 * Used both for real page display and for off-screen height measurement —
 * the two must stay pixel-identical, so there is exactly one implementation.
 */
export function BlockContent({ block, theme, dropCap, selected, onSelect }: BlockContentProps) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl)
  const wrapperClass = cn(
    'outline-offset-4 transition-[outline-color] duration-150',
    selected ? 'outline outline-2 outline-[var(--color-accent)] rounded-sm' : 'outline outline-2 outline-transparent',
  )

  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h2' : 'h3'
      return (
        <Tag
          onClick={onSelect}
          className={cn(wrapperClass, 'cursor-pointer pt-8 pb-2.5')}
          style={{
            fontFamily: theme.fonts.heading,
            fontWeight: theme.typography.headingWeight,
            fontSize: block.level === 2 ? '1.5em' : '1.2em',
            lineHeight: 1.25,
            color: theme.page.ink,
          }}
        >
          {block.text}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p
          onClick={onSelect}
          className={cn(wrapperClass, 'cursor-pointer pb-3.5', dropCap && 'book-drop-cap')}
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
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      )
    case 'quote':
      return (
        <blockquote
          onClick={onSelect}
          className={cn(wrapperClass, 'cursor-pointer py-6 pl-5')}
          style={{
            fontFamily: theme.fonts.heading,
            fontSize: theme.typography.bodySize * 1.15,
            lineHeight: 1.5,
            color: theme.page.accent,
            borderLeft: `2px solid ${theme.page.ruleColor}`,
          }}
        >
          <p className="italic">&ldquo;{block.text}&rdquo;</p>
          {block.attribution && (
            <footer className="mt-2 text-[0.7em] not-italic" style={{ color: theme.page.mutedInk }}>
              — {block.attribution}
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
            <li key={i} className="pb-1">
              {item}
            </li>
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
                <th
                  key={i}
                  className="border-b py-1.5 text-left font-semibold"
                  style={{ borderColor: theme.page.ruleColor }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border-b py-1.5" style={{ borderColor: theme.page.ruleColor }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'image': {
      const url = getObjectUrl(block.assetId)
      return (
        <figure onClick={onSelect} className={cn(wrapperClass, 'cursor-pointer pb-5')}>
          <div className="overflow-hidden rounded-[var(--radius-image)]" style={{ background: theme.page.ruleColor }}>
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
              className="pt-2 text-[0.75em] italic"
              style={{ fontFamily: theme.fonts.body, color: theme.page.mutedInk }}
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
