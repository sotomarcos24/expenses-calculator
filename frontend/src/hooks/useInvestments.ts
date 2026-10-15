import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.ts'
import type { InvestmentList } from '../api/types.ts'

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
