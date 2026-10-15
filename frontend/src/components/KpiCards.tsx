import type { Dashboard } from '../api/types.ts'
import { decimalSign, formatCurrency, formatPercent, formatSignedCurrency } from '../lib/format.ts'

/** Four KPI cards with the values exactly as the API returned them. */
export function KpiCards({ data }: { data: Dashboard }) {
  const sign = decimalSign(data.savings)
  const savingsTone = sign > 0 ? 'text-gain' : sign < 0 ? 'text-loss' : 'text-foreground'
  const cards = [
    { label: 'Income', value: formatCurrency(data.income_total), tone: 'text-foreground' },
    { label: 'Expenses', value: formatCurrency(data.expense_total), tone: 'text-foreground' },
    { label: 'Savings', value: formatSignedCurrency(data.savings), tone: savingsTone },
    { label: 'Savings rate', value: formatPercent(data.savings_rate), tone: 'text-foreground' },
  ]
  return (
    <section aria-label="Key figures" className="mb-6">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{card.label}</dt>
            <dd className={`mt-1 text-xl font-semibold break-words tabular-nums ${card.tone}`}>
              {card.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
