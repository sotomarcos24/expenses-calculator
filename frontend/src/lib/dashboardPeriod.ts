import { periodRange, toLocalIso } from './periods.ts'

/** Period choices of the Dashboard. */
export type DashboardPreset = 'month' | 'year' | 'custom'

export type DashboardPeriod = {
  preset: DashboardPreset
  /** Custom range bounds as `YYYY-MM-DD`; an empty string means not chosen yet. */
  from: string
  to: string
}

export type DashboardRange = { from: string; to: string }

export const DEFAULT_PERIOD: DashboardPeriod = { preset: 'month', from: '', to: '' }

/** Whether both custom bounds are set and `from` is later than `to`. */
export function isCustomRangeReversed(period: DashboardPeriod): boolean {
  return (
    period.preset === 'custom' && period.from !== '' && period.to !== '' && period.from > period.to
  )
}

/**
 * The `from` / `to` the Dashboard sends for `period` (`today` is the local date), or `null` when
 * no request must be sent (custom range incomplete or reversed). The current month runs to its last
 * day; the current year is calendar year to date (Jan 1 through today).
 */
export function dashboardRange(
  period: DashboardPeriod,
  today: Date = new Date(),
): DashboardRange | null {
  switch (period.preset) {
    case 'month': {
      const { from, to } = periodRange('this-month', today)
      return { from: from!, to: to! }
    }
    case 'year':
      return {
        from: `${String(today.getFullYear()).padStart(4, '0')}-01-01`,
        to: toLocalIso(today),
      }
    case 'custom':
      if (period.from === '' || period.to === '' || isCustomRangeReversed(period)) {
        return null
      }
      return { from: period.from, to: period.to }
  }
}
