import type { ReactNode } from 'react'
import type {
  AccumulationRequest,
  AccumulationResponse,
  Frequency,
  GoalResponse,
  WithdrawalRequest,
  WithdrawalResponse,
} from '../api/types.ts'
import { formatCurrency, formatPercent } from '../lib/format.ts'
import { BasisToggle, type Basis } from './BasisToggle.tsx'
import { SCENARIOS, type ChartRow, type ScenarioKey } from '../lib/scenarios.ts'
import { ScenarioChart } from './ScenarioChart.tsx'

const FREQUENCY_UNIT: Record<Frequency, string> = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

function ScenarioCards({ children }: { children: (key: ScenarioKey) => ReactNode }) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      {SCENARIOS.map((scenario) => (
        <article
          key={scenario.key}
          aria-label={`${scenario.label} scenario`}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <span
              aria-hidden="true"
              className="size-3 rounded-full"
              style={{ backgroundColor: scenario.color }}
            />
            {scenario.label}
          </h3>
          <dl className="flex flex-col gap-3">{children(scenario.key)}</dl>
        </article>
      ))}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-semibold break-words tabular-nums">{children}</dd>
    </div>
  )
}

/** Years of expenses covered: "—" when there are no expenses to compare with. */
function formatYears(value: string | null): string {
  if (value === null) {
    return '—'
  }
  const years = Number(value)
  return `${years.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${years === 1 ? 'year' : 'years'}`
}

function ResultsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Merges per-scenario series into chart rows keyed by `x` (a scenario may stop early). */
function toRows<T>(
  series: Record<ScenarioKey, T[]>,
  xOf: (point: T) => number,
  valueOf: (point: T) => string,
): ChartRow[] {
  const rows = new Map<number, ChartRow>()
  for (const { key } of SCENARIOS) {
    for (const point of series[key]) {
      const x = xOf(point)
      const row = rows.get(x) ?? { x }
      row[key] = Number(valueOf(point))
      rows.set(x, row)
    }
  }
  return [...rows.values()].sort((a, b) => a.x - b.x)
}

type BasisProps = { basis: Basis; onBasisChange: (basis: Basis) => void }

export function AccumulationResults({
  data,
  request,
  basis,
  onBasisChange,
}: BasisProps & { data: AccumulationResponse; request: AccumulationRequest }) {
  const rows = toRows(
    {
      pessimistic: data.pessimistic.points,
      base: data.base.points,
      optimistic: data.optimistic.points,
    },
    (point) => point.year,
    (point) => point[basis],
  )
  return (
    <ResultsSection title="Accumulation results">
      <BasisToggle value={basis} onChange={onBasisChange} />
      <ScenarioChart rows={rows} xLabel="Year" label="Chart legend" />
      <ScenarioCards>
        {(key) => {
          const result = data[key]
          const last = result.points[result.points.length - 1]
          return (
            <>
              <Stat label={`Final value (${basis === 'real' ? "today's dollars" : 'nominal'})`}>
                {formatCurrency(last[basis])}
              </Stat>
              <Stat label="Years of expenses covered">
                {formatYears(result.years_of_expenses_covered)}
              </Stat>
              <Stat label="Total contributed">{formatCurrency(last.total_contributed)}</Stat>
            </>
          )
        }}
      </ScenarioCards>
      <div className="overflow-x-auto">
        <table className="w-full min-w-96 text-left text-sm">
          <caption className="mb-2 text-left text-sm text-muted">
            Base scenario by year, starting age {request.current_age}
          </caption>
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="py-2 pr-4 font-medium">
                Year
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Age
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Nominal
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Today&rsquo;s dollars
              </th>
            </tr>
          </thead>
          <tbody>
            {data.base.points.map((point) => (
              <tr key={point.year} className="border-b border-border">
                <td className="py-2 pr-4">{point.year}</td>
                <td className="py-2 pr-4">{point.age}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatCurrency(point.nominal)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(point.real)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ResultsSection>
  )
}

export function GoalResults({ data, frequency }: { data: GoalResponse; frequency: Frequency }) {
  const unit = FREQUENCY_UNIT[frequency]
  return (
    <ResultsSection title="Goal results">
      <ScenarioCards>
        {(key) => {
          const result = data[key]
          return (
            <>
              <Stat label={`Required contribution per ${unit}`}>
                {formatCurrency(result.required_contribution)}
              </Stat>
              {result.already_reached && (
                <p className="text-sm text-gain">
                  Already reached: your starting amount covers this goal
                </p>
              )}
              <Stat label="Total contributed">{formatCurrency(result.total_contributed)}</Stat>
              <Stat label="Target at the end date (nominal)">
                {formatCurrency(result.nominal_target)}
              </Stat>
            </>
          )
        }}
      </ScenarioCards>
    </ResultsSection>
  )
}

export function WithdrawalResults({
  data,
  request,
  basis,
  onBasisChange,
}: BasisProps & { data: WithdrawalResponse; request: WithdrawalRequest }) {
  const rows = toRows(
    {
      pessimistic: data.pessimistic.series,
      base: data.base.series,
      optimistic: data.optimistic.series,
    },
    (point) => point.age,
    (point) => point[basis],
  )
  return (
    <ResultsSection title="Withdrawal results">
      <BasisToggle value={basis} onChange={onBasisChange} />
      <ScenarioChart rows={rows} xLabel="Age" label="Chart legend" />
      <ScenarioCards>
        {(key) => {
          const result = data[key]
          const balance =
            basis === 'real'
              ? result.balance_at_retirement_real
              : result.balance_at_retirement_nominal
          return (
            <>
              <Stat
                label={`Balance at retirement (${basis === 'real' ? "today's dollars" : 'nominal'})`}
              >
                {formatCurrency(balance)}
              </Stat>
              <Stat label="Monthly income (today's dollars)">
                {formatCurrency(result.monthly_income)}
              </Stat>
              <Stat label="Expenses covered">{formatPercent(result.expenses_coverage_pct)}</Stat>
              <p
                className={`text-sm font-medium ${result.lasts_until_end ? 'text-gain' : 'text-loss'}`}
              >
                {result.lasts_until_end
                  ? `Lasts until ${request.end_age}`
                  : `Runs out at age ${result.depletion_age}`}
              </p>
            </>
          )
        }}
      </ScenarioCards>
    </ResultsSection>
  )
}
