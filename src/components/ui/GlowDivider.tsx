import { cn } from './cn'

interface GlowDividerProps {
  className?: string
  vertical?: boolean
}

export function GlowDivider({ className, vertical }: GlowDividerProps) {
  return (
    <div
      role="separator"
      className={cn(
        vertical
          ? 'w-px self-stretch bg-gradient-to-b from-transparent via-[var(--border-glow)] to-transparent'
          : 'h-px w-full bg-gradient-to-r from-transparent via-[var(--border-glow)] to-transparent',
        className,
      )}
    />
  )
}
