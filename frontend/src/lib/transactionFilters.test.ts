import { describe, expect, it } from 'vitest'
import {
  CLEARED_FILTERS,
  DEFAULT_FILTERS,
  filtersToParams,
  hasActiveFilters,
  isRangeInvalid,
} from './transactionFilters.ts'

const TODAY = new Date(2026, 9, 14)

describe('filtersToParams', () => {
  it('maps the default filters to this month', () => {
    expect(filtersToParams(DEFAULT_FILTERS, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })

  it('sends nothing for the cleared filters', () => {
    expect(filtersToParams(CLEARED_FILTERS, TODAY)).toEqual({})
  })

  it('maps every filter', () => {
    expect(
      filtersToParams(
        {
          ...DEFAULT_FILTERS,
          preset: 'this-year',
          type: 'expense',
          categoryId: 3,
          subcategoryId: 4,
        },
        TODAY,
      ),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      type: 'expense',
      category_id: 3,
      subcategory_id: 4,
    })
  })

  it('omits open custom bounds', () => {
    expect(
      filtersToParams({ ...DEFAULT_FILTERS, preset: 'custom', from: '2026-03-01', to: '' }, TODAY),
    ).toEqual({ from: '2026-03-01' })
  })

  it('returns null for an invalid custom range', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      preset: 'custom' as const,
      from: '2026-03-02',
      to: '2026-03-01',
    }
    expect(isRangeInvalid(filters)).toBe(true)
    expect(filtersToParams(filters, TODAY)).toBeNull()
  })

  it('accepts a single-day custom range', () => {
    const filters = {
      ...DEFAULT_FILTERS,
      preset: 'custom' as const,
      from: '2026-03-01',
      to: '2026-03-01',
    }
    expect(isRangeInvalid(filters)).toBe(false)
  })
})

describe('hasActiveFilters', () => {
  it('is true for the default This month', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(true)
  })

  it('is false only for All time with every filter on All', () => {
    expect(hasActiveFilters(CLEARED_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...CLEARED_FILTERS, type: 'income' })).toBe(true)
  })
})
