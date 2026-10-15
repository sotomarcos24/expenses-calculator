import { useContext } from 'react'
import { ToastContext, type ToastApi } from '../lib/toastContext.ts'

/** `toast.success(message)` / `toast.error(message)`. Needs a `ToastProvider` above. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new Error('useToast must be used inside a ToastProvider')
  }
  return api
}
