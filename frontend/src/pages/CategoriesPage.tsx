import { useRef, useState, type KeyboardEvent } from 'react'
import type { CategoryTreeNode } from '../api/types.ts'
import { CategoryTree } from '../components/CategoryTree.tsx'
import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { useCategories } from '../hooks/useCategories.ts'

type Section = 'expenses' | 'income'

const SECTIONS: { key: Section; title: string; label: string; emptyMessage: string }[] = [
  {
    key: 'expenses',
    title: 'Expenses',
    label: 'Expense categories',
    emptyMessage: 'No expense categories yet.',
  },
  {
    key: 'income',
    title: 'Income',
    label: 'Income categories',
    emptyMessage: 'No income categories yet.',
  },
]

function CategoriesContent() {
  const { isPending, isError, refetch, isFetching, expenses, income } = useCategories()
  const [active, setActive] = useState<Section>('expenses')
  const tabRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})

  if (isPending) {
    return (
      <p role="status" className="text-sm text-muted">
        Loading categories…
      </p>
    )
  }

  if (isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <FormError message="Could not load categories." />
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="self-start rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Try again
        </button>
      </div>
    )
  }

  const trees: Record<Section, CategoryTreeNode[]> = { expenses, income }

  // Tabs pattern (WAI-ARIA): Left/Right move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const next: Section = active === 'expenses' ? 'income' : 'expenses'
    setActive(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <>
      {/* Mobile only: one section at a time. Desktop (md+) shows both columns. */}
      <div
        role="tablist"
        aria-label="Category type"
        className="mb-4 flex gap-1 rounded-lg border border-border bg-surface p-1 md:hidden"
      >
        {SECTIONS.map((section) => {
          const selected = active === section.key
          return (
            <button
              key={section.key}
              ref={(element) => {
                tabRefs.current[section.key] = element
              }}
              type="button"
              role="tab"
              id={`categories-tab-${section.key}`}
              aria-selected={selected}
              aria-controls={`categories-panel-${section.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(section.key)}
              onKeyDown={onTabKeyDown}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted hover:bg-accent hover:text-primary'
              }`}
            >
              {section.title}
            </button>
          )
        })}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const selected = active === section.key
          return (
            <section
              key={section.key}
              role="tabpanel"
              id={`categories-panel-${section.key}`}
              aria-labelledby={`categories-heading-${section.key}`}
              data-state={selected ? 'active' : 'inactive'}
              className={`min-w-0 rounded-xl border border-border bg-surface p-4 ${
                selected ? '' : 'hidden md:block'
              }`}
            >
              <h2
                id={`categories-heading-${section.key}`}
                className="mb-2 text-lg font-semibold text-foreground"
              >
                {section.title}
              </h2>
              <CategoryTree
                categories={trees[section.key]}
                label={section.label}
                emptyMessage={section.emptyMessage}
              />
            </section>
          )
        })}
      </div>
    </>
  )
}

export function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organise transactions into categories and subcategories."
      />
      <CategoriesContent />
    </>
  )
}
