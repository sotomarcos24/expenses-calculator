/** Convenience aliases for the generated API schema. Regenerate it with `npm run gen:api`. */
import type { components } from './schema.d.ts'

type Schemas = components['schemas']

export type UserRead = Schemas['UserRead']
export type RegisterRequest = Schemas['RegisterRequest']
export type LoginRequest = Schemas['LoginRequest']
export type CategoryKind = Schemas['CategoryKind']
export type CategoryRead = Schemas['CategoryRead']
export type CategoryTreeNode = Schemas['CategoryTreeNode']
export type CategoryCreate = Schemas['CategoryCreate']
export type CategoryUpdate = Schemas['CategoryUpdate']
