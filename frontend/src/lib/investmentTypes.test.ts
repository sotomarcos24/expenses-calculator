import { describe, expect, it } from 'vitest'
import { INVESTMENT_TYPES, investmentTypeLabel } from './investmentTypes.ts'

describe('investmentTypeLabel', () => {
  it('labels the seven investment types', () => {
    expect(INVESTMENT_TYPES.map((type) => [type, investmentTypeLabel(type)])).toEqual([
      ['stock', 'Stock'],
      ['fund', 'Fund'],
      ['etf', 'ETF'],
      ['crypto', 'Crypto'],
      ['deposit', 'Deposit'],
      ['real_estate', 'Real estate'],
      ['other', 'Other'],
    ])
  })
})
