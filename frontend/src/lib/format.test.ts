import { describe, expect, it } from 'vitest'
import { formatCurrency, formatPercent } from './format.ts'

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
