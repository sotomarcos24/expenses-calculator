import type { ComponentProps } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm' | 'icon'

type ButtonProps = ComponentProps<'button'> & {
  /** `primary` (default): filled blue. `secondary`: bordered. `danger`: red. `ghost`: no border. */
  variant?: ButtonVariant
  /** `md` (default) for forms, `sm` for inline actions, `icon` for square icon-only buttons. */
  size?: ButtonSize
  /** Stretch to the width of the container. */
  fullWidth?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary:
    'border border-border bg-background text-foreground hover:bg-accent hover:text-primary',
  danger: 'bg-loss text-primary-foreground hover:opacity-90',
  ghost: 'text-muted hover:bg-accent hover:text-primary',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'rounded-lg px-4 py-2',
  sm: 'rounded-md px-3 py-1.5',
  icon: 'inline-flex size-8 items-center justify-center rounded-md',
}

/** Shared button. Defaults to the primary look used by the auth forms. */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${fullWidth ? 'w-full' : ''} ${SIZES[size]} ${VARIANTS[variant]} shrink-0 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  )
}
