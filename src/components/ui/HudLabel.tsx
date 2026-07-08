import type { ReactNode } from 'react'
import { cn } from './cn'

interface HudLabelProps {
  children: ReactNode
  className?: string
  as?: 'span' | 'div' | 'p'
}

export function HudLabel({ children, className, as: Tag = 'span' }: HudLabelProps) {
  return <Tag className={cn('hud text-[var(--muted)]', className)}>{children}</Tag>
}
