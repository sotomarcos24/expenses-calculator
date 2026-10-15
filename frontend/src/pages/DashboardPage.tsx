import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/Button.tsx'
import { ExpensePie } from '../components/ExpensePie.tsx'
import { FormError } from '../components/FormError.tsx'
import { InvestmentsBlock } from '../components/InvestmentsBlock.tsx'
import { KpiCards } from '../components/KpiCards.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { PeriodSelector } from '../components/PeriodSelector.tsx'
import { useDashboard } from '../hooks/useDashboard.ts'
import { DEFAULT_PERIOD, dashboardRange, type DashboardPeriod } from '../lib/dashboardPeriod.ts'

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD)
  const range = dashboardRange(period)
  const { data, isPending, isError, isFetching, refetch } = useDashboard(range)

  let content = null
  if (range === null) {
    content = null
  } else if (isError) {
    content = (
      <div className="flex max-w-sm flex-col gap-3">
        <FormError message="Couldn't load the dashboard." />
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
  } else if (isPending) {
    content = (
      <p role="status" className="text-sm text-muted">
        Loading dashboard…
      </p>
    )
  } else {
    content = (
      <>
        <KpiCards data={data} />
        <ExpensePie key={`${range.from}:${range.to}`} categories={data.expenses_by_category} />
        <InvestmentsBlock investments={data.investments} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Your financial situation at a glance." />
      <p className="mb-4">
        <Link
          to="/simulator"
          className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
        >
          Open the simulator
        </Link>
      </p>
      <PeriodSelector value={period} onChange={setPeriod} />
      {content}
    </>
  )
}
