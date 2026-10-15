import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'

export const INVESTMENT_FIELDS_INVALID = 'Some fields are invalid. Please check the form.'

/** Statuses whose string `detail` is written for the user (see `backend/app/routers/investments.py`). */
const READABLE_STATUSES = new Set([404, 422])

/**
 * Readable message for a failed investment mutation: the API's `detail` verbatim when it is a
 * string (404 "Investment not found", domain-rule 422), a fixed text for a FastAPI validation
 * list, and the generic message for anything else (500, network error).
 */
export function investmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (READABLE_STATUSES.has(error.status) && typeof error.detail === 'string' && error.detail) {
      return error.detail
    }
    if (error.status === 422 && Array.isArray(error.detail)) {
      return INVESTMENT_FIELDS_INVALID
    }
  }
  return GENERIC_ERROR
}
