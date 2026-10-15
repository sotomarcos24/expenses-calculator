import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../api/client.ts'
import type {
  TransactionCreate,
  TransactionPage,
  TransactionRead,
  TransactionUpdate,
} from '../api/types.ts'
import { CATEGORY_TOTALS_QUERY_KEY } from './useCategories.ts'
import type { TransactionListParams } from '../lib/transactionFilters.ts'

/**
 * Prefix of every transactions query key (each page and filter, and the unfiltered total).
 * Invalidate it after any transaction change.
 */
export const TRANSACTIONS_QUERY_KEY = ['transactions'] as const

/** Rows per page of the Transactions list (always sent as `page_size`). */
export const TRANSACTIONS_PAGE_SIZE = 50

function transactionsPath(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(name, String(value))
    }
  }
  return `/transactions?${search.toString()}`
}

/**
 * One page of the current user's transactions (`GET /api/transactions`), newest first. Only the
 * parameters that are set are sent. `params = null` disables the request (e.g. invalid range).
 * The previous page stays visible while the next one loads.
 */
export function useTransactions(params: TransactionListParams | null) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, params],
    queryFn: () =>
      apiFetch<TransactionPage>(transactionsPath({ ...params, page_size: TRANSACTIONS_PAGE_SIZE })),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  })
}

/**
 * Number of transactions of the user, ignoring every filter (`GET /api/transactions?page_size=1`).
 * Used to tell "no transactions yet" from "nothing matches these filters".
 */
export function useTransactionsTotal(enabled: boolean) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, 'total'],
    queryFn: () => apiFetch<TransactionPage>(transactionsPath({ page_size: 1 })),
    enabled,
    select: (page) => page.total,
  })
}

/**
 * Callbacks shared by the transaction mutations: refetch every transactions query (each page and
 * filter) after a success, and after a 404 too (the row or a category is gone, so the list must
 * resync). The promises are awaited by TanStack Query, so `mutateAsync` settles after the refetch.
 * No optimistic updates.
 */
function useResyncTransactions() {
  const queryClient = useQueryClient()
  // The Categories page shows period totals computed from the transactions.
  const resync = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: CATEGORY_TOTALS_QUERY_KEY }),
    ])
  return {
    onSuccess: resync,
    onError: (error: unknown) =>
      error instanceof ApiError && error.status === 404 ? resync() : undefined,
  }
}

/** `POST /api/transactions`: creates an income or an expense. */
export function useCreateTransaction() {
  return useMutation({
    mutationFn: (body: TransactionCreate) =>
      apiFetch<TransactionRead>('/transactions', { method: 'POST', body }),
    ...useResyncTransactions(),
  })
}

/** `PATCH /api/transactions/{id}`: updates the sent fields (`null` clears a nullable one). */
export function useUpdateTransaction() {
  return useMutation({
    mutationFn: ({ id, ...body }: TransactionUpdate & { id: number }) =>
      apiFetch<TransactionRead>(`/transactions/${id}`, { method: 'PATCH', body }),
    ...useResyncTransactions(),
  })
}

/**
 * `DELETE /api/transactions/{id}` (204, no body). A 404 means the row is already gone: the list is
 * refetched too.
 */
export function useDeleteTransaction() {
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' }),
    ...useResyncTransactions(),
  })
}
