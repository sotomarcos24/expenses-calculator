import { describe, expect, it } from 'vitest'
import {
  EMAIL_INVALID,
  EMAIL_REQUIRED,
  EMAIL_TOO_LONG,
  loginSchema,
  PASSWORD_REQUIRED,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  registerSchema,
} from './authSchemas.ts'

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message
}

describe('registerSchema', () => {
  const valid = { email: 'user@example.com', password: '12345678' }

  it('accepts a valid email and an 8-character password', () => {
    expect(registerSchema.parse(valid)).toEqual(valid)
  })

  it('trims the email but keeps its case and does not trim the password', () => {
    expect(registerSchema.parse({ email: '  User@Example.com  ', password: ' 1234567 ' })).toEqual({
      email: 'User@Example.com',
      password: ' 1234567 ',
    })
  })

  it.each([
    [{ ...valid, email: '' }, EMAIL_REQUIRED],
    [{ ...valid, email: '   ' }, EMAIL_REQUIRED],
    [{ ...valid, email: 'not-an-email' }, EMAIL_INVALID],
    [{ ...valid, email: `${'a'.repeat(244)}@example.com` }, EMAIL_TOO_LONG],
    [{ ...valid, password: '' }, PASSWORD_REQUIRED],
    [{ ...valid, password: '1234567' }, PASSWORD_TOO_SHORT],
    [{ ...valid, password: 'a'.repeat(129) }, PASSWORD_TOO_LONG],
  ])('rejects %j with "%s"', (input, message) => {
    expect(firstError(registerSchema.safeParse(input))).toBe(message)
  })

  it('accepts a 128-character password', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(128) }).success).toBe(true)
  })
})

describe('loginSchema', () => {
  it('has no minimum password length', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true)
  })

  it.each([
    [{ email: '', password: 'x' }, EMAIL_REQUIRED],
    [{ email: 'nope', password: 'x' }, EMAIL_INVALID],
    [{ email: 'user@example.com', password: '' }, PASSWORD_REQUIRED],
    [{ email: 'user@example.com', password: 'a'.repeat(129) }, PASSWORD_TOO_LONG],
  ])('rejects %j with "%s"', (input, message) => {
    expect(firstError(loginSchema.safeParse(input))).toBe(message)
  })
})
