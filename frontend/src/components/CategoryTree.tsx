import { useId, useState } from 'react'
import type { CategoryTreeNode } from '../api/types.ts'

type CategoryTreeProps = {
  categories: CategoryTreeNode[]
  /** Accessible name of the list, e.g. "Expense categories". */
  label: string
  emptyMessage: string
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`size-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <path
        fillRule="evenodd"
        d="M7.2 14.8a.75.75 0 0 1 0-1.06L10.94 10 7.2 6.26a.75.75 0 1 1 1.06-1.06l4.27 4.27a.75.75 0 0 1 0 1.06L8.26 14.8a.75.75 0 0 1-1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/**
 * Two-level category tree. Top-level categories with subcategories get an expander button;
 * everything starts collapsed. Expanded state is keyed by category id, so it survives a refetch.
 * Categories are rendered in the given order (never re-sorted).
 */
export function CategoryTree({ categories, label, emptyMessage }: CategoryTreeProps) {
  const idPrefix = useId()
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  if (categories.length === 0) {
    return <p className="px-1 py-2 text-sm text-muted">{emptyMessage}</p>
  }

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  return (
    <ul aria-label={label} className="divide-y divide-border">
      {categories.map((category) => {
        const isExpanded = expanded.has(category.id)
        const listId = `${idPrefix}-subcategories-${category.id}`
        const hasChildren = category.subcategories.length > 0
        return (
          <li key={category.id} className="py-1">
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={listId}
                onClick={() => toggle(category.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium text-foreground hover:bg-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Chevron expanded={isExpanded} />
                <span className="min-w-0 break-words">{category.name}</span>
              </button>
            ) : (
              <p className="flex min-w-0 items-center gap-2 px-1 py-2 text-sm font-medium text-foreground">
                {/* Keeps the name aligned with the names that have a chevron. */}
                <span aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 break-words">{category.name}</span>
              </p>
            )}
            {hasChildren && (
              <ul
                id={listId}
                aria-label={`${category.name} subcategories`}
                hidden={!isExpanded}
                className="mb-1 ml-7 border-l border-border pl-3"
              >
                {category.subcategories.map((subcategory) => (
                  <li
                    key={subcategory.id}
                    className="min-w-0 py-1.5 text-sm break-words text-muted"
                  >
                    {subcategory.name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
