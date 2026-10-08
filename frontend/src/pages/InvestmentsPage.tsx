import { PageHeader } from '../components/PageHeader.tsx'
import { Placeholder } from '../components/Placeholder.tsx'

export function InvestmentsPage() {
  return (
    <>
      <PageHeader
        title="Investments"
        description="Track what you invested and what it is worth today."
      />
      <Placeholder milestone={5} />
    </>
  )
}
