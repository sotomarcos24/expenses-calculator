import type { InvestmentRead } from '../api/types.ts'
import { formatCurrency, formatDate } from '../lib/format.ts'
import { investmentTypeLabel } from '../lib/investmentTypes.ts'
import { GainLoss } from './GainLoss.tsx'

const HEADER_CLASS = 'px-3 py-2 text-left font-medium text-muted'
const CELL_CLASS = 'px-3 py-2 align-top'
const MONEY_CELL_CLASS = `${CELL_CLASS} text-right whitespace-nowrap tabular-nums text-foreground`

type InvestmentTableProps = {
  investments: InvestmentRead[]
}

/** Investments table, in the order returned by the API (never re-sorted). Read-only. */
export function InvestmentTable({ investments }: InvestmentTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table aria-label="Investments" className="min-w-full text-sm">
        <thead className="border-b border-border bg-surface">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Name
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Type
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Platform
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Invested
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Current value
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Gain/loss
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Last update
            </th>
          </tr>
        </thead>
        <tbody>
          {investments.map((investment) => (
            <tr key={investment.id} className="border-b border-border last:border-b-0">
              <td className={`${CELL_CLASS} max-w-60 min-w-40 break-words text-foreground`}>
                {investment.name}
              </td>
              <td className={`${CELL_CLASS} whitespace-nowrap text-foreground`}>
                {investmentTypeLabel(investment.type)}
              </td>
              <td className={`${CELL_CLASS} max-w-48 min-w-28 break-words text-foreground`}>
                {investment.platform ?? '—'}
              </td>
              <td className={MONEY_CELL_CLASS}>{formatCurrency(investment.amount_invested)}</td>
              <td className={MONEY_CELL_CLASS}>{formatCurrency(investment.current_value)}</td>
              <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                <GainLoss gain={investment.gain} gainPct={investment.gain_pct} />
              </td>
              <td className={`${CELL_CLASS} whitespace-nowrap text-foreground`}>
                {formatDate(investment.value_updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
