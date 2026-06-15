import { ButtonHTMLAttributes, ReactNode } from 'react'
import Spinner from './Spinner'

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant
  size?:     Size
  loading?:  boolean
  children:  ReactNode
  fullWidth?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-primary hover:bg-primary-light active:bg-primary-dark text-white shadow-pill',
  accent:    'bg-accent hover:bg-accent-light active:bg-accent text-white shadow-sm',
  secondary: 'bg-brand-surface border border-brand-border hover:border-primary/40 hover:text-primary text-brand-text shadow-xs',
  danger:    'bg-negative hover:bg-red-500 active:bg-red-700 text-white shadow-sm',
  ghost:     'hover:bg-primary/8 text-brand-muted hover:text-primary',
  success:   'bg-positive hover:bg-green-600 text-white shadow-sm',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-1.5 text-xs  rounded-full',
  md: 'px-5 py-2   text-sm  rounded-full',
  lg: 'px-6 py-3   text-sm  rounded-full min-h-touch font-semibold',
}

export default function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  children,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading && <Spinner size="sm" color="text-current" />}
      {children}
    </button>
  )
}
