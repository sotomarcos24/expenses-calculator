import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatPercent, formatSignedAmount } from './format.ts'

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
