import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'
import { transactionErrorMessage } from './transactionErrors.ts'

describe('transactionErrorMessage', () => {
  it('returns a string detail verbatim (404, string 422)', () => {
    expect(transactionErrorMessage(new ApiError(404, 'Category not found'))).toBe(
      'Category not found',
    )
    expect(transactionErrorMessage(new ApiError(404, 'Transaction not found'))).toBe(
      'Transaction not found',
    )
    const kind = 'The category must be of the same kind as the transaction'
    expect(transactionErrorMessage(new ApiError(422, kind))).toBe(kind)
  })

  it('maps a 422 validation list to a fixed message', () => {
    const detail = [{ loc: ['body', 'amount'], msg: 'bad', type: 'decimal_parsing' }]
    expect(transactionErrorMessage(new ApiError(422, detail))).toBe(
      'Some fields are invalid. Please check the form.',
    )
  })

  it('falls back to the generic message', () => {
    expect(transactionErrorMessage(new ApiError(500, null))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(new ApiError(500, 'Internal Server Error'))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(new ApiError(409, 'Conflict'))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(new ApiError(404, null))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(new ApiError(422, ''))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_ERROR)
    expect(transactionErrorMessage(undefined)).toBe(GENERIC_ERROR)
  })
})
