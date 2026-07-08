import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

export function FieldInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('tf-field', className)} {...props} />
}
