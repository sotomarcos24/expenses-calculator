import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import {
  isUnauthorized,
  LOGGING_OUT_KEY,
  ME_QUERY_KEY,
  SESSION_EXPIRED_KEY,
} from '../hooks/useAuth.ts'

/**
 * Creates the app's `QueryClient`. Any query or mutation failing with 401 clears the cached
 * user, which makes `RequireAuth` (and `AuthShell` at `/`) redirect to `/login`. Mutations with
 * `meta: { skipGlobal401: true }` (login, register, logout) are excluded.
 */
export function createQueryClient() {
  const clearUser = () => {
    // A 401 only ends a session that is still open: not during a deliberate logout, and not
    // when the user is already logged out (a late answer of an in-flight request of the old
    // session would otherwise leave a stale "expired" flag that redirects `/` to `/login`).
    if (
      queryClient.getQueryData(LOGGING_OUT_KEY) === true ||
      queryClient.getQueryData(ME_QUERY_KEY) === null
    ) {
      return
    }
    queryClient.setQueryData(SESSION_EXPIRED_KEY, true)
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) {
          clearUser()
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (isUnauthorized(error) && mutation.meta?.skipGlobal401 !== true) {
          clearUser()
        }
      },
    }),
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  })
  return queryClient
}
