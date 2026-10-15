import { Link } from 'react-router'
import type { DashboardInvestments } from '../api/types.ts'
import { formatCurrency } from '../lib/format.ts'
import { investmentTypeLabel } from '../lib/investmentTypes.ts'
import { GainLoss } from './GainLoss.tsx'
import { PieWithList } from './ExpensePie.tsx'

/**
 * Investments snapshot for the dashboard: totals as returned by the API (same figures and
 * formatting as the Investments page) and a pie of the current value by type. It does not depend
 * on the period selector.
 */
export function InvestmentsBlock({ investments }: { investments: DashboardInvestments }) {
  const held = investments.by_type.length > 0
  // Zero-value types stay out of the chart (a zero slice cannot be drawn).
  const slices = investments.by_type
    .filter((entry) => Number(entry.current_value) > 0)
    .map((entry) => ({
      key: entry.type,
      name: investmentTypeLabel(entry.type),
      total: entry.current_value,
    }))

  return (
    <section
      aria-labelledby="dashboard-investments-heading"
      className="mt-6 rounded-xl border border-border p-4"
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="dashboard-investments-heading" className="text-lg font-semibold">
          Investments
        </h2>
        <Link to="/investments" className="text-sm font-medium text-primary underline">
          View investments
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">All investments, current values</p>
      {held ? (
        <>
          <dl className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">Total invested</dt>
              <dd className="mt-1 text-lg font-semibold break-words text-foreground tabular-nums">
                {formatCurrency(investments.total_invested)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Current value</dt>
              <dd className="mt-1 text-lg font-semibold break-words text-foreground tabular-nums">
                {formatCurrency(investments.current_value)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Gain/loss</dt>
              <dd className="mt-1 text-lg break-words">
                <GainLoss gain={investments.gain} gainPct={investments.gain_pct} layout="inline" />
              </dd>
            </div>
          </dl>
          {slices.length > 0 ? <PieWithList label="Investments by type" slices={slices} /> : null}
        </>
      ) : (
        <p className="text-sm text-muted">
          No investments yet.{' '}
          <Link to="/investments" className="font-medium text-primary underline">
            Add an investment
          </Link>
        </p>
      )}
    </section>
  )
}
