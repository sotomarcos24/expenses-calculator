import { useId } from 'react'
import type { DashboardPeriod, DashboardPreset } from '../lib/dashboardPeriod.ts'
import { isCustomRangeReversed } from '../lib/dashboardPeriod.ts'

const OPTIONS: { value: DashboardPreset; label: string }[] = [
  { value: 'month', label: 'Current month' },
  { value: 'year', label: 'Current year' },
  { value: 'custom', label: 'Custom range' },
]

const CONTROL_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent'

type PeriodSelectorProps = {
  value: DashboardPeriod
  onChange: (next: DashboardPeriod) => void
}

/** Dashboard period: current month, current year to date, or a custom range of two dates. */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const id = useId()
  const reversed = isCustomRangeReversed(value)
  const errorId = `${id}-error`
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <label htmlFor={`${id}-period`} className="mb-1 block text-sm font-medium">
            Period
          </label>
          <select
            id={`${id}-period`}
            className={CONTROL_CLASS}
            value={value.preset}
            onChange={(event) =>
              onChange({ ...value, preset: event.target.value as DashboardPreset })
            }
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {value.preset === 'custom' && (
          <>
            <div className="w-full sm:w-44">
              <label htmlFor={`${id}-from`} className="mb-1 block text-sm font-medium">
                From
              </label>
              <input
                id={`${id}-from`}
                type="date"
                className={CONTROL_CLASS}
                value={value.from}
                aria-invalid={reversed || undefined}
                aria-describedby={reversed ? errorId : undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
              />
            </div>
            <div className="w-full sm:w-44">
              <label htmlFor={`${id}-to`} className="mb-1 block text-sm font-medium">
                To
              </label>
              <input
                id={`${id}-to`}
                type="date"
                className={CONTROL_CLASS}
                value={value.to}
                aria-invalid={reversed || undefined}
                aria-describedby={reversed ? errorId : undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
              />
            </div>
          </>
        )}
      </div>
      {reversed && (
        <p id={errorId} role="alert" className="text-sm text-loss">
          From must be on or before To
        </p>
      )}
    </div>
  )
}
