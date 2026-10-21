import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError, apiFetch } from '../api/client.ts'
import type { DeleteAccountRequest, LoginRequest, RegisterRequest, UserRead } from '../api/types.ts'
import { useToast } from './useToast.ts'

/** Cache key of the current user: `UserRead` when logged in, `null` when logged out. */
export const ME_QUERY_KEY = ['me'] as const
/** Set to `true` when a 401 ends the session (as opposed to a deliberate logout). */
export const SESSION_EXPIRED_KEY = ['session-expired'] as const

/** `true` while a deliberate logout is in progress: nothing may send the user to `/login`. */
export const LOGGING_OUT_KEY = ['logging-out'] as const

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
      queryClient.removeQueries({ queryKey: SESSION_EXPIRED_KEY })
      queryClient.removeQueries({ queryKey: LOGGING_OUT_KEY })
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
      queryClient.removeQueries({ queryKey: SESSION_EXPIRED_KEY })
      queryClient.removeQueries({ queryKey: LOGGING_OUT_KEY })
      queryClient.setQueryData(ME_QUERY_KEY, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    // A 401 here is not an expired session: the user is leaving anyway.
    meta: SKIP_GLOBAL_401,
    // The user wants to leave: log out client side even if the request fails (500, 401,
    // network error). No error is shown.
    onSettled: async () => {
      // Another user may log in next: drop every other cached query (also SESSION_EXPIRED_KEY,
      // so a deliberate logout lands on the landing page, not on /login).
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
      // While this flag is set, RequireAuth sends a logged-out user to / (not /login) and the
      // global 401 handler ignores late answers of the old session.
      queryClient.setQueryData(LOGGING_OUT_KEY, true)
      queryClient.setQueryData(ME_QUERY_KEY, null)
      // The flag is cleared once the landing is shown (AuthShell) or the user logs in again:
      // router updates are transitions, so the urgent `me = null` render can come first.
      await navigate('/', { replace: true })
    },
  })
}

/**
 * Deletes the account (`DELETE /auth/me`). On success it ends the session like a logout and
 * lands on `/` with a confirmation toast. Needs a `ToastProvider` above (mounted in `AuthShell`,
 * so it survives the switch from the app layout to the landing).
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  return useMutation({
    mutationFn: (data: DeleteAccountRequest) =>
      apiFetch<void>('/auth/me', { method: 'DELETE', body: data }),
    // A 401 here is a wrong password, not an expired session: it must not log the user out.
    meta: SKIP_GLOBAL_401,
    onSuccess: async () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
      queryClient.setQueryData(LOGGING_OUT_KEY, true)
      queryClient.setQueryData(ME_QUERY_KEY, null)
      await navigate('/', { replace: true })
      toast.success('Your account has been deleted.')
    },
  })
}
