import { useState } from 'react'
import { Link } from 'react-router'
import { Cell, Pie, PieChart } from 'recharts'
import type { CategoryTotal } from '../api/types.ts'
import { formatCurrency } from '../lib/format.ts'
import { Button } from './Button.tsx'

const CHART_COLORS = [1, 2, 3, 4, 5, 6, 7].map((n) => `var(--color-chart-${n})`)
const CHART_SIZE = 240

export type Slice = { key: string; name: string; total: string }

function colorAt(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length]
}

type SlicesProps = {
  slices: Slice[]
  /** Called with the index of the clicked slice or legend row; omitted when not clickable. */
  onSelect?: (index: number) => void
  label: string
}

/** A pie and a list (name and amount per row). Rows are buttons when `onSelect` is set. */
export function PieWithList({ slices, onSelect, label }: SlicesProps) {
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
      <div aria-hidden="true" className="shrink-0">
        <PieChart width={CHART_SIZE} height={CHART_SIZE}>
          <Pie
            data={slices.map((slice) => ({ name: slice.name, value: Number(slice.total) }))}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={110}
            stroke="var(--color-background)"
            isAnimationActive={false}
            onClick={onSelect ? (_, index) => onSelect(index) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.key} fill={colorAt(index)} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <ul aria-label={label} className="w-full min-w-0 flex-1 divide-y divide-border">
        {slices.map((slice, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-sm"
                style={{ backgroundColor: colorAt(index) }}
              />
              <span className="min-w-0 flex-1 break-words text-left">{slice.name}</span>
              <span className="tabular-nums">{formatCurrency(slice.total)}</span>
            </>
          )
          return (
            <li key={slice.key}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2 text-sm text-foreground">
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Expenses by category as a pie; selecting a slice (or its row) shows that category's
 * subcategories with a **Back** button. Uses the data already loaded, no second request. The page
 * remounts it (via `key`) when the period changes, which resets the drill-down.
 */
export function ExpensePie({ categories }: { categories: CategoryTotal[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = categories.find((category) => category.category_id === selectedId)

  if (selected) {
    return (
      <section
        aria-labelledby="expense-pie-heading"
        className="rounded-xl border border-border p-4"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="expense-pie-heading" className="text-lg font-semibold">
              {selected.name}
            </h2>
            <p className="text-sm text-muted">
              Category total:{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(selected.total)}
              </span>
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSelectedId(null)}>
            Back
          </Button>
        </div>
        <PieWithList
          label={`${selected.name} subcategories`}
          slices={selected.subcategories.map((sub) => ({
            key: String(sub.id),
            name: sub.name,
            total: sub.total,
          }))}
        />
      </section>
    )
  }

  return (
    <section aria-labelledby="expense-pie-heading" className="rounded-xl border border-border p-4">
      <h2 id="expense-pie-heading" className="mb-1 text-lg font-semibold">
        Expenses by category
      </h2>
      {categories.length === 0 ? (
        <p className="text-sm text-muted">
          No expenses in this period.{' '}
          <Link to="/transactions" className="font-medium text-primary underline">
            Add a transaction
          </Link>
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">Select a category to see its subcategories.</p>
          <PieWithList
            label="Expenses by category"
            slices={categories.map((category) => ({
              key: String(category.category_id),
              name: category.name,
              total: category.total,
            }))}
            onSelect={(index) => setSelectedId(categories[index].category_id)}
          />
        </>
      )}
    </section>
  )
}
