import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { InvestmentTable } from '../components/InvestmentTable.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { PortfolioTotalsCard } from '../components/PortfolioTotalsCard.tsx'
import { useInvestments } from '../hooks/useInvestments.ts'

function StatusText({ children }: { children: string }) {
  return (
    <p role="status" className="text-sm text-muted">
      {children}
    </p>
  )
}

function InvestmentsContent() {
  const { data, isPending, isError, isFetching, refetch } = useInvestments()

  if (isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <FormError message="Couldn't load investments." />
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
  if (isPending) {
    return <StatusText>Loading investments…</StatusText>
  }
  if (data.items.length === 0) {
    return <StatusText>No investments yet.</StatusText>
  }
  return (
    <>
      <PortfolioTotalsCard totals={data.totals} />
      <InvestmentTable investments={data.items} />
    </>
  )
}

export function InvestmentsPage() {
  return (
    <>
      <PageHeader
        title="Investments"
        description="Track what you invested and what it is worth today."
      />
      <InvestmentsContent />
    </>
  )
}
