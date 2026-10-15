import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastApi, type ToastKind } from '../lib/toastContext.ts'
import { ToastItem } from './ToastItem.tsx'

type ToastData = { id: number; kind: ToastKind; message: string }

/** Provides `useToast()` and renders the toast stack (bottom of the viewport, above dialogs). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => {
    const show = (kind: ToastKind) => (message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, kind, message }])
    }
    return { success: show('success'), error: show('error') }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            id={toast.id}
            kind={toast.kind}
            message={toast.message}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
