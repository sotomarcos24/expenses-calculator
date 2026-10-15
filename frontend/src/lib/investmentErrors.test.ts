import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'
import { investmentErrorMessage } from './investmentErrors.ts'

describe('investmentErrorMessage', () => {
  it('returns a string detail verbatim (404, string 422)', () => {
    expect(investmentErrorMessage(new ApiError(404, 'Investment not found'))).toBe(
      'Investment not found',
    )
    expect(investmentErrorMessage(new ApiError(422, 'Some domain rule'))).toBe('Some domain rule')
  })

  it('maps a 422 validation list to a fixed message', () => {
    const detail = [{ loc: ['body', 'current_value'], msg: 'bad', type: 'decimal_parsing' }]
    expect(investmentErrorMessage(new ApiError(422, detail))).toBe(
      'Some fields are invalid. Please check the form.',
    )
  })

  it('falls back to the generic message', () => {
    expect(investmentErrorMessage(new ApiError(500, null))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(new ApiError(500, 'Internal Server Error'))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(new ApiError(409, 'Conflict'))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(new ApiError(404, null))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(new ApiError(422, ''))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_ERROR)
    expect(investmentErrorMessage(undefined)).toBe(GENERIC_ERROR)
  })
})
