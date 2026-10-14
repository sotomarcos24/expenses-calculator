import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Button } from './Button.tsx'

type DeleteConfirmationProps = {
  message: string
  /** Disables Delete while the request is in flight. */
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Inline delete confirmation shown on a category row. Cancel is focused; Escape cancels. */
export function DeleteConfirmation({
  message,
  pending,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      role="group"
      aria-label="Confirm delete"
      onKeyDown={onKeyDown}
      className="my-1 flex flex-wrap items-center gap-2 rounded-lg border border-loss bg-background px-3 py-2"
    >
      <p className="min-w-0 flex-1 basis-40 text-sm break-words text-foreground">{message}</p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={pending}>
          Delete
        </Button>
        <Button ref={cancelRef} variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
