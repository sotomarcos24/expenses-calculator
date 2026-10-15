import { useId, type ComponentProps } from 'react'

type SelectFieldProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: string
  error?: string
  hint?: string
}

/** Labelled `<select>` with the same hint / error wiring as `TextField`. */
export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...selectProps
}: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mb-1 text-xs text-muted">
          {hint}
        </p>
      )}
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent ${
          error ? 'border-loss' : 'border-border focus:border-primary'
        }`}
        {...selectProps}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  )
}
