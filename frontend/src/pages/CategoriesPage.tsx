import { useRef, useState, type KeyboardEvent } from 'react'
import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'
import { Button } from '../components/Button.tsx'
import { CategoryTree, type TransactionTarget } from '../components/CategoryTree.tsx'
import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { PeriodSelector } from '../components/PeriodSelector.tsx'
import { TransactionFormDialog } from '../components/TransactionFormDialog.tsx'
import {
  useCategories,
  useCategoryTotals,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from '../hooks/useCategories.ts'
import { useToast } from '../hooks/useToast.ts'
import { MD_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery.ts'
import { DEFAULT_PERIOD, dashboardRange, type DashboardPeriod } from '../lib/dashboardPeriod.ts'
import { categoryErrorMessage } from '../lib/categoryErrors.ts'
import type { CategoryEditor } from '../lib/categoryEditor.ts'

type Section = 'expenses' | 'income'

const SECTION_OF_KIND: Record<CategoryKind, Section> = { expense: 'expenses', income: 'income' }

const SECTIONS: {
  key: Section
  kind: CategoryKind
  title: string
  label: string
  emptyMessage: string
}[] = [
  {
    key: 'expenses',
    kind: 'expense',
    title: 'Expenses',
    label: 'Expense categories',
    emptyMessage: 'No expense categories yet.',
  },
  {
    key: 'income',
    kind: 'income',
    title: 'Income',
    label: 'Income categories',
    emptyMessage: 'No income categories yet.',
  },
]

/**
 * The single inline editor of the page and the requests it triggers. Opening an editor replaces
 * the current one (discarding unsaved text and clearing its error). When a request settles, the
 * result is applied only if that editor is still the open one.
 */
function useCategoryEditor() {
  const toast = useToast()
  const [editor, setEditor] = useState<CategoryEditor | null>(null)
  const create = useCreateCategory()
  const rename = useRenameCategory()
  const remove = useDeleteCategory()
  const pending = create.isPending || rename.isPending || remove.isPending

  const settle = (started: CategoryEditor, next: CategoryEditor | null) =>
    setEditor((current) => (current === started ? next : current))

  const save = async (name: string) => {
    if (pending || (editor?.type !== 'add' && editor?.type !== 'rename')) {
      return
    }
    if (editor.type === 'rename' && name === editor.name) {
      setEditor(null)
      return
    }
    const started = { ...editor, error: undefined }
    setEditor(started)
    try {
      if (started.type === 'add') {
        await create.mutateAsync(
          started.parentId === null
            ? { name, kind: started.kind }
            : { name, kind: started.kind, parent_id: started.parentId },
        )
        toast.success(started.parentId === null ? 'Category added.' : 'Subcategory added.')
      } else {
        await rename.mutateAsync({ id: started.id, name })
        toast.success('Category renamed.')
      }
      settle(started, null)
    } catch (error) {
      settle(started, { ...started, error: categoryErrorMessage(error) })
    }
  }

  const confirmDelete = async () => {
    if (pending || editor?.type !== 'delete') {
      return
    }
    const started = editor
    try {
      await remove.mutateAsync(started.id)
      toast.success('Category deleted.')
      settle(started, null)
    } catch (error) {
      settle(started, { ...started, type: 'failed', error: categoryErrorMessage(error) })
    }
  }

  return {
    editor,
    pending,
    setEditor,
    save: (name: string) => void save(name),
    confirmDelete: () => void confirmDelete(),
  }
}

function CategoriesContent() {
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD)
  const range = dashboardRange(period)
  const totalsQuery = useCategoryTotals(range)
  const toast = useToast()
  const [target, setTarget] = useState<TransactionTarget | null>(null)
  const { isPending, isError, refetch, isFetching, expenses, income } = useCategories()
  const [active, setActive] = useState<Section>('expenses')
  const tabRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})
  const { editor, pending, setEditor, save, confirmDelete } = useCategoryEditor()
  // Desktop (md+) shows both sections side by side; below it they are tabs (one at a time).
  const isDesktop = useMediaQuery(MD_MEDIA_QUERY)
  const [wasDesktop, setWasDesktop] = useState(isDesktop)

  // Shrinking to mobile with an editor open in the hidden section: show that section instead.
  if (wasDesktop !== isDesktop) {
    setWasDesktop(isDesktop)
    if (!isDesktop && editor && SECTION_OF_KIND[editor.kind] !== active) {
      setActive(SECTION_OF_KIND[editor.kind])
    }
  }

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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="self-start"
        >
          Try again
        </Button>
      </div>
    )
  }

  const trees: Record<Section, CategoryTreeNode[]> = { expenses, income }

  // Totals of the selected period by category / subcategory id (ids are unique across both).
  const totals =
    range !== null && totalsQuery.data
      ? new Map(
          totalsQuery.data.flatMap((category) => [
            [category.category_id, category.total] as const,
            ...category.subcategories.map((sub) => [sub.id, sub.total] as const),
          ]),
        )
      : undefined

  // Switching to another tab discards the open editor, which would otherwise stay open, hidden.
  const activate = (next: Section) => {
    if (next === active) {
      return
    }
    setActive(next)
    setEditor(null)
  }

  // Tabs pattern (WAI-ARIA): Left/Right move between tabs.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const next: Section = active === 'expenses' ? 'income' : 'expenses'
    activate(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <>
      <PeriodSelector value={period} onChange={setPeriod} />
      {range !== null && totalsQuery.isPending && (
        <p role="status" className="mb-4 text-sm text-muted">
          Loading totals…
        </p>
      )}
      {range !== null && totalsQuery.isError && (
        <div className="mb-4 flex max-w-sm flex-col gap-3">
          <FormError message="Could not load totals." />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void totalsQuery.refetch()}
            disabled={totalsQuery.isFetching}
            className="self-start"
          >
            Try again
          </Button>
        </div>
      )}
      {/* Mobile only: one section at a time. Desktop (md+) shows both columns, with no tabs. */}
      {!isDesktop && (
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
                onClick={() => activate(section.key)}
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
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map((section) => {
          const selected = active === section.key
          return (
            <section
              key={section.key}
              role={isDesktop ? undefined : 'tabpanel'}
              id={`categories-panel-${section.key}`}
              aria-labelledby={`categories-heading-${section.key}`}
              data-state={isDesktop ? undefined : selected ? 'active' : 'inactive'}
              className={`min-w-0 rounded-xl border border-border bg-surface p-4 ${
                isDesktop || selected ? '' : 'hidden md:block'
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
                kind={section.kind}
                label={section.label}
                emptyMessage={section.emptyMessage}
                editor={editor}
                pending={pending}
                onEditorChange={setEditor}
                onSave={save}
                onConfirmDelete={confirmDelete}
                totals={totals}
                onAddTransaction={setTarget}
              />
            </section>
          )
        })}
      </div>
      {target && (
        <TransactionFormDialog
          transaction={null}
          defaults={{
            type: target.kind,
            category_id: String(target.categoryId),
            subcategory_id: target.subcategoryId === null ? '' : String(target.subcategoryId),
          }}
          lockCategory
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null)
            toast.success('Transaction saved.')
          }}
        />
      )}
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
