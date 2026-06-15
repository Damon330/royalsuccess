type BadgeVariant = 'green' | 'blue' | 'yellow' | 'red' | 'pink' | 'gray' | 'primary'

interface BadgeProps {
  children:  React.ReactNode
  variant?:  BadgeVariant
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'bg-primary/10    text-primary          dark:bg-primary/20',
  green:   'bg-positive/10   text-positive         dark:bg-positive/15',
  blue:    'bg-blue-100      text-blue-700         dark:bg-blue-900/30  dark:text-blue-300',
  yellow:  'bg-amber-100     text-amber-700        dark:bg-amber-900/30 dark:text-amber-300',
  red:     'bg-negative/10   text-negative         dark:bg-negative/15',
  pink:    'bg-accent/10     text-accent           dark:bg-accent/15',
  gray:    'bg-brand-border  text-brand-muted',
}

export default function Badge({ children, variant = 'gray', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  )
}
