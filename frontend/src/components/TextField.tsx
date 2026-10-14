import { useId, type ComponentProps } from 'react'

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string
  error?: string
  /** Help text under the label, linked through `aria-describedby`. */
  hint?: string
}

/** Labelled input with an optional hint and an inline error, linked through `aria-describedby`. */
export function TextField({ label, error, hint, className, ...inputProps }: TextFieldProps) {
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
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent ${
          error ? 'border-loss' : 'border-border focus:border-primary'
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  )
}
