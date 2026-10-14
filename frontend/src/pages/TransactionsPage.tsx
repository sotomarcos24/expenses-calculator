import { useRef, useState } from 'react'
import type { TransactionRead } from '../api/types.ts'
import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { TransactionFilters } from '../components/TransactionFilters.tsx'
import { TransactionFormDialog } from '../components/TransactionFormDialog.tsx'
import { TransactionTable } from '../components/TransactionTable.tsx'
import { useCategories } from '../hooks/useCategories.ts'
import {
  TRANSACTIONS_PAGE_SIZE,
  useTransactions,
  useTransactionsTotal,
} from '../hooks/useTransactions.ts'
import {
  CLEARED_FILTERS,
  DEFAULT_FILTERS,
  filtersToParams,
  hasActiveFilters,
  type TransactionFilterState,
} from '../lib/transactionFilters.ts'

function StatusText({ children }: { children: string }) {
  return (
    <p role="status" className="text-sm text-muted">
      {children}
    </p>
  )
}

type TransactionsContentProps = {
  onAdd: () => void
  onEdit: (transaction: TransactionRead) => void
}

function NoTransactionsYet({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <StatusText>No transactions yet.</StatusText>
      <Button size="sm" onClick={onAdd}>
        Add transaction
      </Button>
    </div>
  )
}

function TransactionsContent({ onAdd, onEdit }: TransactionsContentProps) {
  const [filters, setFilters] = useState<TransactionFilterState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const { data: categories = [], isSuccess: categoriesLoaded } = useCategories()

  const filterParams = filtersToParams(filters)
  const transactions = useTransactions(filterParams && { ...filterParams, page })
  const { data, isPending, isError, isFetching, isPlaceholderData, refetch } = transactions

  const filtered = hasActiveFilters(filters)
  const settledEmpty = data !== undefined && !isPlaceholderData && data.items.length === 0
  // Only an empty filtered result needs the unfiltered total, to pick the right empty message.
  const overall = useTransactionsTotal(settledEmpty && data.total === 0 && filtered)

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / TRANSACTIONS_PAGE_SIZE))
  // A page past the end (e.g. its last row was deleted elsewhere): move to the last page.
  if (settledEmpty && data.total > 0 && page !== pages) {
    setPage(pages)
  }

  const changeFilters = (next: TransactionFilterState) => {
    setFilters(next)
    setPage(1)
  }

  const clearFilters = () => changeFilters(CLEARED_FILTERS)

  const renderResults = () => {
    if (filterParams === null) {
      return null
    }
    if (isError) {
      return (
        <div className="flex max-w-sm flex-col gap-3">
          <FormError message="Couldn't load transactions." />
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
    if (isPending || data === undefined) {
      return <StatusText>Loading transactions…</StatusText>
    }
    if (data.items.length === 0) {
      if (data.total > 0) {
        // Out-of-range page: the last page is being loaded.
        return <StatusText>Loading transactions…</StatusText>
      }
      if (!filtered) {
        return <NoTransactionsYet onAdd={onAdd} />
      }
      if (overall.isPending) {
        return <StatusText>Loading transactions…</StatusText>
      }
      if (overall.data === 0) {
        return <NoTransactionsYet onAdd={onAdd} />
      }
      return (
        <div className="flex flex-col items-start gap-3">
          <StatusText>No transactions match these filters.</StatusText>
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )
    }
    return (
      <>
        <p className="mb-2 text-sm text-muted">
          {data.total === 1 ? '1 transaction' : `${data.total} transactions`}
        </p>
        <TransactionTable transactions={data.items} onEdit={onEdit} />
        {data.total > TRANSACTIONS_PAGE_SIZE && (
          <Pagination page={page} pages={pages} disabled={isFetching} onPageChange={setPage} />
        )}
      </>
    )
  }

  return (
    <>
      <TransactionFilters
        value={filters}
        onChange={changeFilters}
        categories={categoriesLoaded ? categories : []}
      />
      {renderResults()}
    </>
  )
}

/** Which form dialog is open: none, a new transaction, or the edit of a row. */
type DialogState =
  { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; transaction: TransactionRead }

export function TransactionsPage() {
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [saved, setSaved] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const open = (next: DialogState) => {
    setSaved(false)
    setDialog(next)
  }
  const close = () => setDialog({ mode: 'closed' })
  const onAdd = () => open({ mode: 'create' })

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Record your income and expenses."
        actions={
          <Button ref={addButtonRef} onClick={onAdd}>
            Add transaction
          </Button>
        }
      />
      {/* Always rendered so the confirmation is announced; it matters when the saved transaction
          falls outside the current filters and does not show in the list. */}
      <p role="status" className={saved ? 'mb-4 text-sm text-foreground' : 'sr-only'}>
        {saved ? 'Transaction saved.' : ''}
      </p>
      <TransactionsContent
        onAdd={onAdd}
        onEdit={(transaction) => open({ mode: 'edit', transaction })}
      />
      {dialog.mode !== 'closed' && (
        <TransactionFormDialog
          transaction={dialog.mode === 'edit' ? dialog.transaction : null}
          onClose={close}
          onSaved={() => {
            close()
            setSaved(true)
          }}
          fallbackFocusRef={addButtonRef}
        />
      )}
    </>
  )
}
