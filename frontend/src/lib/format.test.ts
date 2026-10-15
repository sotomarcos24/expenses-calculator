import { describe, expect, it } from 'vitest'
import {
  formatCategoryLabel,
  formatCurrency,
  formatDate,
  formatPercent,
  decimalSign,
  formatSignedAmount,
  formatSignedCurrency,
  formatSignedPercent,
} from './format.ts'

describe('formatCurrency', () => {
  it('formats decimal strings as USD', () => {
    expect(formatCurrency('1234.5')).toBe('$1,234.50')
  })

  it('formats negative amounts', () => {
    expect(formatCurrency(-20)).toBe('-$20.00')
  })
})

describe('formatPercent', () => {
  it('formats ratios with one decimal', () => {
    expect(formatPercent('0.153')).toBe('15.3%')
  })

  it('shows a dash for null', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDate', () => {
  it('formats ISO dates as short month, day and year', () => {
    expect(formatDate('2026-10-14')).toBe('Oct 14, 2026')
  })

  it('never shifts the day with the time zone', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})

describe('formatSignedAmount', () => {
  it('prefixes income with a plus sign', () => {
    expect(formatSignedAmount('income', '2400.00')).toBe('+$2,400.00')
  })

  it('prefixes expenses with a minus sign (U+2212)', () => {
    expect(formatSignedAmount('expense', '12.30')).toBe('−$12.30')
  })

  it('formats the largest amounts', () => {
    expect(formatSignedAmount('expense', '9999999999.99')).toBe('−$9,999,999,999.99')
  })
})

describe('formatCategoryLabel', () => {
  it('shows the category alone or with its subcategory', () => {
    expect(formatCategoryLabel({ category_name: 'Salary', subcategory_name: null })).toBe('Salary')
    expect(formatCategoryLabel({ category_name: 'Food', subcategory_name: 'Groceries' })).toBe(
      'Food › Groceries',
    )
  })
})

describe('decimalSign', () => {
  it('reads the sign of a decimal string', () => {
    expect(decimalSign('150.00')).toBe(1)
    expect(decimalSign('-50.00')).toBe(-1)
    expect(decimalSign('0.00')).toBe(0)
    expect(decimalSign('-0.00')).toBe(0)
    expect(decimalSign('0.0001')).toBe(1)
  })
})

describe('formatSignedCurrency', () => {
  it('prefixes gains with a plus sign', () => {
    expect(formatSignedCurrency('150.00')).toBe('+$150.00')
  })

  it('prefixes losses with a single minus sign (U+2212)', () => {
    expect(formatSignedCurrency('-50.00')).toBe('−$50.00')
    expect(formatSignedCurrency('-50.00')).not.toContain('-')
  })

  it('shows zero without a sign', () => {
    expect(formatSignedCurrency('0.00')).toBe('$0.00')
    expect(formatSignedCurrency('-0.00')).toBe('$0.00')
  })

  it('formats large amounts with grouping', () => {
    expect(formatSignedCurrency('-1234567.89')).toBe('−$1,234,567.89')
  })
})

describe('formatSignedPercent', () => {
  it('formats positive ratios with a plus sign and one decimal', () => {
    expect(formatSignedPercent('0.1500')).toBe('+15.0%')
    expect(formatSignedPercent('0.0667')).toBe('+6.7%')
  })

  it('formats negative ratios with a single minus sign (U+2212)', () => {
    expect(formatSignedPercent('-0.1000')).toBe('−10.0%')
    expect(formatSignedPercent('-0.1000')).not.toContain('-')
  })

  it('shows zero without a sign', () => {
    expect(formatSignedPercent('0.0000')).toBe('0.0%')
  })

  it('shows a dash for null', () => {
    expect(formatSignedPercent(null)).toBe('—')
  })
})
