const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Money arrives from the API as a decimal string ("1234.50"); it is only converted for display. */
export function formatCurrency(amount: string | number): string {
  return currencyFormatter.format(Number(amount))
}

/** Ratio to percentage: 0.153 → "15.3%". `null` (e.g. savings rate with no income) → "—". */
export function formatPercent(ratio: string | number | null): string {
  return ratio === null ? '—' : percentFormatter.format(Number(ratio))
}
