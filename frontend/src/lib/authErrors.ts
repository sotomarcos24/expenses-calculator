import { ApiError } from '../api/client.ts'

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

export type AuthField = 'email' | 'password'

type FieldMessages = Record<AuthField, string>

/**
 * Maps a FastAPI 422 `detail` list to one friendly message per form field. Returns `null` when
 * the error is not a 422, or when any item does not point at `body.email` / `body.password`
 * (the caller then shows a generic form-level message instead).
 */
export function fieldErrorsFrom422(
  error: unknown,
  messages: FieldMessages,
): Partial<FieldMessages> | null {
  if (!(error instanceof ApiError) || error.status !== 422 || !Array.isArray(error.detail)) {
    return null
  }
  const fieldErrors: Partial<FieldMessages> = {}
  for (const item of error.detail as unknown[]) {
    const loc = (item as { loc?: unknown } | null)?.loc
    const field: unknown =
      Array.isArray(loc) && loc.length === 2 && loc[0] === 'body' ? loc[1] : undefined
    if (field !== 'email' && field !== 'password') {
      return null
    }
    fieldErrors[field] = messages[field]
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null
}
