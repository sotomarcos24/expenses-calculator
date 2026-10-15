import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { SimulatorWorkspace } from '../components/SimulatorWorkspace.tsx'
import { useSimulatorDefaults } from '../hooks/useSimulator.ts'

export function SimulatorPage() {
  const { data, isPending, isError } = useSimulatorDefaults()

  return (
    <>
      <PageHeader title="Simulator" description="Project how your savings could grow." />
      <p className="mb-6 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
        Projections are estimates, not financial advice.
      </p>
      {isPending ? (
        <p role="status" className="text-sm text-muted">
          Loading your defaults…
        </p>
      ) : (
        <>
          {isError && (
            <div className="mb-4">
              <FormError message="Couldn't load your defaults. Enter the values yourself." />
            </div>
          )}
          <SimulatorWorkspace defaults={data} />
        </>
      )}
    </>
  )
}
