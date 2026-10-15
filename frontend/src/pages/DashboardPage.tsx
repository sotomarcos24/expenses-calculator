import { useState } from 'react'
import { Button } from '../components/Button.tsx'
import { ExpensePie } from '../components/ExpensePie.tsx'
import { FormError } from '../components/FormError.tsx'
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
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Your financial situation at a glance." />
      <PeriodSelector value={period} onChange={setPeriod} />
      {content}
    </>
  )
}
