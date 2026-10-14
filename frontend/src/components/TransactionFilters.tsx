import { useId, type ReactNode } from 'react'
import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'
import { periodRange, type PeriodPreset } from '../lib/periods.ts'
import {
  CLEARED_FILTERS,
  hasActiveFilters,
  isRangeInvalid,
  type TransactionFilterState,
} from '../lib/transactionFilters.ts'
import { Button } from './Button.tsx'

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
  { value: 'all-time', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

const CONTROL_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60'

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="w-full sm:w-44">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

type TransactionFiltersProps = {
  value: TransactionFilterState
  onChange: (next: TransactionFilterState) => void
  /** Top-level categories in API order (both kinds); empty while loading or on error. */
  categories: CategoryTreeNode[]
}

/** Period, type, category and subcategory filters of the Transactions page. */
export function TransactionFilters({ value, onChange, categories }: TransactionFiltersProps) {
  const expenses = categories.filter((category) => category.kind === 'expense')
  const income = categories.filter((category) => category.kind === 'income')
  const selectedCategory = categories.find((category) => category.id === value.categoryId)
  const subcategories = selectedCategory?.subcategories ?? []
  const rangeInvalid = isRangeInvalid(value)

  const changePreset = (preset: PeriodPreset) => {
    if (preset === 'custom' && value.preset !== 'custom') {
      // Pre-fill the custom range with the range of the preset that was active before.
      const range = periodRange(value.preset)
      onChange({ ...value, preset, from: range.from ?? '', to: range.to ?? '' })
    } else {
      onChange({ ...value, preset })
    }
  }

  const changeType = (type: CategoryKind | null) => {
    const keepCategory = type === null || !selectedCategory || selectedCategory.kind === type
    onChange(
      keepCategory ? { ...value, type } : { ...value, type, categoryId: null, subcategoryId: null },
    )
  }

  const categoryOptions = (list: CategoryTreeNode[]) =>
    list.map((category) => (
      <option key={category.id} value={category.id}>
        {category.name}
      </option>
    ))

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          {(id) => (
            <select
              id={id}
              className={CONTROL_CLASS}
              value={value.preset}
              onChange={(event) => changePreset(event.target.value as PeriodPreset)}
            >
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {value.preset === 'custom' && (
          <>
            <Field label="From">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  className={CONTROL_CLASS}
                  value={value.from}
                  aria-invalid={rangeInvalid || undefined}
                  aria-describedby={rangeInvalid ? 'transactions-range-error' : undefined}
                  onChange={(event) => onChange({ ...value, from: event.target.value })}
                />
              )}
            </Field>
            <Field label="To">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  className={CONTROL_CLASS}
                  value={value.to}
                  aria-invalid={rangeInvalid || undefined}
                  aria-describedby={rangeInvalid ? 'transactions-range-error' : undefined}
                  onChange={(event) => onChange({ ...value, to: event.target.value })}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Type">
          {(id) => (
            <select
              id={id}
              className={CONTROL_CLASS}
              value={value.type ?? ''}
              onChange={(event) =>
                changeType(event.target.value === '' ? null : (event.target.value as CategoryKind))
              }
            >
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          )}
        </Field>
        <Field label="Category">
          {(id) => (
            <select
              id={id}
              className={CONTROL_CLASS}
              value={value.categoryId ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  categoryId: event.target.value === '' ? null : Number(event.target.value),
                  subcategoryId: null,
                })
              }
            >
              <option value="">All categories</option>
              {value.type === null ? (
                <>
                  {expenses.length > 0 && (
                    <optgroup label="Expenses">{categoryOptions(expenses)}</optgroup>
                  )}
                  {income.length > 0 && (
                    <optgroup label="Income">{categoryOptions(income)}</optgroup>
                  )}
                </>
              ) : (
                categoryOptions(value.type === 'expense' ? expenses : income)
              )}
            </select>
          )}
        </Field>
        <Field label="Subcategory">
          {(id) => (
            <select
              id={id}
              className={CONTROL_CLASS}
              value={value.subcategoryId ?? ''}
              disabled={subcategories.length === 0}
              onChange={(event) =>
                onChange({
                  ...value,
                  subcategoryId: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            >
              <option value="">All subcategories</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {hasActiveFilters(value) && (
          <Button variant="secondary" onClick={() => onChange(CLEARED_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
      {rangeInvalid && (
        <p id="transactions-range-error" role="alert" className="text-sm text-loss">
          From must be on or before To
        </p>
      )}
    </div>
  )
}
