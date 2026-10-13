import { z } from 'zod'

/** Limits mirrored from the backend auth schemas (`backend/app/schemas/auth.py`). */
export const EMAIL_MAX_LENGTH = 255
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const EMAIL_REQUIRED = 'Email is required'
export const EMAIL_INVALID = 'Enter a valid email address'
export const EMAIL_TOO_LONG = `Email must be at most ${EMAIL_MAX_LENGTH} characters`
export const PASSWORD_REQUIRED = 'Password is required'
export const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
export const PASSWORD_TOO_LONG = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`

/** Trimmed before validation and submit; not lowercased (the backend normalises it). */
const email = z
  .string()
  .trim()
  .min(1, { error: EMAIL_REQUIRED })
  .max(EMAIL_MAX_LENGTH, { error: EMAIL_TOO_LONG })
  .pipe(z.email({ error: EMAIL_INVALID }))

/** Passwords are never trimmed. */
export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { error: PASSWORD_REQUIRED })
    .min(PASSWORD_MIN_LENGTH, { error: PASSWORD_TOO_SHORT })
    .max(PASSWORD_MAX_LENGTH, { error: PASSWORD_TOO_LONG }),
})

/** No minimum length at login; the maximum avoids a backend 422. */
export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { error: PASSWORD_REQUIRED })
    .max(PASSWORD_MAX_LENGTH, { error: PASSWORD_TOO_LONG }),
})

export type RegisterFormInput = z.input<typeof registerSchema>
export type RegisterFormValues = z.output<typeof registerSchema>
export type LoginFormInput = z.input<typeof loginSchema>
export type LoginFormValues = z.output<typeof loginSchema>
