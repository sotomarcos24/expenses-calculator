import { afterEach, describe, expect, it, vi } from 'vitest'
import { periodRange, toLocalIso, todayLocalIso } from './periods.ts'

describe('periodRange', () => {
  it('this month runs from the first to the last day of the month', () => {
    expect(periodRange('this-month', new Date(2026, 9, 14))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })

  it('handles February in a leap year', () => {
    expect(periodRange('this-month', new Date(2028, 1, 10))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('handles the last day of the year', () => {
    expect(periodRange('this-month', new Date(2026, 11, 31))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
  })

  it('this year covers the whole calendar year', () => {
    expect(periodRange('this-year', new Date(2026, 9, 14))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('all time and custom have no bounds', () => {
    expect(periodRange('all-time', new Date(2026, 9, 14))).toEqual({})
    expect(periodRange('custom', new Date(2026, 9, 14))).toEqual({})
  })
})

describe('todayLocalIso', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the local calendar date', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Late in the local evening: in UTC (toISOString) this may already be the next day.
    vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 30))
    expect(todayLocalIso()).toBe('2026-10-14')
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 30))
    expect(todayLocalIso()).toBe('2026-01-01')
  })

  it('pads months and days', () => {
    expect(toLocalIso(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})
