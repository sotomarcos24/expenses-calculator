import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { GENERIC_ERROR } from './authErrors.ts'
import { categoryErrorMessage } from './categoryErrors.ts'

describe('categoryErrorMessage', () => {
  it('returns a string detail verbatim (409, 404, string 422)', () => {
    const duplicate = 'A category with this name already exists at this level'
    expect(categoryErrorMessage(new ApiError(409, duplicate))).toBe(duplicate)
    expect(categoryErrorMessage(new ApiError(404, 'Category not found'))).toBe('Category not found')
    const parent = 'The parent must be a top-level category of the same kind'
    expect(categoryErrorMessage(new ApiError(422, parent))).toBe(parent)
  })

  it('maps a 422 validation list to a fixed message', () => {
    const detail = [{ loc: ['body', 'name'], msg: 'too long', type: 'string_too_long' }]
    expect(categoryErrorMessage(new ApiError(422, detail))).toBe('Name must be 1–100 characters')
  })

  it('falls back to the generic message', () => {
    expect(GENERIC_ERROR).toBe('Something went wrong. Please try again.')
    expect(categoryErrorMessage(new ApiError(500, null))).toBe(GENERIC_ERROR)
    expect(categoryErrorMessage(new ApiError(500, 'Internal Server Error'))).toBe(GENERIC_ERROR)
    expect(categoryErrorMessage(new ApiError(400, [{ msg: 'x' }]))).toBe(GENERIC_ERROR)
    expect(categoryErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_ERROR)
    expect(categoryErrorMessage(undefined)).toBe(GENERIC_ERROR)
  })
})
