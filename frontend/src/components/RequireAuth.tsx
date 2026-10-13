import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useMe } from '../hooks/useAuth.ts'
import { LoadingScreen } from './LoadingScreen.tsx'

/** Renders its children only for a logged-in user; logged-out users go to `/login`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isError, isFetching, refetch } = useMe()

  if (me) {
    return children
  }
  if (me === null) {
    return <Navigate to="/login" replace />
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
