import type { CategoryKind } from '../api/types.ts'

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
// Dates are built in UTC and formatted in UTC, so the day never shifts with the time zone.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Money arrives from the API as a decimal string ("1234.50"); it is only converted for display. */
export function formatCurrency(amount: string | number): string {
  return currencyFormatter.format(Number(amount))
}

/** Ratio to percentage: 0.153 → "15.3%". `null` (e.g. savings rate with no income) → "—". */
export function formatPercent(ratio: string | number | null): string {
  return ratio === null ? '—' : percentFormatter.format(Number(ratio))
}

/** Calendar date from the API (`YYYY-MM-DD`) for display: "2026-10-14" → "Oct 14, 2026". */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)))
}

/** Transaction amount with its direction: income "+$2,400.00", expense "−$12.30" (U+2212). */
export function formatSignedAmount(type: CategoryKind, amount: string): string {
  return `${type === 'income' ? '+' : '−'}${formatCurrency(amount)}`
}

/** Category of a transaction for display: "Food" or, with a subcategory, "Food › Groceries". */
export function formatCategoryLabel({
  category_name,
  subcategory_name,
}: {
  category_name: string
  subcategory_name: string | null
}): string {
  return subcategory_name === null ? category_name : `${category_name} › ${subcategory_name}`
}
