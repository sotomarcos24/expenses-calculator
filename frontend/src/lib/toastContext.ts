import { createContext } from 'react'

export type ToastKind = 'success' | 'error'

export type ToastApi = {
  /** Shows a success toast (`role="status"`). */
  success: (message: string) => void
  /** Shows an error toast (`role="alert"`). */
  error: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
