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

/**
 * Sign of a decimal string from the API ("150.00" → 1, "-50.00" → -1, "0.00" / "-0.00" → 0),
 * read from the text itself so the value is never converted to a number.
 */
export function decimalSign(value: string): -1 | 0 | 1 {
  const trimmed = value.trim()
  if (/^[-+]?0*\.?0*$/.test(trimmed)) {
    return 0
  }
  return trimmed.startsWith('-') ? -1 : 1
}

/** Prefix for a signed display value: "+" for positive, "−" (U+2212) for negative, none for zero. */
function signPrefix(sign: -1 | 0 | 1): string {
  return sign > 0 ? '+' : sign < 0 ? '−' : ''
}

/**
 * Money that can be negative, with an explicit sign (gain/loss): "150.00" → "+$150.00",
 * "-50.00" → "−$50.00" (U+2212), "0.00" → "$0.00".
 */
export function formatSignedCurrency(amount: string): string {
  const formatted = formatCurrency(Math.abs(Number(amount)))
  // A tiny amount rounding to $0.00 is shown without a sign.
  const sign = formatted === formatCurrency(0) ? 0 : decimalSign(amount)
  return `${signPrefix(sign)}${formatted}`
}

/**
 * Ratio that can be negative, as a signed percentage (gain/loss %): "0.1500" → "+15.0%",
 * "-0.1000" → "−10.0%" (U+2212), "0.0000" → "0.0%", `null` (nothing invested) → "—".
 */
export function formatSignedPercent(ratio: string | null): string {
  if (ratio === null) {
    return '—'
  }
  const formatted = formatPercent(Math.abs(Number(ratio)))
  // A ratio rounding to 0.0% (e.g. "0.0001") is shown without a sign.
  const sign = formatted === formatPercent(0) ? 0 : decimalSign(ratio)
  return `${signPrefix(sign)}${formatted}`
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
