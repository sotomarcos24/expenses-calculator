import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import { fieldErrorsFrom422, isRateLimited } from './authErrors.ts'

const messages = { email: 'Bad email', password: 'Bad password' }
const item = (loc: unknown[]) => ({ loc, msg: 'raw pydantic', type: 'value_error' })

describe('fieldErrorsFrom422', () => {
  it('maps body.email and body.password to the friendly messages', () => {
    const error = new ApiError(422, [item(['body', 'email']), item(['body', 'password'])])
    expect(fieldErrorsFrom422(error, messages)).toEqual(messages)
  })

  it.each([
    ['another status', new ApiError(400, [item(['body', 'email'])])],
    ['a non-list detail', new ApiError(422, 'nope')],
    ['an empty list', new ApiError(422, [])],
    ['an unknown location', new ApiError(422, [item(['body', 'email']), item(['body'])])],
    ['a non-ApiError', new TypeError('Failed to fetch')],
  ])('returns null for %s', (_label, error) => {
    expect(fieldErrorsFrom422(error, messages)).toBeNull()
  })
})

describe('isRateLimited', () => {
  it('is true only for a 429 ApiError', () => {
    expect(isRateLimited(new ApiError(429, 'x'))).toBe(true)
    expect(isRateLimited(new ApiError(401, 'x'))).toBe(false)
    expect(isRateLimited(new TypeError('x'))).toBe(false)
  })
})
