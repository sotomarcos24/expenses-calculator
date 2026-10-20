import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../api/client.ts'
import type { CategoryAmountPut, CategoryAmountRead } from '../api/types.ts'
import { CATEGORY_TOTALS_QUERY_KEY } from './useCategories.ts'
import { DASHBOARD_QUERY_KEY } from './useDashboard.ts'
import { SIMULATOR_DEFAULTS_QUERY_KEY } from './useSimulator.ts'

/** Cache key of the monthly amounts list. */
export const CATEGORY_AMOUNTS_QUERY_KEY = ['category-amounts'] as const

/** The current user's fixed monthly amounts (`GET /api/category-amounts`). */
export function useCategoryAmounts() {
  return useQuery({
    queryKey: CATEGORY_AMOUNTS_QUERY_KEY,
    queryFn: () => apiFetch<CategoryAmountRead[]>('/category-amounts'),
  })
}

/**
 * Callbacks shared by the amount mutations: refetch the amounts and everything computed from them
 * (dashboard, category totals, simulator defaults) after a success, and after a 404 too (the
 * category or amount is gone). The promises are awaited, so `mutateAsync` settles after the
 * refetch. No optimistic updates.
 */
function useResyncAmounts() {
  const queryClient = useQueryClient()
  const resync = () =>
    Promise.all(
      [
        CATEGORY_AMOUNTS_QUERY_KEY,
        DASHBOARD_QUERY_KEY,
        CATEGORY_TOTALS_QUERY_KEY,
        SIMULATOR_DEFAULTS_QUERY_KEY,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  return {
    onSuccess: resync,
    onError: (error: unknown) =>
      error instanceof ApiError && error.status === 404 ? resync() : undefined,
  }
}

/** `PUT /api/category-amounts`: creates the amount of a category / subcategory or replaces it. */
export function usePutCategoryAmount() {
  return useMutation({
    mutationFn: (body: CategoryAmountPut) =>
      apiFetch<CategoryAmountRead>('/category-amounts', { method: 'PUT', body }),
    ...useResyncAmounts(),
  })
}

/** `DELETE /api/category-amounts/{id}` (204). */
export function useDeleteCategoryAmount() {
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/category-amounts/${id}`, { method: 'DELETE' }),
    ...useResyncAmounts(),
  })
}
