import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'
import { LOGGING_OUT_KEY, SESSION_EXPIRED_KEY, useMe } from '../hooks/useAuth.ts'
import { LandingPage } from '../pages/LandingPage.tsx'
import { AppLayout } from './AppLayout.tsx'
import { RequireAuth } from './RequireAuth.tsx'

/**
 * `/` is the public landing for guests and the Dashboard for a logged-in user; every other path
 * under this layout still requires a session (guests go to `/login`).
 */
export function AuthShell() {
  const { data: me } = useMe()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const showLanding = me === null && pathname === '/'

  // The deliberate logout has reached the landing: it is over.
  useEffect(() => {
    if (showLanding) {
      queryClient.removeQueries({ queryKey: LOGGING_OUT_KEY })
    }
  }, [showLanding, queryClient])

  if (showLanding) {
    // A 401 in the middle of a session still sends the user to /login, as on any other page.
    if (queryClient.getQueryData(SESSION_EXPIRED_KEY) === true) {
      return <Navigate to="/login" replace state={{ from: '/' }} />
    }
    return <LandingPage />
  }
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  )
}
