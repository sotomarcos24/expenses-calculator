import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'

export const CATEGORY_NAME_INVALID = 'Name must be 1–100 characters'

/** Statuses whose string `detail` is written for the user (see `backend/app/routers/categories.py`). */
const READABLE_STATUSES = new Set([404, 409, 422])

/**
 * Readable message for a failed category mutation: the API's `detail` verbatim when it is a
 * string (409 duplicate / in use, 404, string 422), a fixed text for a FastAPI validation list,
 * and the generic message for anything else (500, network error).
 */
export function categoryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (READABLE_STATUSES.has(error.status) && typeof error.detail === 'string' && error.detail) {
      return error.detail
    }
    if (error.status === 422 && Array.isArray(error.detail)) {
      return CATEGORY_NAME_INVALID
    }
  }
  return GENERIC_ERROR
}
