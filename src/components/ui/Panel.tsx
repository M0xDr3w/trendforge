import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  glow?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Panel({ children, glow, padding = 'md', className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-glass)] backdrop-blur-md',
        glow && 'panel-glow',
        paddingStyles[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
