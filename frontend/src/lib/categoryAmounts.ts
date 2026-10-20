import type { CategoryAmountRead, CategoryKind, CategoryTreeNode } from '../api/types.ts'

/** Where a monthly amount goes: a subcategory row, or a category row without subcategories. */
export type AmountTarget = {
  kind: CategoryKind
  categoryId: number
  /** `null` for a category without subcategories. */
  subcategoryId: number | null
  /** Read-only context for the dialog, e.g. `Housing / Rent` or `Other`. */
  label: string
  /** The amount already set on this row, if any (edit). */
  amount: CategoryAmountRead | null
}

/** The amount set on exactly this category (`subcategoryId` null) or subcategory, if any. */
export function findAmount(
  amounts: readonly CategoryAmountRead[],
  categoryId: number,
  subcategoryId: number | null,
) {
  return (
    amounts.find((a) => a.category_id === categoryId && a.subcategory_id === subcategoryId) ?? null
  )
}

function toCents(amount: string) {
  const [whole, fraction = ''] = amount.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
}

function fromCents(cents: bigint) {
  const whole = cents / 100n
  const fraction = (cents % 100n).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

/**
 * Monthly amount shown on a category row: its own plus its subcategories' amounts, as a decimal
 * string (summed in `bigint` cents, never as floats), or `null` when none of them has an amount.
 */
export function categoryMonthlyTotal(
  category: CategoryTreeNode,
  amounts: readonly CategoryAmountRead[],
) {
  const ids = new Set(category.subcategories.map((sub) => sub.id))
  const rows = amounts.filter(
    (a) =>
      a.category_id === category.id && (a.subcategory_id === null || ids.has(a.subcategory_id)),
  )
  if (rows.length === 0) {
    return null
  }
  return fromCents(rows.reduce((sum, row) => sum + toCents(row.amount), 0n))
}
