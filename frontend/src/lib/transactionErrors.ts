import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'

export const TRANSACTION_FIELDS_INVALID = 'Some fields are invalid. Please check the form.'

/** Statuses whose string `detail` is written for the user (see `backend/app/routers/transactions.py`). */
const READABLE_STATUSES = new Set([404, 422])

/**
 * Readable message for a failed transaction mutation: the API's `detail` verbatim when it is a
 * string (404 "Category not found" / "Transaction not found", domain-rule 422), a fixed text for a
 * FastAPI validation list, and the generic message for anything else (500, network error).
 */
export function transactionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (READABLE_STATUSES.has(error.status) && typeof error.detail === 'string' && error.detail) {
      return error.detail
    }
    if (error.status === 422 && Array.isArray(error.detail)) {
      return TRANSACTION_FIELDS_INVALID
    }
  }
  return GENERIC_ERROR
}
