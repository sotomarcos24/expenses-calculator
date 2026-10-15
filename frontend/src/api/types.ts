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
export type TransactionRead = Schemas['TransactionRead']
export type TransactionCreate = Schemas['TransactionCreate']
export type TransactionUpdate = Schemas['TransactionUpdate']
export type TransactionPage = Schemas['TransactionPage']
export type InvestmentType = Schemas['InvestmentType']
export type InvestmentRead = Schemas['InvestmentRead']
export type InvestmentCreate = Schemas['InvestmentCreate']
export type InvestmentUpdate = Schemas['InvestmentUpdate']
export type InvestmentList = Schemas['InvestmentList']
export type PortfolioTotals = Schemas['PortfolioTotals']
