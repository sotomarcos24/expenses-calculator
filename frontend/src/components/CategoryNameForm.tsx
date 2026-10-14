import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { categoryNameSchema } from '../lib/categorySchemas.ts'
import { Button } from './Button.tsx'

type CategoryNameFormProps = {
  /** Accessible name of the input, e.g. "Category name". */
  label: string
  defaultValue?: string
  /** Message of the last failed request, shown under the input. */
  error?: string
  /** Disables Save while a request is in flight. */
  pending: boolean
  /** Called with the trimmed, valid name. */
  onSave: (name: string) => void
  onCancel: () => void
}

/**
 * Inline name input with Save / Cancel. Focused when opened; Enter saves, Escape cancels.
 * The name is validated on the client (trimmed, 1–100 characters) before `onSave` is called.
 * The typed text is kept while the form stays open (e.g. after a failed request).
 */
export function CategoryNameForm({
  label,
  defaultValue = '',
  error,
  pending,
  onSave,
  onCancel,
}: CategoryNameFormProps) {
  const id = useId()
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)
  const [invalid, setInvalid] = useState<string>()
  const message = invalid ?? error

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) {
      return
    }
    const result = categoryNameSchema.safeParse(value)
    if (!result.success) {
      setInvalid(result.error.issues[0]?.message)
      return
    }
    setInvalid(undefined)
    onSave(result.data)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <form noValidate onSubmit={submit} className="min-w-0 flex-1 py-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={label}
          autoComplete="off"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={`w-full min-w-0 flex-1 basis-40 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent ${
            message ? 'border-loss' : 'border-border focus:border-primary'
          }`}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
      {message && (
        <p id={errorId} role="alert" className="mt-1 text-sm break-words text-loss">
          {message}
        </p>
      )}
    </form>
  )
}
