import type { InvestmentType } from '../api/types.ts'

/** Display label of each investment type (docs/plan.md §4.5). */
export const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  stock: 'Stock',
  fund: 'Fund',
  etf: 'ETF',
  crypto: 'Crypto',
  deposit: 'Deposit',
  real_estate: 'Real estate',
  other: 'Other',
}

/** Every investment type, in display order (e.g. for a select). */
export const INVESTMENT_TYPES = Object.keys(INVESTMENT_TYPE_LABELS) as InvestmentType[]

/** "real_estate" → "Real estate". */
export function investmentTypeLabel(type: InvestmentType): string {
  return INVESTMENT_TYPE_LABELS[type]
}
