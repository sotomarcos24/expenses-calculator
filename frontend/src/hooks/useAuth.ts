import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError, apiFetch } from '../api/client.ts'
import type { LoginRequest, RegisterRequest, UserRead } from '../api/types.ts'

/** Cache key of the current user: `UserRead` when logged in, `null` when logged out. */
export const ME_QUERY_KEY = ['me'] as const
/** Set to `true` when a 401 ends the session (as opposed to a deliberate logout). */
export const SESSION_EXPIRED_KEY = ['session-expired'] as const

/** Mutation meta that opts out of the global 401 handler (see `src/lib/queryClient.ts`). */
export const SKIP_GLOBAL_401 = { skipGlobal401: true }

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

/** The logged-in user, or `null` when the session is missing or expired. */
export function useMe() {
  return useQuery<UserRead | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<UserRead>('/auth/me')
      } catch (error) {
        if (isUnauthorized(error)) {
          return null
        }
        throw error
      }
    },
    // A 401 already resolves to `null`; other failures show a "Try again" button instead.
    retry: false,
    // Fetched once per page load: login/register/logout and the global 401 handler keep the
    // cached value up to date, so switching between guarded routes does not refetch it.
    staleTime: Infinity,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: LoginRequest) =>
      apiFetch<UserRead>('/auth/login', { method: 'POST', body: credentials }),
    // A 401 here means wrong credentials, not an expired session.
    meta: SKIP_GLOBAL_401,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user)
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: RegisterRequest) =>
      apiFetch<UserRead>('/auth/register', { method: 'POST', body: data }),
    meta: SKIP_GLOBAL_401,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    // The user wants to leave: log out client side even if the request fails (500, 401,
    // network error). No error is shown.
    onSettled: async () => {
      // Another user may log in next: drop every other cached query (also SESSION_EXPIRED_KEY,
      // so a deliberate logout lands on the landing page, not on /login).
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
      queryClient.setQueryData(ME_QUERY_KEY, null)
      await navigate('/', { replace: true })
    },
  })
}
