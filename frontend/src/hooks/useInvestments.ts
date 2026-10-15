import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../api/client.ts'
import type {
  InvestmentCreate,
  InvestmentList,
  InvestmentRead,
  InvestmentUpdate,
} from '../api/types.ts'

/** Key of the investments query (items and portfolio totals). Invalidate it after any change. */
export const INVESTMENTS_QUERY_KEY = ['investments'] as const

/**
 * The current user's investments with their gain/loss and the portfolio totals
 * (`GET /api/investments`). Items come sorted by name from the API and are never re-sorted.
 */
export function useInvestments() {
  return useQuery({
    queryKey: INVESTMENTS_QUERY_KEY,
    queryFn: () => apiFetch<InvestmentList>('/investments'),
  })
}

/**
 * Callbacks shared by the investment mutations: refetch the list (items and totals) after a
 * success, and after a 404 too (the row is gone, so the list must resync). The promises are
 * awaited by TanStack Query, so the mutation settles after the refetch. No optimistic updates.
 */
function useResyncInvestments() {
  const queryClient = useQueryClient()
  const resync = () => queryClient.invalidateQueries({ queryKey: INVESTMENTS_QUERY_KEY })
  return {
    onSuccess: resync,
    onError: (error: unknown) =>
      error instanceof ApiError && error.status === 404 ? resync() : undefined,
  }
}

/** `POST /api/investments`: creates an investment. */
export function useCreateInvestment() {
  return useMutation({
    mutationFn: (body: InvestmentCreate) =>
      apiFetch<InvestmentRead>('/investments', { method: 'POST', body }),
    ...useResyncInvestments(),
  })
}

/**
 * `PATCH /api/investments/{id}`: updates only the sent fields (`platform: null` clears it). The
 * variables are `{ id, ...body }`, so a caller can send a single field (e.g. `{ id,
 * current_value }`; the API then moves the last update to today).
 */
export function useUpdateInvestment() {
  return useMutation({
    mutationFn: ({ id, ...body }: InvestmentUpdate & { id: number }) =>
      apiFetch<InvestmentRead>(`/investments/${id}`, { method: 'PATCH', body }),
    ...useResyncInvestments(),
  })
}
