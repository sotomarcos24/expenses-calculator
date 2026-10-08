import { PageHeader } from '../components/PageHeader.tsx'
import { Placeholder } from '../components/Placeholder.tsx'

export function SimulatorPage() {
  return (
    <>
      <PageHeader title="Simulator" description="Project how your savings could grow." />
      <Placeholder milestone={7} />
    </>
  )
}
