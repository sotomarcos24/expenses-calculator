import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '../lib/format.ts'
import { SCENARIOS, type ChartRow } from '../lib/scenarios.ts'

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

type Props = {
  rows: ChartRow[]
  /** Axis title, e.g. "Year" or "Age". */
  xLabel: string
  /** Accessible name of the legend list. */
  label: string
}

/**
 * Three scenario lines over `rows`, coloured with the scenario theme tokens. The SVG is
 * decorative; the legend below names the lines and the cards / tables carry the numbers.
 * Chart values are `number`s for drawing only; the displayed numbers come from the API strings.
 */
export function ScenarioChart({ rows, xLabel, label }: Props) {
  return (
    <div className="mb-6">
      <div aria-hidden="true" className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
              label={{
                value: xLabel,
                position: 'insideBottom',
                offset: -10,
                fill: 'var(--color-muted)',
                fontSize: 12,
              }}
            />
            <YAxis
              width={72}
              tickFormatter={(value: number) => compactCurrency.format(value)}
              tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              labelFormatter={(value) => `${xLabel} ${value}`}
            />
            {SCENARIOS.map((scenario) => (
              <Line
                key={scenario.key}
                dataKey={scenario.key}
                name={scenario.label}
                type="monotone"
                stroke={scenario.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul aria-label={label} className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
        {SCENARIOS.map((scenario) => (
          <li key={scenario.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1 w-6 rounded-full"
              style={{ backgroundColor: scenario.color }}
            />
            {scenario.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
