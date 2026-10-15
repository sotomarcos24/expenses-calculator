import { useEffect } from 'react'
import type { ToastKind } from '../lib/toastContext.ts'

/** How long a toast stays on screen before it dismisses itself. */
export const TOAST_DURATION_MS = 4000

type ToastItemProps = {
  id: number
  kind: ToastKind
  message: string
  /** Must be stable: a new function would restart the auto-dismiss timer. */
  onDismiss: (id: number) => void
}

export function ToastItem({ id, kind, message, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [id, onDismiss])

  const isError = kind === 'error'
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg ${
        isError ? 'border-loss text-loss' : 'border-border text-foreground'
      }`}
    >
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="-my-2 -mr-3 grid size-10 shrink-0 place-items-center rounded-md text-muted hover:bg-accent hover:text-primary"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
