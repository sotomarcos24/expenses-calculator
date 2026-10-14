import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.ts'
import type { TransactionPage } from '../api/types.ts'
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
