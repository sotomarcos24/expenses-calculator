/** Convenience aliases for the generated API schema. Regenerate it with `npm run gen:api`. */
import type { components } from './schema.d.ts'

type Schemas = components['schemas']

export type UserRead = Schemas['UserRead']
export type RegisterRequest = Schemas['RegisterRequest']
export type LoginRequest = Schemas['LoginRequest']
