import type { ReactNode } from 'react'
import { cn } from './cn'
import { HudLabel } from './HudLabel'

type StatVariant = 'default' | 'positive' | 'negative' | 'accent' | 'cyan' | 'warning'

interface StatPillProps {
  label: string
  value: ReactNode
  variant?: StatVariant
  className?: string
}

const valueStyles: Record<StatVariant, string> = {
  default: 'text-[var(--text)]',
  positive: 'text-[var(--green)]',
  negative: 'text-red-400',
  accent: 'text-[var(--accent)]',
  cyan: 'text-[var(--cyan)]',
  warning: 'text-amber-400',
}

export function StatPill({ label, value, variant = 'default', className }: StatPillProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel)] p-2 text-center backdrop-blur-sm',
        className,
      )}
    >
      <HudLabel className="block text-[10px] tracking-[2px] text-[var(--muted)]">{label}</HudLabel>
      <div className={cn('mt-0.5 text-sm font-semibold font-display', valueStyles[variant])}>{value}</div>
    </div>
  )
}
