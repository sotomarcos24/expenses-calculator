import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { SimulatorWorkspace } from '../components/SimulatorWorkspace.tsx'
import { useSimulatorDefaults } from '../hooks/useSimulator.ts'

export function SimulatorPage() {
  const { data, isPending, isError, isFetching, refetch } = useSimulatorDefaults()

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
            <div className="mb-4 flex flex-col items-start gap-3">
              <FormError message="Couldn't load your defaults. Enter the values yourself." />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                Try again
              </Button>
            </div>
          )}
          {/* Remounted when a retry brings the defaults, so the form is pre-filled with them. */}
          <SimulatorWorkspace key={data ? 'loaded' : 'empty'} defaults={data} />
        </>
      )}
    </>
  )
}
