import { PageHeader } from '../components/PageHeader.tsx'
import { Placeholder } from '../components/Placeholder.tsx'

export function TransactionsPage() {
  return (
    <>
      <PageHeader title="Transactions" description="Record your income and expenses." />
      <Placeholder milestone={4} />
    </>
  )
}
