import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useMe } from '../hooks/useAuth.ts'
import { LoadingScreen } from './LoadingScreen.tsx'

/** Public-only pages (login, register): a logged-in user is sent to `/`. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()

  if (me) {
    return <Navigate to="/" replace />
  }
  if (isPending) {
    return <LoadingScreen />
  }
  return children
}
