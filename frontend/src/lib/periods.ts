/**
 * Period presets shared by the Transactions filters (M4) and the Dashboard (M6). Dates are local
 * calendar dates as `YYYY-MM-DD`; never derive them from `toISOString()` (UTC, can be a day off).
 */
export type PeriodPreset = 'this-month' | 'this-year' | 'all-time' | 'custom'

/** Inclusive date range; a missing bound is open-ended. */
export type DateRange = { from?: string; to?: string }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** `(2026, 10, 14)` → `"2026-10-14"` (month is 1-based). */
function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

/** The local calendar date of `date` as `YYYY-MM-DD`. */
export function toLocalIso(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Today's local calendar date as `YYYY-MM-DD` (e.g. the default date of a new transaction). */
export function todayLocalIso(): string {
  return toLocalIso(new Date())
}

/**
 * The range of `preset` relative to `today` (local date). `this-month` ends on the last day of the
 * month, not today, because future-dated transactions are allowed. `all-time` and `custom` have no
 * bounds (a custom range comes from the user's inputs).
 */
export function periodRange(preset: PeriodPreset, today: Date = new Date()): DateRange {
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  switch (preset) {
    case 'this-month': {
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(year, month, 0).getDate()
      return { from: isoDate(year, month, 1), to: isoDate(year, month, lastDay) }
    }
    case 'this-year':
      return { from: isoDate(year, 1, 1), to: isoDate(year, 12, 31) }
    case 'all-time':
    case 'custom':
      return {}
  }
}
