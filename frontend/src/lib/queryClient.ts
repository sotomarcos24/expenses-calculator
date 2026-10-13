import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isUnauthorized, ME_QUERY_KEY } from '../hooks/useAuth.ts'

/**
 * Creates the app's `QueryClient`. Any query or mutation failing with 401 clears the cached
 * user, which makes `RequireAuth` redirect to `/login`. Mutations with
 * `meta: { skipGlobal401: true }` (login, register) are excluded.
 */
export function createQueryClient() {
  const clearUser = () => queryClient.setQueryData(ME_QUERY_KEY, null)

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
