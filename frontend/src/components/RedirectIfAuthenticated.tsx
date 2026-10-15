import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMe } from '../hooks/useAuth.ts'
import { redirectTargetFromState } from '../lib/redirect.ts'
import { LoadingScreen } from './LoadingScreen.tsx'

/**
 * Public-only pages (login, register): a logged-in user is sent to `/`, or to a safe
 * `state.from` (right after a login this guard re-renders before the login page navigates).
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()
  const location = useLocation()

  if (me) {
    return <Navigate to={redirectTargetFromState(location.state)} replace />
  }
  if (isPending) {
    return <LoadingScreen />
  }
  return children
}
