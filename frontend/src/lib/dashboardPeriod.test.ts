import { describe, expect, it } from 'vitest'
import { dashboardRange, isCustomRangeReversed } from './dashboardPeriod.ts'

const custom = (from: string, to: string) => ({ preset: 'custom' as const, from, to })

describe('dashboardRange', () => {
  const month = { preset: 'month' as const, from: '', to: '' }
  const year = { preset: 'year' as const, from: '', to: '' }

  it('current month runs from the first to the last day', () => {
    expect(dashboardRange(month, new Date(2026, 9, 14))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(dashboardRange(month, new Date(2026, 3, 30))).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
    })
  })

  it('handles February in common and leap years', () => {
    expect(dashboardRange(month, new Date(2027, 1, 3))?.to).toBe('2027-02-28')
    expect(dashboardRange(month, new Date(2028, 1, 3))?.to).toBe('2028-02-29')
  })

  it('handles December', () => {
    expect(dashboardRange(month, new Date(2026, 11, 31))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })

  it('current year is January 1 through today', () => {
    expect(dashboardRange(year, new Date(2026, 9, 14))).toEqual({
      from: '2026-01-01',
      to: '2026-10-14',
    })
    expect(dashboardRange(year, new Date(2028, 1, 29))).toEqual({
      from: '2028-01-01',
      to: '2028-02-29',
    })
  })

  it('custom range uses the chosen dates, one day included', () => {
    expect(dashboardRange(custom('2026-03-01', '2026-03-01'))).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    })
  })

  it('custom range is null when incomplete or reversed', () => {
    expect(dashboardRange(custom('', '2026-03-01'))).toBeNull()
    expect(dashboardRange(custom('2026-03-01', ''))).toBeNull()
    expect(dashboardRange(custom('2026-03-02', '2026-03-01'))).toBeNull()
  })
})

describe('isCustomRangeReversed', () => {
  it('is true only for a custom range with from after to', () => {
    expect(isCustomRangeReversed(custom('2026-03-02', '2026-03-01'))).toBe(true)
    expect(isCustomRangeReversed(custom('2026-03-01', '2026-03-01'))).toBe(false)
    expect(isCustomRangeReversed(custom('', '2026-03-01'))).toBe(false)
    expect(isCustomRangeReversed({ preset: 'month', from: '2026-03-02', to: '2026-03-01' })).toBe(
      false,
    )
  })
})
