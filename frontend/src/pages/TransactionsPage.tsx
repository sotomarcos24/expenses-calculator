import { useState } from 'react'
import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { Pagination } from '../components/Pagination.tsx'
import { TransactionFilters } from '../components/TransactionFilters.tsx'
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

function TransactionsContent() {
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
        return <StatusText>No transactions yet.</StatusText>
      }
      if (overall.isPending) {
        return <StatusText>Loading transactions…</StatusText>
      }
      if (overall.data === 0) {
        return <StatusText>No transactions yet.</StatusText>
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
        <TransactionTable transactions={data.items} />
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

export function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transactions" description="Record your income and expenses." />
      <TransactionsContent />
    </>
  )
}
