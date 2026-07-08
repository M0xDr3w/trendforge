import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn'

type NeoVariant = 'default' | 'active' | 'primary' | 'accent' | 'ghost'
type NeoSize = 'xs' | 'sm' | 'md'

interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: NeoVariant
  size?: NeoSize
  fullWidth?: boolean
  ref?: Ref<HTMLButtonElement>
}

const variantStyles: Record<NeoVariant, string> = {
  default: 'neo-btn',
  active: 'neo-btn active',
  primary: 'neo-btn primary',
  accent: 'neo-btn bg-[var(--accent)] border-[var(--accent)] text-white hover:brightness-110',
  ghost: 'border border-[var(--border)] bg-transparent text-[var(--muted)] hover:border-[var(--cyan)] hover:text-[var(--text)]',
}

const sizeStyles: Record<NeoSize, string> = {
  xs: 'px-2 py-1 text-xs rounded-[var(--radius-sm)]',
  sm: 'px-3 py-1.5 text-xs rounded-[var(--radius-sm)]',
  md: 'px-4 py-2 text-sm rounded-[var(--radius-md)]',
}

export function NeoButton({
  children,
  variant = 'default',
  size = 'md',
  fullWidth,
  className,
  type = 'button',
  ref,
  ...props
}: NeoButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        variantStyles[variant],
        sizeStyles[size],
        'inline-flex items-center justify-center gap-2 font-medium tracking-wide transition-all',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
