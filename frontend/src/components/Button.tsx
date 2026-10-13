import type { ComponentProps } from 'react'

/** Primary full-width button. */
export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={`w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  )
}
