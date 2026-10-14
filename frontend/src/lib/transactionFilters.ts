import type { CategoryKind } from '../api/types.ts'
import { periodRange, type PeriodPreset } from './periods.ts'

/** Filters of the Transactions page. `from` / `to` are only used with the `custom` preset. */
export type TransactionFilterState = {
  preset: PeriodPreset
  /** Custom range bounds as `YYYY-MM-DD`; an empty string is open-ended. */
  from: string
  to: string
  type: CategoryKind | null
  categoryId: number | null
  subcategoryId: number | null
}

/** Query parameters of `GET /api/transactions`; only the ones that are set are sent. */
export type TransactionListParams = {
  from?: string
  to?: string
  type?: CategoryKind
  category_id?: number
  subcategory_id?: number
  page?: number
}

export const DEFAULT_FILTERS: TransactionFilterState = {
  preset: 'this-month',
  from: '',
  to: '',
  type: null,
  categoryId: null,
  subcategoryId: null,
}

/** What "Clear filters" sets: All time and every other filter on "All". */
export const CLEARED_FILTERS: TransactionFilterState = { ...DEFAULT_FILTERS, preset: 'all-time' }

/** Whether any filter differs from the cleared state (the default "This month" counts). */
export function hasActiveFilters(filters: TransactionFilterState) {
  return (
    filters.preset !== 'all-time' ||
    filters.type !== null ||
    filters.categoryId !== null ||
    filters.subcategoryId !== null
  )
}

/** A custom range is invalid when both bounds are set and From is later than To. */
export function isRangeInvalid(filters: TransactionFilterState) {
  return (
    filters.preset === 'custom' &&
    filters.from !== '' &&
    filters.to !== '' &&
    filters.from > filters.to
  )
}

/**
 * Request parameters for `filters` (`today` is the local date the presets are relative to), or
 * `null` when the custom range is invalid and no request must be sent.
 */
export function filtersToParams(
  filters: TransactionFilterState,
  today: Date = new Date(),
): Omit<TransactionListParams, 'page'> | null {
  if (isRangeInvalid(filters)) {
    return null
  }
  const range =
    filters.preset === 'custom'
      ? { from: filters.from || undefined, to: filters.to || undefined }
      : periodRange(filters.preset, today)
  const params: Omit<TransactionListParams, 'page'> = {}
  if (range.from) params.from = range.from
  if (range.to) params.to = range.to
  if (filters.type) params.type = filters.type
  if (filters.categoryId !== null) params.category_id = filters.categoryId
  if (filters.subcategoryId !== null) params.subcategory_id = filters.subcategoryId
  return params
}
