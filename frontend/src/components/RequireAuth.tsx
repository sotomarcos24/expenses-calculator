import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router'
import { LOGGING_OUT_KEY, useMe } from '../hooks/useAuth.ts'
import { LoadingScreen } from './LoadingScreen.tsx'

/** Renders its children only for a logged-in user; logged-out users go to `/login`, remembering the requested location in `state.from`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isError, isFetching, refetch } = useMe()
  const location = useLocation()
  const queryClient = useQueryClient()

  if (me) {
    return children
  }
  if (me === null) {
    if (queryClient.getQueryData(LOGGING_OUT_KEY) === true) {
      return <Navigate to="/" replace />
    }
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }
  if (isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface px-4">
        <div role="alert" className="text-center">
          <p className="mb-4 text-sm text-muted">We could not load your session.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
  return <LoadingScreen />
}
