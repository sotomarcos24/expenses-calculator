import { describe, expectTypeOf, it } from 'vitest'

import type { LoginRequest, RegisterRequest, UserRead } from './types.ts'

// Checked by `tsc -b` (npm run typecheck): fails if the generated schema drifts.
describe('generated API type aliases', () => {
  it('UserRead exposes the public user fields only', () => {
    expectTypeOf<UserRead>().toEqualTypeOf<{ id: number; email: string; created_at: string }>()
    expectTypeOf<UserRead>().not.toHaveProperty('password_hash')
  })

  it('auth requests take an email and a password', () => {
    expectTypeOf<RegisterRequest>().toEqualTypeOf<{ email: string; password: string }>()
    expectTypeOf<LoginRequest>().toEqualTypeOf<{ email: string; password: string }>()
  })
})
