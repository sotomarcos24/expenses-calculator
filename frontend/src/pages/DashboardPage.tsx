import { PageHeader } from '../components/PageHeader.tsx'
import { Placeholder } from '../components/Placeholder.tsx'

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your financial situation at a glance." />
      <Placeholder milestone={6} />
    </>
  )
}
