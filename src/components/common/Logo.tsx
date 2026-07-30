import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  withWordmark?: boolean
}

/**
 * Book Studio mark: an open book silhouette rendered as two facing
 * pages, doubling as a subtle nod to the facing-page layout engine.
 */
export function Logo({ className, withWordmark = false }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M3 5.5C3 4.67 3.67 4 4.5 4H11V19.5H4.5C3.67 19.5 3 18.83 3 18V5.5Z"
          fill="var(--color-accent)"
        />
        <path
          d="M21 5.5C21 4.67 20.33 4 19.5 4H13V19.5H19.5C20.33 19.5 21 18.83 21 18V5.5Z"
          fill="var(--color-accent)"
          fillOpacity="0.55"
        />
      </svg>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-text-primary">
          Book Studio
        </span>
      )}
    </div>
  )
}
