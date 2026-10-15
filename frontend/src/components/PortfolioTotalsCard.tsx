import type { PortfolioTotals } from '../api/types.ts'
import { formatCurrency } from '../lib/format.ts'
import { GainLoss } from './GainLoss.tsx'

/** Portfolio totals as returned by the API (never recomputed): invested, value and gain/loss. */
export function PortfolioTotalsCard({ totals }: { totals: PortfolioTotals }) {
  return (
    <section
      aria-labelledby="portfolio-totals-heading"
      className="mb-6 rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="portfolio-totals-heading" className="sr-only">
        Portfolio totals
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">Total invested</dt>
          <dd className="mt-1 text-lg font-semibold break-words text-foreground tabular-nums">
            {formatCurrency(totals.total_invested)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Current value</dt>
          <dd className="mt-1 text-lg font-semibold break-words text-foreground tabular-nums">
            {formatCurrency(totals.current_value)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Gain/loss</dt>
          <dd className="mt-1 text-lg break-words">
            <GainLoss gain={totals.gain} gainPct={totals.gain_pct} layout="inline" />
          </dd>
        </div>
      </dl>
    </section>
  )
}
