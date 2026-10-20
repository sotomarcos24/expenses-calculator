import { describe, expect, it } from 'vitest'
import type { CategoryAmountRead, CategoryTreeNode } from '../api/types.ts'
import { categoryMonthlyTotal, findAmount } from './categoryAmounts.ts'

const housing: CategoryTreeNode = {
  id: 1,
  name: 'Housing',
  kind: 'expense',
  parent_id: null,
  subcategories: [
    { id: 2, name: 'Rent', kind: 'expense', parent_id: 1 },
    { id: 3, name: 'Utilities', kind: 'expense', parent_id: 1 },
  ],
}

function amount(id: number, categoryId: number, subcategoryId: number | null, value: string) {
  return {
    id,
    category_id: categoryId,
    subcategory_id: subcategoryId,
    amount: value,
    note: null,
  } satisfies CategoryAmountRead
}

describe('categoryAmounts', () => {
  it('sums own and subcategory amounts exactly, in cents', () => {
    const amounts = [amount(1, 1, 2, '0.10'), amount(2, 1, 3, '0.20'), amount(3, 1, null, '1000')]
    expect(categoryMonthlyTotal(housing, amounts)).toBe('1000.30')
  })

  it('is null when nothing is set and ignores other categories', () => {
    expect(categoryMonthlyTotal(housing, [])).toBeNull()
    expect(categoryMonthlyTotal(housing, [amount(1, 9, null, '5.00')])).toBeNull()
  })

  it('finds the amount of exactly one row', () => {
    const amounts = [amount(1, 1, 2, '5.00'), amount(2, 1, null, '7.00')]
    expect(findAmount(amounts, 1, 2)?.id).toBe(1)
    expect(findAmount(amounts, 1, null)?.id).toBe(2)
    expect(findAmount(amounts, 1, 3)).toBeNull()
  })
})
